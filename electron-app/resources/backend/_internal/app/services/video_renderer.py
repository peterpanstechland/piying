"""
Video rendering service for shadow puppet overlay

This module supports three rendering modes:
1. Video overlay (preferred): Uses pre-recorded canvas video from frontend, overlaid with FFmpeg
2. Spritesheet-based rendering (PuppetRenderer): Uses actual character sprites with pose-driven animation
3. Skeleton fallback: Draws simple skeleton lines when no character spritesheet is available
"""
import cv2
import numpy as np
import logging
import time
import subprocess
import shutil
from pathlib import Path
from typing import Optional, List, Tuple
from ..models import Session, Segment, PoseFrame
from ..config import SceneConfig
from ..utils.logger import log_render_performance, log_error_with_context
from .puppet_renderer import PuppetRenderer, PuppetRendererCache

logger = logging.getLogger(__name__)


class CharacterPath:
    """Calculates character position offsets based on time and path configuration"""
    
    def __init__(self, offset_start: List[int], offset_end: List[int], duration: float, 
                 waypoints: List[List[int]] = None, path_draw_type: str = "linear"):
        """
        Initialize CharacterPath
        
        Args:
            offset_start: Starting offset [x, y]
            offset_end: Ending offset [x, y]
            duration: Duration of this path segment in seconds
            waypoints: Optional waypoints for complex paths [[x1,y1], [x2,y2], ...]
            path_draw_type: Type of path drawing: 'linear', 'bezier', 'freehand'
        """
        self.offset_start = np.array(offset_start, dtype=float)
        self.offset_end = np.array(offset_end, dtype=float)
        self.duration = duration
        self.waypoints = [np.array(wp, dtype=float) for wp in (waypoints or [])]
        self.path_draw_type = path_draw_type
    
    def get_offset(self, time: float) -> Tuple[int, int]:
        """
        Get position offset at a specific time within this path segment
        
        Args:
            time: Time within segment (0 to duration)
            
        Returns:
            Tuple of (x_offset, y_offset)
        """
        if time <= 0:
            return int(self.offset_start[0]), int(self.offset_start[1])
        if time >= self.duration:
            return int(self.offset_end[0]), int(self.offset_end[1])
        
        progress = time / self.duration
        
        # Use waypoints if available
        if self.waypoints:
            offset = self._interpolate_with_waypoints(progress)
        else:
            # Linear interpolation
            offset = self.offset_start + (self.offset_end - self.offset_start) * progress
        return int(offset[0]), int(offset[1])
    
    def _interpolate_with_waypoints(self, progress: float) -> np.ndarray:
        """
        Interpolate position using waypoints
        
        Args:
            progress: Progress from 0 to 1
            
        Returns:
            Interpolated offset as numpy array
        """
        # Build full path: start -> waypoints -> end
        all_points = [self.offset_start] + self.waypoints + [self.offset_end]
        
        if len(all_points) < 2:
            return self.offset_start
        
        # Calculate segment length
        segment_count = len(all_points) - 1
        segment_index = min(int(progress * segment_count), segment_count - 1)
        segment_progress = (progress * segment_count) - segment_index
        
        # Linear interpolation between waypoints
        start_point = all_points[segment_index]
        end_point = all_points[segment_index + 1]
        
        return start_point + (end_point - start_point) * segment_progress


class VideoRenderer:
    """Renders shadow puppet video by overlaying pose data on base video"""
    
    # MediaPipe Pose landmark connections for skeleton drawing
    POSE_CONNECTIONS = [
        # Torso
        (11, 12),  # Shoulders
        (11, 23),  # Left shoulder to left hip
        (12, 24),  # Right shoulder to right hip
        (23, 24),  # Hips
        
        # Left arm
        (11, 13),  # Left shoulder to left elbow
        (13, 15),  # Left elbow to left wrist
        
        # Right arm
        (12, 14),  # Right shoulder to right elbow
        (14, 16),  # Right elbow to right wrist
        
        # Left leg
        (23, 25),  # Left hip to left knee
        (25, 27),  # Left knee to left ankle
        
        # Right leg
        (24, 26),  # Right hip to right knee
        (26, 28),  # Right knee to right ankle
        
        # Head
        (0, 1),    # Nose to left eye inner
        (0, 4),    # Nose to right eye inner
        (1, 2),    # Left eye inner to left eye
        (4, 5),    # Right eye inner to right eye
        (2, 3),    # Left eye to left eye outer
        (5, 6),    # Right eye to right eye outer
        (0, 11),   # Nose to left shoulder (approximate neck)
        (0, 12),   # Nose to right shoulder (approximate neck)
    ]
    
    def _calculate_animation_alpha(self, segment_time: float, segment_duration: float, 
                                   entry_type: str, entry_duration: float, entry_delay: float,
                                   exit_type: str, exit_duration: float, exit_delay: float) -> float:
        """
        Calculate alpha (opacity) value based on entry/exit animations
        
        Args:
            segment_time: Current time within segment (seconds)
            segment_duration: Total segment duration (seconds)
            entry_type: Entry animation type ('instant', 'fade', 'slide')
            entry_duration: Entry animation duration (seconds)
            entry_delay: Entry animation delay (seconds)
            exit_type: Exit animation type ('instant', 'fade', 'slide')
            exit_duration: Exit animation duration (seconds)
            exit_delay: Exit animation delay (seconds)
            
        Returns:
            Alpha value from 0.0 (transparent) to 1.0 (opaque)
        """
        # Entry phase
        if segment_time < entry_delay:
            # Before entry starts - invisible
            return 0.0
        elif segment_time < entry_delay + entry_duration:
            # During entry animation
            if entry_type == 'instant':
                return 1.0
            elif entry_type in ['fade', 'slide']:
                # Linear fade in
                progress = (segment_time - entry_delay) / entry_duration
                return progress
            else:
                return 1.0
        
        # Exit phase
        exit_start_time = segment_duration - exit_duration - exit_delay
        if segment_time >= exit_start_time + exit_delay:
            # During exit animation
            if exit_type == 'instant':
                return 0.0
            elif exit_type in ['fade', 'slide']:
                # Linear fade out
                time_in_exit = segment_time - (exit_start_time + exit_delay)
                progress = 1.0 - (time_in_exit / exit_duration)
                return max(0.0, progress)
            else:
                return 1.0
        elif segment_time >= exit_start_time:
            # In exit delay period - still visible
            return 1.0
        
        # Middle phase - fully visible
        return 1.0
    
    def __init__(self, scene_config: SceneConfig, output_dir: str = None, character_id: str = None):
        """
        Initialize VideoRenderer
        
        Args:
            scene_config: Scene configuration with base video and segment settings
            output_dir: Directory for output videos (default: project_root/data/outputs)
            character_id: Optional character ID for spritesheet-based rendering
        """
        self.scene_config = scene_config
        self.character_id = character_id
        
        # Get project root directory
        self.project_root = Path(__file__).parent.parent.parent.parent
        
        # Set output directory relative to project root
        if output_dir:
            self.output_dir = Path(output_dir)
        else:
            self.output_dir = self.project_root / "data" / "outputs"
        
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Video properties (will be set when loading base video)
        self.frame_width = 0
        self.frame_height = 0
        self.fps = 30
        
        # Puppet renderer for spritesheet-based rendering
        self.puppet_renderer: Optional[PuppetRenderer] = None
        self.use_puppet_renderer = False
        
        # Try to load puppet renderer if character_id is provided
        if character_id:
            self._init_puppet_renderer(character_id)
    
    def _init_puppet_renderer(self, character_id: str) -> None:
        """
        Initialize puppet renderer for character spritesheet rendering.
        
        Args:
            character_id: Character UUID
        """
        try:
            data_dir = self.project_root / "backend" / "data"
            self.puppet_renderer = PuppetRendererCache.get_renderer(character_id, data_dir)
            
            if self.puppet_renderer:
                self.use_puppet_renderer = True
                logger.info(f"Puppet renderer loaded for character {character_id}")
            else:
                logger.warning(f"Failed to load puppet renderer for character {character_id}, falling back to skeleton")
        except Exception as e:
            logger.warning(f"Error initializing puppet renderer: {e}, falling back to skeleton")
            self.puppet_renderer = None
            self.use_puppet_renderer = False
    
    def render_video(self, session: Session) -> str:
        """
        Render final video with shadow puppet overlay
        
        Rendering priority:
        1. If all segments have video_path, use FFmpeg overlay (fastest, exact match with frontend)
        2. Otherwise, use frame-by-frame rendering with PuppetRenderer or skeleton fallback
        
        Args:
            session: Session with all segment data
            
        Returns:
            Path to rendered video file
            
        Raises:
            ValueError: If base video cannot be loaded or rendering fails
        """
        start_time = time.time()
        
        logger.info(
            f"Starting video rendering for session {session.id}",
            extra={"context": {"session_id": session.id, "scene_id": session.scene_id, "character_id": session.character_id}}
        )
        
        # Check if all segments have pre-recorded video files
        all_segments_have_video = all(
            segment.video_path and Path(segment.video_path).exists()
            for segment in session.segments
        ) if session.segments else False
        
        if all_segments_have_video:
            logger.info("All segments have video files, using FFmpeg overlay rendering")
            try:
                return self._render_with_ffmpeg_overlay(session, start_time)
            except Exception as e:
                logger.warning(f"FFmpeg overlay rendering failed: {e}, falling back to frame-by-frame rendering")
        
        # Initialize puppet renderer if session has character_id and we haven't loaded it yet
        if session.character_id and not self.use_puppet_renderer:
            self._init_puppet_renderer(session.character_id)
        
        # Determine which video to use as base
        base_video_path = self._get_base_video_path(session)
        
        if not base_video_path.exists():
            error_msg = f"Video file not found: {base_video_path}"
            logger.error(
                error_msg,
                extra={"context": {"session_id": session.id, "video_path": str(base_video_path)}}
            )
            raise ValueError(error_msg)
        
        cap = cv2.VideoCapture(str(base_video_path))
        if not cap.isOpened():
            error_msg = f"Failed to open base video: {base_video_path}"
            logger.error(
                error_msg,
                extra={"context": {"session_id": session.id, "base_video_path": base_video_path}}
            )
            raise ValueError(error_msg)
        
        # Get video properties
        self.frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.fps = int(cap.get(cv2.CAP_PROP_FPS))
        if self.fps == 0:
            self.fps = 30  # Default fallback
        
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        logger.info(f"Base video: {self.frame_width}x{self.frame_height} @ {self.fps} FPS, {total_frames} frames")
        
        # Prepare output video
        output_path = self.output_dir / f"final_{session.id}.mp4"
        
        # Try multiple codec options for better compatibility
        codec_options = [
            ('mp4v', 'MP4V codec'),  # MPEG-4 Part 2
            ('MJPG', 'MJPEG codec'),  # Motion JPEG
            ('DIVX', 'DIVX codec'),   # DIVX
            ('avc1', 'H.264 codec'),  # H.264 (fallback)
        ]
        
        out = None
        for codec_code, codec_name in codec_options:
            try:
                fourcc = cv2.VideoWriter_fourcc(*codec_code)
                test_out = cv2.VideoWriter(
                    str(output_path),
                    fourcc,
                    self.fps,
                    (self.frame_width, self.frame_height)
                )
                if test_out.isOpened():
                    out = test_out
                    logger.info(f"Using {codec_name} ({codec_code}) for video encoding")
                    break
                else:
                    test_out.release()
            except Exception as e:
                logger.warning(f"Failed to initialize {codec_name}: {e}")
                continue
        
        if out is None or not out.isOpened():
            cap.release()
            raise ValueError("Failed to create output video writer with any available codec")
        
        # Build character paths for each segment
        character_paths = []
        for i, segment_config in enumerate(self.scene_config.segments):
            path = CharacterPath(
                segment_config.offset_start,
                segment_config.offset_end,
                segment_config.duration,
                waypoints=segment_config.path_waypoints,
                path_draw_type=segment_config.path_draw_type
            )
            character_paths.append(path)
        
        # Render each frame
        frame_count = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Calculate global time in seconds
            global_time = frame_count / self.fps
            
            # Get pose data for this time
            pose_frame = self._map_pose_to_frame(global_time, session.segments)
            
            # Draw puppet if pose data exists
            if pose_frame is not None:
                # Determine which segment we're in
                segment_index, segment_time = self._get_segment_at_time(global_time, session.segments)
                
                if segment_index is not None and segment_index < len(character_paths):
                    # Get segment config for animation parameters
                    segment_config = self.scene_config.segments[segment_index]
                    
                    # Calculate alpha based on entry/exit animations
                    alpha = self._calculate_animation_alpha(
                        segment_time,
                        segment_config.duration,
                        segment_config.entry_type,
                        segment_config.entry_duration,
                        segment_config.entry_delay,
                        segment_config.exit_type,
                        segment_config.exit_duration,
                        segment_config.exit_delay
                    )
                    
                    # Only draw if alpha > 0
                    if alpha > 0.0:
                        # Get character offset for this time
                        offset = character_paths[segment_index].get_offset(segment_time)
                        
                        # Draw shadow puppet with alpha
                        # Use spritesheet-based rendering if puppet renderer is available
                        if self.use_puppet_renderer and self.puppet_renderer:
                            frame = self._draw_puppet_sprite(frame, pose_frame.landmarks, offset, alpha)
                        else:
                            # Fallback to skeleton drawing
                            frame = self._draw_puppet_skeleton(frame, pose_frame.landmarks, offset, alpha)
            
            # Write frame to output
            out.write(frame)
            frame_count += 1
        
        # Release resources
        cap.release()
        out.release()
        
        # Calculate performance metrics
        end_time = time.time()
        duration_seconds = end_time - start_time
        
        # Get output file size
        output_file_size_mb = 0.0
        if output_path.exists():
            output_file_size_mb = output_path.stat().st_size / (1024 * 1024)
        
        # Log performance metrics
        log_render_performance(
            logger,
            session.id,
            duration_seconds,
            output_file_size_mb,
            frame_count,
            scene_id=session.scene_id,
            resolution=f"{self.frame_width}x{self.frame_height}",
            fps=self.fps
        )
        
        logger.info(f"Video rendering completed: {output_path} ({frame_count} frames)")
        
        return str(output_path)
    
    def _map_pose_to_frame(self, global_time: float, segments: List[Segment]) -> Optional[PoseFrame]:
        """
        Map global video time to corresponding pose frame
        
        Args:
            global_time: Time in seconds from start of video
            segments: List of recorded segments
            
        Returns:
            PoseFrame if found, None if no pose data for this time
        """
        # Calculate cumulative time windows for each segment
        cumulative_time = 0.0
        
        for segment in segments:
            segment_start = cumulative_time
            segment_end = cumulative_time + segment.duration
            
            # Check if global_time falls within this segment's window
            if segment_start <= global_time < segment_end:
                # Time within this segment
                segment_time = global_time - segment_start
                segment_time_ms = segment_time * 1000  # Convert to milliseconds
                
                # Find closest frame by timestamp
                if not segment.frames:
                    return None
                
                closest_frame = None
                min_diff = float('inf')
                
                for frame in segment.frames:
                    diff = abs(frame.timestamp - segment_time_ms)
                    if diff < min_diff:
                        min_diff = diff
                        closest_frame = frame
                
                return closest_frame
            
            cumulative_time += segment.duration
        
        return None
    
    def _get_segment_at_time(self, global_time: float, segments: List[Segment]) -> Tuple[Optional[int], float]:
        """
        Get segment index and local time for a global time
        
        Args:
            global_time: Time in seconds from start of video
            segments: List of recorded segments
            
        Returns:
            Tuple of (segment_index, segment_time) or (None, 0.0) if not found
        """
        cumulative_time = 0.0
        
        for i, segment in enumerate(segments):
            segment_start = cumulative_time
            segment_end = cumulative_time + segment.duration
            
            if segment_start <= global_time < segment_end:
                segment_time = global_time - segment_start
                return i, segment_time
            
            cumulative_time += segment.duration
        
        return None, 0.0
    
    def _draw_puppet_sprite(
        self,
        frame: np.ndarray,
        landmarks: List[List[float]],
        offset: Tuple[int, int],
        alpha: float = 1.0
    ) -> np.ndarray:
        """
        Draw shadow puppet using spritesheet-based rendering.
        
        Args:
            frame: Video frame to draw on
            landmarks: Pose landmarks as list of [x, y, z, visibility]
            offset: Position offset (x, y) for character placement
            alpha: Opacity value from 0.0 (transparent) to 1.0 (opaque)
            
        Returns:
            Frame with puppet drawn
        """
        if not self.puppet_renderer:
            return frame
        
        # Calculate target height based on frame height
        target_height = int(self.frame_height * 0.6)  # 60% of frame height
        
        try:
            frame = self.puppet_renderer.render(
                frame,
                landmarks,
                offset=offset,
                alpha=alpha,
                target_height=target_height
            )
        except Exception as e:
            logger.warning(f"Puppet sprite rendering failed: {e}, falling back to skeleton")
            frame = self._draw_puppet_skeleton(frame, landmarks, offset, alpha)
        
        return frame
    
    def _draw_puppet_skeleton(
        self,
        frame: np.ndarray,
        landmarks: List[List[float]],
        offset: Tuple[int, int],
        alpha: float = 1.0
    ) -> np.ndarray:
        """
        Draw shadow puppet skeleton on frame with alpha blending (fallback method).
        
        Args:
            frame: Video frame to draw on
            landmarks: Pose landmarks as list of [x, y, z, visibility]
            offset: Position offset (x, y) for character placement
            alpha: Opacity value from 0.0 (transparent) to 1.0 (opaque)
            
        Returns:
            Frame with puppet drawn
        """
        if not landmarks or len(landmarks) < 33:
            # MediaPipe Pose has 33 landmarks
            return frame
        
        if alpha <= 0.0:
            return frame
        
        # Create overlay for alpha blending
        overlay = frame.copy()
        
        # Convert normalized coordinates to pixel coordinates
        h, w = frame.shape[:2]
        points = []
        
        for landmark in landmarks:
            if len(landmark) < 4:
                points.append(None)
                continue
            
            x, y, z, visibility = landmark
            
            # Skip if visibility is too low
            if visibility < 0.5:
                points.append(None)
                continue
            
            # Convert to pixel coordinates and apply offset
            px = int(x * w) + offset[0]
            py = int(y * h) + offset[1]
            
            # Clamp to frame bounds
            px = max(0, min(w - 1, px))
            py = max(0, min(h - 1, py))
            
            points.append((px, py))
        
        # Draw connections (skeleton) on overlay
        for connection in self.POSE_CONNECTIONS:
            start_idx, end_idx = connection
            
            if start_idx >= len(points) or end_idx >= len(points):
                continue
            
            start_point = points[start_idx]
            end_point = points[end_idx]
            
            if start_point is None or end_point is None:
                continue
            
            # Draw line with shadow puppet style (black with slight transparency)
            # Create shadow effect by drawing thicker black line first
            cv2.line(overlay, start_point, end_point, (0, 0, 0), 8, cv2.LINE_AA)
            # Then draw thinner colored line on top
            cv2.line(overlay, start_point, end_point, (50, 50, 50), 5, cv2.LINE_AA)
        
        # Draw joints as circles on overlay
        for point in points:
            if point is None:
                continue
            
            # Draw shadow
            cv2.circle(overlay, point, 8, (0, 0, 0), -1, cv2.LINE_AA)
            # Draw joint
            cv2.circle(overlay, point, 5, (50, 50, 50), -1, cv2.LINE_AA)
        
        # Blend overlay with original frame using alpha
        cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
        
        return frame
    
    def _render_with_ffmpeg_overlay(self, session: Session, start_time: float) -> str:
        """
        Render video using FFmpeg to overlay pre-recorded canvas videos.
        
        This method is much faster and produces exact match with frontend rendering
        since it uses the actual recorded canvas output.
        
        The overlay is positioned at the correct time offset (segment.start_time)
        and the full background video is preserved.
        
        Args:
            session: Session with segment data containing video_path
            start_time: Start time for performance measurement
            
        Returns:
            Path to rendered video file
        """
        # Check if FFmpeg is available
        ffmpeg_path = shutil.which("ffmpeg")
        if not ffmpeg_path:
            raise RuntimeError("FFmpeg not found in PATH")
        
        # Determine base video path
        base_video_path = self._get_base_video_path(session)
        
        # Prepare output path
        output_path = self.output_dir / f"final_{session.id}.mp4"
        
        # Get segment timing info from scene config
        segment_configs = self.scene_config.segments if self.scene_config else []
        
        # Build filter complex for all segments
        # Each segment overlay is enabled only during its time range
        if len(session.segments) == 1:
            segment = session.segments[0]
            overlay_video = Path(segment.video_path)
            
            # Get start_time from scene config (segment index matches)
            seg_start_time = 0.0
            if segment_configs and len(segment_configs) > segment.index:
                seg_start_time = getattr(segment_configs[segment.index], 'start_time', 0.0) or 0.0
            
            logger.info(f"Single segment overlay at start_time={seg_start_time}")
            
            # FFmpeg command to overlay with chromakey (green screen removal)
            # Canvas uses green background (0x00ff00) for chromakey
            # format=yuva420p ensures alpha channel is preserved after chromakey
            # scale2ref ensures the overlay matches the base video resolution
            filter_complex = (
                f"[1:v]chromakey=0x00ff00:0.15:0.1,format=yuva420p,setpts=PTS+{seg_start_time}/TB[fg_key];"
                f"[fg_key][0:v]scale2ref[fg][bg];"
                f"[bg][fg]overlay=0:0:format=auto:eof_action=pass:enable='between(t,{seg_start_time},{seg_start_time}+{segment.duration})'[out]"
            )
            
            cmd = [
                ffmpeg_path,
                "-y",  # Overwrite output
                "-i", str(base_video_path),  # Base video (full length)
                "-i", str(overlay_video),  # Overlay video (with green background)
                "-filter_complex", filter_complex,
                "-map", "[out]",
                "-map", "0:a?",  # Keep audio from base video if exists
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "128k",
                str(output_path)
            ]
            
            logger.info(f"Running FFmpeg overlay: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode != 0:
                logger.error(f"FFmpeg failed: {result.stderr}")
                raise RuntimeError(f"FFmpeg overlay failed: {result.stderr}")
        else:
            # Multiple segments - overlay each at its correct time position
            temp_dir = self.output_dir / "temp" / session.id
            temp_dir.mkdir(parents=True, exist_ok=True)
            
            # Build complex filter for multiple overlays
            # Each segment gets its own overlay at the correct time
            inputs = ["-i", str(base_video_path)]
            filter_parts = []
            current_stream = "[0:v]"
            
            sorted_segments = sorted(session.segments, key=lambda s: s.index)
            
            for i, segment in enumerate(sorted_segments):
                overlay_video = Path(segment.video_path)
                inputs.extend(["-i", str(overlay_video)])
                
                # Get start_time from scene config
                seg_start_time = 0.0
                if segment_configs and len(segment_configs) > segment.index:
                    seg_start_time = getattr(segment_configs[segment.index], 'start_time', 0.0) or 0.0
                
                input_idx = i + 1  # Input index (0 is base video)
                
                # Apply chromakey and time offset to this segment
                # Canvas uses green background (0x00ff00) for chromakey
                filter_parts.append(
                    f"[{input_idx}:v]chromakey=0x00ff00:0.15:0.1,format=yuva420p,setpts=PTS+{seg_start_time}/TB[key{i}]"
                )
                
                # Scale to match current stream (background)
                filter_parts.append(
                    f"[key{i}]{current_stream}scale2ref[fg{i}][bg{i}]"
                )
                
                # Overlay at the correct time
                output_stream = f"[tmp{i}]" if i < len(sorted_segments) - 1 else "[out]"
                filter_parts.append(
                    f"[bg{i}][fg{i}]overlay=0:0:format=auto:eof_action=pass:enable='between(t,{seg_start_time},{seg_start_time}+{segment.duration})'{output_stream}"
                )
                current_stream = output_stream
                current_stream = f"[tmp{i}]"
            
            filter_complex = ";".join(filter_parts)
            
            cmd = [
                ffmpeg_path,
                "-y",
                *inputs,
                "-filter_complex", filter_complex,
                "-map", "[out]",
                "-map", "0:a?",
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "128k",
                str(output_path)
            ]
            
            logger.info(f"Running FFmpeg multi-segment overlay")
            logger.debug(f"FFmpeg command: {' '.join(cmd)}")
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode != 0:
                logger.error(f"FFmpeg failed: {result.stderr}")
                raise RuntimeError(f"FFmpeg overlay failed: {result.stderr}")
            
            # Cleanup temp files
            try:
                shutil.rmtree(temp_dir)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp dir: {e}")
        
        # Log performance
        end_time = time.time()
        duration_seconds = end_time - start_time
        output_file_size_mb = output_path.stat().st_size / (1024 * 1024) if output_path.exists() else 0
        
        log_render_performance(
            logger,
            session.id,
            duration_seconds,
            output_file_size_mb,
            0,  # frame_count not applicable for FFmpeg
            scene_id=session.scene_id,
            resolution="FFmpeg",
            fps=0
        )
        
        logger.info(f"FFmpeg overlay rendering completed: {output_path}")
        return str(output_path)
    
    def _get_base_video_path(self, session: Session) -> Path:
        """Get the base video path for a session."""
        base_video_path = None
        
        # 1. Check for character-specific video by file convention (Fast & Robust)
        if session.character_id:
            # Check both mp4 and webm
            for ext in ['.mp4', '.webm']:
                direct_path = self.project_root / "backend" / "data" / "storylines" / session.scene_id / "videos" / f"{session.character_id}{ext}"
                if direct_path.exists():
                    logger.info(f"Found character video by convention: {direct_path}")
                    return direct_path

        # 2. Try DB lookup
        if session.character_id:
            try:
                from ..services.admin.character_video_service import character_video_service
                from ..database import async_session_maker
                import asyncio
                
                async def get_char_video():
                    async with async_session_maker() as db:
                        return await character_video_service.get_character_video_path(
                            db, session.scene_id, session.character_id
                        )
                
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                char_video_path = loop.run_until_complete(get_char_video())
                loop.close()
                
                if char_video_path:
                    # Path format from DB: "storylines/{id}/videos/{char_id}.mp4"
                    # Actual file location: {project_root}/backend/data/storylines/{id}/videos/{char_id}.mp4
                    base_video_path = self.project_root / "backend" / "data" / char_video_path
                    logger.info(f"Character-specific video path: {base_video_path}")
                    
                    if not base_video_path.exists():
                        logger.warning(f"Character-specific video not found at {base_video_path}")
                        base_video_path = None
            except Exception as e:
                logger.warning(f"Failed to load character-specific video path: {e}")
        
        if base_video_path is None or not base_video_path.exists():
            # scene_config.base_video_path is already prefixed with "backend/data/" in sessions.py
            base_video_path = self.project_root / self.scene_config.base_video_path
            logger.info(f"Using base video from scene config: {base_video_path}")
        
        if not base_video_path.exists():
            raise ValueError(f"Base video not found: {base_video_path}")
        
        return base_video_path

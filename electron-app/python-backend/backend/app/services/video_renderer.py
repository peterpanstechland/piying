"""
Video rendering service for shadow puppet overlay
"""
import cv2
import numpy as np
import logging
import time
from pathlib import Path
from typing import Optional, List, Tuple
from ..models import Session, Segment, PoseFrame
from ..config import SceneConfig
from ..utils.logger import log_render_performance, log_error_with_context

logger = logging.getLogger(__name__)


class CharacterPath:
    """Calculates character position offsets based on time and path configuration"""
    
    def __init__(self, offset_start: List[int], offset_end: List[int], duration: float):
        """
        Initialize CharacterPath
        
        Args:
            offset_start: Starting offset [x, y]
            offset_end: Ending offset [x, y]
            duration: Duration of this path segment in seconds
        """
        self.offset_start = np.array(offset_start, dtype=float)
        self.offset_end = np.array(offset_end, dtype=float)
        self.duration = duration
    
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
        
        # Linear interpolation
        progress = time / self.duration
        offset = self.offset_start + (self.offset_end - self.offset_start) * progress
        return int(offset[0]), int(offset[1])


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
    
    def __init__(self, scene_config: SceneConfig, output_dir: str = None):
        """
        Initialize VideoRenderer
        
        Args:
            scene_config: Scene configuration with base video and segment settings
            output_dir: Directory for output videos (default: project_root/data/outputs)
        """
        self.scene_config = scene_config
        
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
    
    def render_video(self, session: Session) -> str:
        """
        Render final video with shadow puppet overlay
        
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
            extra={"context": {"session_id": session.id, "scene_id": session.scene_id}}
        )
        
        # Load base video (resolve path relative to project root)
        base_video_path = self.project_root / self.scene_config.base_video_path
        if not base_video_path.exists():
            error_msg = f"Base video not found: {base_video_path}"
            logger.error(
                error_msg,
                extra={"context": {"session_id": session.id, "base_video_path": str(base_video_path)}}
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
        fourcc = cv2.VideoWriter_fourcc(*'avc1')  # H.264 codec
        out = cv2.VideoWriter(
            str(output_path),
            fourcc,
            self.fps,
            (self.frame_width, self.frame_height)
        )
        
        if not out.isOpened():
            cap.release()
            raise ValueError("Failed to create output video writer")
        
        # Build character paths for each segment
        character_paths = []
        for i, segment_config in enumerate(self.scene_config.segments):
            path = CharacterPath(
                segment_config.offset_start,
                segment_config.offset_end,
                segment_config.duration
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
                    # Get character offset for this time
                    offset = character_paths[segment_index].get_offset(segment_time)
                    
                    # Draw shadow puppet
                    frame = self._draw_puppet(frame, pose_frame.landmarks, offset)
            
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
    
    def _draw_puppet(
        self,
        frame: np.ndarray,
        landmarks: List[List[float]],
        offset: Tuple[int, int]
    ) -> np.ndarray:
        """
        Draw shadow puppet skeleton on frame
        
        Args:
            frame: Video frame to draw on
            landmarks: Pose landmarks as list of [x, y, z, visibility]
            offset: Position offset (x, y) for character placement
            
        Returns:
            Frame with puppet drawn
        """
        if not landmarks or len(landmarks) < 33:
            # MediaPipe Pose has 33 landmarks
            return frame
        
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
        
        # Draw connections (skeleton)
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
            cv2.line(frame, start_point, end_point, (0, 0, 0), 8, cv2.LINE_AA)
            # Then draw thinner colored line on top
            cv2.line(frame, start_point, end_point, (50, 50, 50), 5, cv2.LINE_AA)
        
        # Draw joints as circles
        for point in points:
            if point is None:
                continue
            
            # Draw shadow
            cv2.circle(frame, point, 8, (0, 0, 0), -1, cv2.LINE_AA)
            # Draw joint
            cv2.circle(frame, point, 5, (50, 50, 50), -1, cv2.LINE_AA)
        
        return frame

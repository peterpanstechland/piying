"""
Video processor service for storyline timeline editor.
Handles video validation, metadata extraction, frame extraction, and thumbnail generation.

Requirements: 2.1, 2.3, 9.2, 12.2
"""
import base64
import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Optional, Tuple

import cv2


@dataclass
class VideoMetadata:
    """Video metadata extracted from file."""
    duration: float  # Duration in seconds
    width: int  # Video width in pixels
    height: int  # Video height in pixels
    codec: str  # Video codec name
    fps: float  # Frames per second
    is_valid: bool  # Whether the video is valid MP4/H.264
    error_message: str  # Error message if invalid


class VideoProcessor:
    """
    Service for video processing operations.
    
    Provides:
    - Video format validation (MP4/H.264)
    - Metadata extraction (duration, resolution)
    - Frame extraction at specific timestamps
    - Thumbnail generation
    """
    
    # Supported formats and codecs
    SUPPORTED_EXTENSIONS = [".mp4"]
    SUPPORTED_CODECS = ["h264", "avc1", "avc"]
    
    def __init__(self):
        """Initialize the video processor."""
        self._ffprobe_available = self._check_ffprobe()
    
    @staticmethod
    def _check_ffprobe() -> bool:
        """Check if ffprobe is available on the system."""
        try:
            result = subprocess.run(
                ["ffprobe", "-version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError):
            return False
    
    def validate_video_format(self, file_path: str) -> VideoMetadata:
        """
        Validate video format and extract metadata using ffprobe.
        
        Requirements 2.1: Validate MP4/H.264 format and extract duration/resolution.
        
        Args:
            file_path: Path to the video file
            
        Returns:
            VideoMetadata with validation results and extracted metadata
        """
        # Check file exists
        if not os.path.exists(file_path):
            return VideoMetadata(
                duration=0.0, width=0, height=0, codec="",
                fps=0.0, is_valid=False,
                error_message="Video file not found"
            )
        
        # Check file extension
        _, ext = os.path.splitext(file_path)
        if ext.lower() not in self.SUPPORTED_EXTENSIONS:
            return VideoMetadata(
                duration=0.0, width=0, height=0, codec="",
                fps=0.0, is_valid=False,
                error_message=f"Video must be MP4 format (got {ext})"
            )
        
        # Try ffprobe first if available
        if self._ffprobe_available:
            return self._validate_with_ffprobe(file_path)
        
        # Fall back to OpenCV
        return self._validate_with_opencv(file_path)
    
    def _validate_with_ffprobe(self, file_path: str) -> VideoMetadata:
        """Validate video using ffprobe for accurate codec detection."""
        try:
            # Run ffprobe to get video stream info
            cmd = [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                "-select_streams", "v:0",  # First video stream
                file_path
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                return VideoMetadata(
                    duration=0.0, width=0, height=0, codec="",
                    fps=0.0, is_valid=False,
                    error_message=f"ffprobe failed: {result.stderr}"
                )
            
            data = json.loads(result.stdout)
            
            # Get video stream info
            streams = data.get("streams", [])
            if not streams:
                return VideoMetadata(
                    duration=0.0, width=0, height=0, codec="",
                    fps=0.0, is_valid=False,
                    error_message="No video stream found in file"
                )
            
            video_stream = streams[0]
            format_info = data.get("format", {})
            
            # Extract codec
            codec_name = video_stream.get("codec_name", "").lower()
            
            # Check if codec is H.264
            is_h264 = any(c in codec_name for c in self.SUPPORTED_CODECS)
            
            if not is_h264:
                return VideoMetadata(
                    duration=0.0, width=0, height=0, codec=codec_name,
                    fps=0.0, is_valid=False,
                    error_message=f"Video codec must be H.264 (got {codec_name})"
                )
            
            # Extract metadata
            width = int(video_stream.get("width", 0))
            height = int(video_stream.get("height", 0))
            
            # Get duration from format or stream
            duration_str = format_info.get("duration") or video_stream.get("duration", "0")
            duration = float(duration_str)
            
            # Get FPS
            fps_str = video_stream.get("r_frame_rate", "0/1")
            if "/" in fps_str:
                num, den = fps_str.split("/")
                fps = float(num) / float(den) if float(den) > 0 else 0.0
            else:
                fps = float(fps_str)
            
            return VideoMetadata(
                duration=duration,
                width=width,
                height=height,
                codec=codec_name,
                fps=fps,
                is_valid=True,
                error_message=""
            )
            
        except json.JSONDecodeError as e:
            return VideoMetadata(
                duration=0.0, width=0, height=0, codec="",
                fps=0.0, is_valid=False,
                error_message=f"Failed to parse ffprobe output: {str(e)}"
            )
        except subprocess.TimeoutExpired:
            return VideoMetadata(
                duration=0.0, width=0, height=0, codec="",
                fps=0.0, is_valid=False,
                error_message="Video analysis timed out"
            )
        except Exception as e:
            return VideoMetadata(
                duration=0.0, width=0, height=0, codec="",
                fps=0.0, is_valid=False,
                error_message=f"Error validating video: {str(e)}"
            )
    
    def _validate_with_opencv(self, file_path: str) -> VideoMetadata:
        """Validate video using OpenCV as fallback."""
        try:
            cap = cv2.VideoCapture(file_path)
            if not cap.isOpened():
                return VideoMetadata(
                    duration=0.0, width=0, height=0, codec="",
                    fps=0.0, is_valid=False,
                    error_message="Failed to open video file"
                )
            
            try:
                # Get video properties
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                
                # Get fourcc codec
                fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
                fourcc_str = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)]).lower()
                
                # Calculate duration
                if fps <= 0 or frame_count <= 0:
                    return VideoMetadata(
                        duration=0.0, width=width, height=height, codec=fourcc_str,
                        fps=fps, is_valid=False,
                        error_message="Could not determine video duration"
                    )
                
                duration = frame_count / fps
                
                # Check codec (OpenCV may report different fourcc codes)
                is_h264 = any(c in fourcc_str for c in self.SUPPORTED_CODECS)
                
                # Be lenient with OpenCV - if we can read frames, accept it
                if not is_h264:
                    ret, _ = cap.read()
                    if not ret:
                        return VideoMetadata(
                            duration=0.0, width=width, height=height, codec=fourcc_str,
                            fps=fps, is_valid=False,
                            error_message=f"Video codec not supported. Expected H.264, got {fourcc_str}"
                        )
                
                return VideoMetadata(
                    duration=duration,
                    width=width,
                    height=height,
                    codec=fourcc_str,
                    fps=fps,
                    is_valid=True,
                    error_message=""
                )
                
            finally:
                cap.release()
                
        except Exception as e:
            return VideoMetadata(
                duration=0.0, width=0, height=0, codec="",
                fps=0.0, is_valid=False,
                error_message=f"Error validating video: {str(e)}"
            )
    
    def extract_frame(
        self,
        file_path: str,
        timestamp: float,
        output_format: str = "base64",
        output_path: Optional[str] = None
    ) -> Tuple[Optional[str], str]:
        """
        Extract a frame from video at specified timestamp.
        
        Requirements 9.2, 12.2: Extract frame at specific timestamp.
        
        Args:
            file_path: Path to the video file
            timestamp: Time in seconds to extract frame from
            output_format: "base64" for base64 encoded image, "file" for file path
            output_path: Path to save the file (required if output_format is "file")
            
        Returns:
            Tuple of (frame_data, error_message)
            - For base64: returns base64 encoded JPEG string
            - For file: returns path to saved file
        """
        if not os.path.exists(file_path):
            return None, "Video file not found"
        
        try:
            cap = cv2.VideoCapture(file_path)
            if not cap.isOpened():
                return None, "Failed to open video file"
            
            try:
                # Get video properties
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                
                if fps <= 0:
                    return None, "Could not determine video FPS"
                
                duration = frame_count / fps if frame_count > 0 else 0
                
                # Validate timestamp
                if timestamp < 0:
                    timestamp = 0
                elif timestamp > duration:
                    timestamp = duration
                
                # Seek to frame
                frame_number = int(timestamp * fps)
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
                
                # Read frame
                ret, frame = cap.read()
                if not ret:
                    return None, f"Failed to read frame at timestamp {timestamp}s"
                
                # Encode frame as JPEG
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                
                if output_format == "base64":
                    # Return base64 encoded string
                    frame_base64 = base64.b64encode(buffer).decode('utf-8')
                    return frame_base64, ""
                elif output_format == "file" and output_path:
                    # Save to specified file path
                    os.makedirs(os.path.dirname(output_path), exist_ok=True)
                    with open(output_path, 'wb') as f:
                        f.write(buffer)
                    return output_path, ""
                else:
                    # Save to temporary file
                    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as f:
                        f.write(buffer)
                        return f.name, ""
                        
            finally:
                cap.release()
                
        except Exception as e:
            return None, f"Error extracting frame: {str(e)}"
    
    def generate_thumbnail(
        self,
        file_path: str,
        output_path: str,
        timestamp: float = 0.0,
        width: int = 320,
        height: int = 180
    ) -> Tuple[bool, str]:
        """
        Generate a thumbnail image from video at specified timestamp.
        
        Requirements 2.3: Generate thumbnail at specified time.
        
        Args:
            file_path: Path to the video file
            output_path: Path to save the thumbnail
            timestamp: Time in seconds to capture thumbnail from
            width: Thumbnail width in pixels
            height: Thumbnail height in pixels
            
        Returns:
            Tuple of (success, error_message)
        """
        if not os.path.exists(file_path):
            return False, "Video file not found"
        
        try:
            cap = cv2.VideoCapture(file_path)
            if not cap.isOpened():
                return False, "Failed to open video file"
            
            try:
                # Get video properties
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                
                if fps <= 0:
                    return False, "Could not determine video FPS"
                
                duration = frame_count / fps if frame_count > 0 else 0
                
                # Validate timestamp
                if timestamp < 0:
                    timestamp = 0
                elif timestamp > duration:
                    timestamp = duration
                
                # Seek to frame
                frame_number = int(timestamp * fps)
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
                
                # Read frame
                ret, frame = cap.read()
                if not ret:
                    return False, f"Failed to read frame at timestamp {timestamp}s"
                
                # Resize frame
                thumbnail = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)
                
                # Ensure output directory exists
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                
                # Save thumbnail
                success = cv2.imwrite(output_path, thumbnail, [cv2.IMWRITE_JPEG_QUALITY, 85])
                
                if not success:
                    return False, "Failed to save thumbnail"
                
                return True, ""
                
            finally:
                cap.release()
                
        except Exception as e:
            return False, f"Error generating thumbnail: {str(e)}"
    
    def get_duration(self, file_path: str) -> float:
        """
        Get video duration in seconds.
        
        Args:
            file_path: Path to the video file
            
        Returns:
            Duration in seconds, or 0.0 if extraction fails
        """
        metadata = self.validate_video_format(file_path)
        return metadata.duration if metadata.is_valid else 0.0
    
    def get_resolution(self, file_path: str) -> Tuple[int, int]:
        """
        Get video resolution.
        
        Args:
            file_path: Path to the video file
            
        Returns:
            Tuple of (width, height), or (0, 0) if extraction fails
        """
        metadata = self.validate_video_format(file_path)
        return (metadata.width, metadata.height) if metadata.is_valid else (0, 0)


# Singleton instance
video_processor = VideoProcessor()

"""
Image processor service for storyline timeline editor.
Handles image validation, resizing, and cover image generation.

Requirements: 9.1, 9.3, 12.1
"""
import os
import tempfile
from dataclasses import dataclass
from typing import Optional, Tuple, List

import cv2
import numpy as np


@dataclass
class ImageMetadata:
    """Image metadata extracted from file."""
    width: int  # Image width in pixels
    height: int  # Image height in pixels
    format: str  # Image format (png, jpg, webp)
    is_valid: bool  # Whether the image is valid
    error_message: str  # Error message if invalid


@dataclass
class CoverImagePaths:
    """Paths to generated cover images at different sizes."""
    original_path: str
    thumbnail_path: str  # 200x150
    medium_path: str  # 400x300
    large_path: str  # 800x600


# Cover image size definitions (Requirements 9.3)
COVER_SIZES = {
    "thumbnail": (200, 150),
    "medium": (400, 300),
    "large": (800, 600),
}


class ImageProcessor:
    """
    Service for image processing operations.
    
    Provides:
    - Image format validation (PNG, JPG, WebP)
    - Image resizing to multiple sizes
    - Cover image generation
    
    Requirements: 9.1, 9.3, 12.1
    """
    
    # Supported image formats (Requirements 9.1, 12.1)
    SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"]
    SUPPORTED_FORMATS = ["png", "jpg", "jpeg", "webp"]
    
    # Minimum resolution for cover images (Requirements 9.1)
    MIN_COVER_WIDTH = 400
    MIN_COVER_HEIGHT = 300
    
    def __init__(self):
        """Initialize the image processor."""
        pass
    
    def validate_image_format(self, file_path: str) -> ImageMetadata:
        """
        Validate image format and extract metadata.
        
        Requirements 9.1, 12.1: Validate PNG, JPG, or WebP format.
        
        Args:
            file_path: Path to the image file
            
        Returns:
            ImageMetadata with validation results and extracted metadata
        """
        # Check file exists
        if not os.path.exists(file_path):
            return ImageMetadata(
                width=0, height=0, format="",
                is_valid=False,
                error_message="Image file not found"
            )
        
        # Check file extension
        _, ext = os.path.splitext(file_path)
        ext_lower = ext.lower()
        if ext_lower not in self.SUPPORTED_EXTENSIONS:
            return ImageMetadata(
                width=0, height=0, format=ext_lower.lstrip('.'),
                is_valid=False,
                error_message=f"Image must be PNG, JPG, or WebP format (got {ext})"
            )
        
        # Try to read the image
        try:
            img = cv2.imread(file_path, cv2.IMREAD_UNCHANGED)
            if img is None:
                return ImageMetadata(
                    width=0, height=0, format=ext_lower.lstrip('.'),
                    is_valid=False,
                    error_message="Failed to read image file - invalid or corrupted"
                )
            
            height, width = img.shape[:2]
            
            # Determine format from extension
            format_name = ext_lower.lstrip('.')
            if format_name == "jpeg":
                format_name = "jpg"
            
            return ImageMetadata(
                width=width,
                height=height,
                format=format_name,
                is_valid=True,
                error_message=""
            )
            
        except Exception as e:
            return ImageMetadata(
                width=0, height=0, format="",
                is_valid=False,
                error_message=f"Error reading image: {str(e)}"
            )
    
    def validate_cover_image(self, file_path: str) -> ImageMetadata:
        """
        Validate cover image format and minimum resolution.
        
        Requirements 9.1: Validate format and minimum resolution (400x300).
        
        Args:
            file_path: Path to the image file
            
        Returns:
            ImageMetadata with validation results
        """
        metadata = self.validate_image_format(file_path)
        
        if not metadata.is_valid:
            return metadata
        
        # Check minimum resolution
        if metadata.width < self.MIN_COVER_WIDTH or metadata.height < self.MIN_COVER_HEIGHT:
            return ImageMetadata(
                width=metadata.width,
                height=metadata.height,
                format=metadata.format,
                is_valid=False,
                error_message=f"Cover image must be at least {self.MIN_COVER_WIDTH}x{self.MIN_COVER_HEIGHT} pixels (got {metadata.width}x{metadata.height})"
            )
        
        return metadata
    
    def resize_image(
        self,
        file_path: str,
        output_path: str,
        target_width: int,
        target_height: int,
        maintain_aspect: bool = True
    ) -> Tuple[bool, str]:
        """
        Resize an image to target dimensions.
        
        Args:
            file_path: Path to the source image
            output_path: Path to save the resized image
            target_width: Target width in pixels
            target_height: Target height in pixels
            maintain_aspect: If True, maintain aspect ratio and crop to fit
            
        Returns:
            Tuple of (success, error_message)
        """
        if not os.path.exists(file_path):
            return False, "Source image file not found"
        
        try:
            img = cv2.imread(file_path, cv2.IMREAD_UNCHANGED)
            if img is None:
                return False, "Failed to read source image"
            
            src_height, src_width = img.shape[:2]
            
            if maintain_aspect:
                # Calculate scaling to cover target dimensions
                scale_w = target_width / src_width
                scale_h = target_height / src_height
                scale = max(scale_w, scale_h)
                
                # Resize to cover target (use ceiling to ensure we cover the target)
                new_width = max(int(src_width * scale + 0.5), target_width)
                new_height = max(int(src_height * scale + 0.5), target_height)
                resized = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_AREA)
                
                # Crop to exact target dimensions (center crop)
                start_x = max(0, (new_width - target_width) // 2)
                start_y = max(0, (new_height - target_height) // 2)
                cropped = resized[start_y:start_y + target_height, start_x:start_x + target_width]
                
                result = cropped
            else:
                # Simple resize without maintaining aspect ratio
                result = cv2.resize(img, (target_width, target_height), interpolation=cv2.INTER_AREA)
            
            # Ensure output directory exists
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            # Determine output format from extension
            _, ext = os.path.splitext(output_path)
            ext_lower = ext.lower()
            
            # Set encoding parameters based on format
            if ext_lower in ['.jpg', '.jpeg']:
                params = [cv2.IMWRITE_JPEG_QUALITY, 90]
            elif ext_lower == '.png':
                params = [cv2.IMWRITE_PNG_COMPRESSION, 6]
            elif ext_lower == '.webp':
                params = [cv2.IMWRITE_WEBP_QUALITY, 90]
            else:
                params = []
            
            success = cv2.imwrite(output_path, result, params)
            
            if not success:
                return False, "Failed to save resized image"
            
            return True, ""
            
        except Exception as e:
            return False, f"Error resizing image: {str(e)}"
    
    def generate_cover_images(
        self,
        source_path: str,
        output_dir: str,
        base_name: str = "cover"
    ) -> Tuple[Optional[CoverImagePaths], str]:
        """
        Generate cover images at multiple sizes from source image.
        
        Requirements 9.3: Generate thumbnail (200x150), medium (400x300), large (800x600).
        
        Args:
            source_path: Path to the source image
            output_dir: Directory to save generated images
            base_name: Base name for output files
            
        Returns:
            Tuple of (CoverImagePaths or None, error_message)
        """
        # Validate source image
        metadata = self.validate_image_format(source_path)
        if not metadata.is_valid:
            return None, metadata.error_message
        
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        # Determine output format (use jpg for efficiency)
        output_ext = ".jpg"
        
        # Copy original
        original_path = os.path.join(output_dir, f"{base_name}_original{output_ext}")
        try:
            img = cv2.imread(source_path, cv2.IMREAD_UNCHANGED)
            if img is None:
                return None, "Failed to read source image"
            
            # Save original (possibly re-encoded)
            cv2.imwrite(original_path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
        except Exception as e:
            return None, f"Error copying original image: {str(e)}"
        
        # Generate each size
        paths = {
            "original": original_path,
            "thumbnail": os.path.join(output_dir, f"{base_name}_thumbnail{output_ext}"),
            "medium": os.path.join(output_dir, f"{base_name}_medium{output_ext}"),
            "large": os.path.join(output_dir, f"{base_name}_large{output_ext}"),
        }
        
        for size_name, (width, height) in COVER_SIZES.items():
            output_path = paths[size_name]
            success, error = self.resize_image(
                source_path, output_path, width, height, maintain_aspect=True
            )
            if not success:
                # Clean up any created files
                for path in paths.values():
                    if os.path.exists(path):
                        os.remove(path)
                return None, f"Failed to generate {size_name} image: {error}"
        
        return CoverImagePaths(
            original_path=paths["original"],
            thumbnail_path=paths["thumbnail"],
            medium_path=paths["medium"],
            large_path=paths["large"]
        ), ""
    
    def capture_frame_as_cover(
        self,
        video_path: str,
        timestamp: float,
        output_dir: str,
        base_name: str = "cover"
    ) -> Tuple[Optional[CoverImagePaths], str]:
        """
        Capture a video frame and generate cover images from it.
        
        Requirements 9.2: Capture video frame as cover image.
        
        Args:
            video_path: Path to the video file
            timestamp: Time in seconds to capture frame from
            output_dir: Directory to save generated images
            base_name: Base name for output files
            
        Returns:
            Tuple of (CoverImagePaths or None, error_message)
        """
        if not os.path.exists(video_path):
            return None, "Video file not found"
        
        try:
            cap = cv2.VideoCapture(video_path)
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
                
                # Save frame to temporary file
                os.makedirs(output_dir, exist_ok=True)
                temp_frame_path = os.path.join(output_dir, f"{base_name}_temp.jpg")
                cv2.imwrite(temp_frame_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
                
                # Generate cover images from the frame
                result, error = self.generate_cover_images(
                    temp_frame_path, output_dir, base_name
                )
                
                # Clean up temp file
                if os.path.exists(temp_frame_path):
                    os.remove(temp_frame_path)
                
                return result, error
                
            finally:
                cap.release()
                
        except Exception as e:
            return None, f"Error capturing frame: {str(e)}"
    
    def delete_cover_images(self, cover_paths: CoverImagePaths) -> List[str]:
        """
        Delete all cover image files.
        
        Args:
            cover_paths: CoverImagePaths object with paths to delete
            
        Returns:
            List of successfully deleted file paths
        """
        deleted = []
        for path in [
            cover_paths.original_path,
            cover_paths.thumbnail_path,
            cover_paths.medium_path,
            cover_paths.large_path
        ]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                    deleted.append(path)
                except Exception:
                    pass  # Ignore deletion errors
        return deleted


# Singleton instance
image_processor = ImageProcessor()

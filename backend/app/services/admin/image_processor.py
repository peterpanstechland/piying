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
            output_dir = os.path.dirname(output_path)
            if output_dir:  # Only create directory if path has a directory component
                try:
                    os.makedirs(output_dir, exist_ok=True)
                    if not os.path.exists(output_dir):
                        return False, f"Failed to create output directory: {output_dir}"
                except Exception as e:
                    return False, f"Failed to create output directory {output_dir}: {str(e)}"
            
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
                # Check if file was actually written
                if not os.path.exists(output_path):
                    return False, f"Failed to save resized image to {output_path} (file not created)"
                return False, f"Failed to save resized image to {output_path} (cv2.imwrite returned False)"
            
            # Verify file was written successfully
            if not os.path.exists(output_path):
                return False, f"Image file was not created at {output_path}"
            
            # Check file size (should be > 0)
            if os.path.getsize(output_path) == 0:
                return False, f"Image file is empty at {output_path}"
            
            return True, ""
            
        except Exception as e:
            import traceback
            error_detail = f"Error resizing image: {str(e)}\n{traceback.format_exc()}"
            print(f"[ERROR] resize_image failed: {error_detail}")
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
        print(f"[DEBUG] generate_cover_images - source_path: {source_path}")
        print(f"[DEBUG] generate_cover_images - output_dir: {output_dir}")
        print(f"[DEBUG] generate_cover_images - base_name: {base_name}")
        
        # Validate source image
        metadata = self.validate_image_format(source_path)
        if not metadata.is_valid:
            print(f"[ERROR] generate_cover_images - invalid source image: {metadata.error_message}")
            return None, metadata.error_message
        
        # Ensure output directory exists with error handling
        try:
            os.makedirs(output_dir, exist_ok=True)
            if not os.path.exists(output_dir):
                return None, f"Failed to create output directory: {output_dir}"
            # Test write permission
            test_file = os.path.join(output_dir, ".write_test")
            try:
                with open(test_file, "w") as f:
                    f.write("test")
                os.remove(test_file)
            except Exception as e:
                return None, f"Output directory is not writable: {output_dir}. Error: {str(e)}"
        except Exception as e:
            return None, f"Failed to create output directory: {output_dir}. Error: {str(e)}"
        
        # Determine output format (use jpg for efficiency)
        output_ext = ".jpg"
        
        # Copy original
        original_path = os.path.join(output_dir, f"{base_name}_original{output_ext}")
        try:
            img = cv2.imread(source_path, cv2.IMREAD_UNCHANGED)
            if img is None:
                return None, f"Failed to read source image: {source_path}"
            
            # Save original (possibly re-encoded)
            success = cv2.imwrite(original_path, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
            if not success:
                # Check if file exists
                if not os.path.exists(original_path):
                    return None, f"Failed to write original image to: {original_path} (file not created)"
                return None, f"Failed to write original image to: {original_path} (cv2.imwrite returned False)"
            
            # Verify file was written
            if not os.path.exists(original_path):
                return None, f"Original image file was not created at: {original_path}"
            
            if os.path.getsize(original_path) == 0:
                return None, f"Original image file is empty at: {original_path}"
                
        except Exception as e:
            import traceback
            error_detail = f"Error copying original image: {str(e)}\n{traceback.format_exc()}"
            print(f"[ERROR] generate_cover_images - copy original failed: {error_detail}")
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
            print(f"[DEBUG] generate_cover_images - generating {size_name}: {output_path}")
            success, error = self.resize_image(
                source_path, output_path, width, height, maintain_aspect=True
            )
            if not success:
                print(f"[ERROR] generate_cover_images - failed to generate {size_name}: {error}")
                # Clean up any created files
                for path in paths.values():
                    if os.path.exists(path):
                        os.remove(path)
                return None, f"Failed to generate {size_name} image: {error}"
            print(f"[DEBUG] generate_cover_images - {size_name} created successfully: {os.path.exists(output_path)}, size: {os.path.getsize(output_path) if os.path.exists(output_path) else 0}")
        
        print(f"[DEBUG] generate_cover_images - all sizes generated successfully")
        print(f"[DEBUG] generate_cover_images - paths: {paths}")
        
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
        print(f"[DEBUG] capture_frame_as_cover - video_path: {video_path}")
        print(f"[DEBUG] capture_frame_as_cover - output_dir: {output_dir}")
        print(f"[DEBUG] capture_frame_as_cover - timestamp: {timestamp}")
        
        if not os.path.exists(video_path):
            error_msg = f"Video file not found: {video_path}"
            print(f"[ERROR] {error_msg}")
            return None, error_msg
        
        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                error_msg = f"Failed to open video file: {video_path}"
                print(f"[ERROR] {error_msg}")
                return None, error_msg
            
            try:
                # Get video properties
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                
                print(f"[DEBUG] Video properties - fps: {fps}, frame_count: {frame_count}")
                
                if fps <= 0:
                    error_msg = "Could not determine video FPS"
                    print(f"[ERROR] {error_msg}")
                    return None, error_msg
                
                duration = frame_count / fps if frame_count > 0 else 0
                
                # Validate timestamp
                if timestamp < 0:
                    timestamp = 0
                elif timestamp > duration:
                    timestamp = duration
                
                print(f"[DEBUG] Seeking to timestamp: {timestamp}s (frame {int(timestamp * fps)})")
                
                # Seek to frame
                frame_number = int(timestamp * fps)
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
                
                # Read frame
                ret, frame = cap.read()
                if not ret:
                    error_msg = f"Failed to read frame at timestamp {timestamp}s"
                    print(f"[ERROR] {error_msg}")
                    return None, error_msg
                
                print(f"[DEBUG] Frame captured successfully - shape: {frame.shape}")
                
                # Ensure output directory exists
                try:
                    os.makedirs(output_dir, exist_ok=True)
                    if not os.path.exists(output_dir):
                        error_msg = f"Failed to create output directory: {output_dir}"
                        print(f"[ERROR] {error_msg}")
                        return None, error_msg
                    # Test write permission
                    test_file = os.path.join(output_dir, ".write_test")
                    try:
                        with open(test_file, "w") as f:
                            f.write("test")
                        os.remove(test_file)
                    except Exception as e:
                        error_msg = f"Output directory is not writable: {output_dir}. Error: {str(e)}"
                        print(f"[ERROR] {error_msg}")
                        return None, error_msg
                except Exception as e:
                    error_msg = f"Failed to create output directory: {output_dir}. Error: {str(e)}"
                    print(f"[ERROR] {error_msg}")
                    return None, error_msg
                
                # Save frame to temporary file
                temp_frame_path = os.path.join(output_dir, f"{base_name}_temp.jpg")
                print(f"[DEBUG] Saving temp frame to: {temp_frame_path}")
                
                success = cv2.imwrite(temp_frame_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
                if not success:
                    error_msg = f"Failed to write temp frame to: {temp_frame_path} (cv2.imwrite returned False)"
                    print(f"[ERROR] {error_msg}")
                    return None, error_msg
                
                # Verify temp file was written
                if not os.path.exists(temp_frame_path):
                    error_msg = f"Temp frame file was not created: {temp_frame_path}"
                    print(f"[ERROR] {error_msg}")
                    return None, error_msg
                
                if os.path.getsize(temp_frame_path) == 0:
                    error_msg = f"Temp frame file is empty: {temp_frame_path}"
                    print(f"[ERROR] {error_msg}")
                    return None, error_msg
                
                print(f"[DEBUG] Temp frame saved successfully: {temp_frame_path} ({os.path.getsize(temp_frame_path)} bytes)")
                
                # Generate cover images from the frame
                result, error = self.generate_cover_images(
                    temp_frame_path, output_dir, base_name
                )
                
                # Clean up temp file
                if os.path.exists(temp_frame_path):
                    try:
                        os.remove(temp_frame_path)
                        print(f"[DEBUG] Temp frame file cleaned up: {temp_frame_path}")
                    except Exception as e:
                        print(f"[WARNING] Failed to remove temp frame file: {e}")
                
                if result is None:
                    print(f"[ERROR] generate_cover_images failed: {error}")
                
                return result, error
                
            finally:
                cap.release()
                
        except Exception as e:
            import traceback
            error_detail = f"Error capturing frame: {str(e)}\n{traceback.format_exc()}"
            print(f"[ERROR] capture_frame_as_cover exception: {error_detail}")
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

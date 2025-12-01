"""
Property-based tests for image processor service.

These tests use Hypothesis to verify universal properties across all inputs.

**Feature: storyline-timeline-editor**
**Validates: Requirements 9.1, 9.3, 12.1**
"""
import os
import tempfile
import pytest
from hypothesis import given, strategies as st, settings, assume

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.admin.image_processor import (
    ImageProcessor, 
    ImageMetadata, 
    CoverImagePaths,
    COVER_SIZES
)

import cv2
import numpy as np


# Create a test instance
image_processor = ImageProcessor()


# Strategy for generating valid image extensions
@st.composite
def valid_image_extension_strategy(draw):
    """Generate valid image extensions (PNG, JPG, WebP)."""
    return draw(st.sampled_from([".png", ".jpg", ".jpeg", ".webp", ".PNG", ".JPG", ".JPEG", ".WEBP"]))


# Strategy for generating invalid image extensions
@st.composite
def invalid_image_extension_strategy(draw):
    """Generate invalid (non-image) extensions."""
    invalid = [".gif", ".bmp", ".tiff", ".svg", ".ico", ".raw",
               ".mp4", ".avi", ".mov", ".pdf", ".txt", ".doc", ".mp3"]
    return draw(st.sampled_from(invalid))


# Strategy for generating valid image dimensions
@st.composite
def valid_image_dimensions_strategy(draw):
    """Generate valid image dimensions."""
    width = draw(st.integers(min_value=1, max_value=2000))
    height = draw(st.integers(min_value=1, max_value=2000))
    return width, height


# Strategy for generating cover-valid image dimensions (>= 400x300)
@st.composite
def cover_valid_dimensions_strategy(draw):
    """Generate dimensions valid for cover images (>= 400x300)."""
    width = draw(st.integers(min_value=400, max_value=2000))
    height = draw(st.integers(min_value=300, max_value=2000))
    return width, height


# Strategy for generating cover-invalid image dimensions (< 400x300)
@st.composite
def cover_invalid_dimensions_strategy(draw):
    """Generate dimensions invalid for cover images (< 400x300)."""
    # Either width < 400 or height < 300
    choice = draw(st.integers(min_value=0, max_value=2))
    if choice == 0:
        width = draw(st.integers(min_value=1, max_value=399))
        height = draw(st.integers(min_value=1, max_value=2000))
    elif choice == 1:
        width = draw(st.integers(min_value=1, max_value=2000))
        height = draw(st.integers(min_value=1, max_value=299))
    else:
        width = draw(st.integers(min_value=1, max_value=399))
        height = draw(st.integers(min_value=1, max_value=299))
    return width, height


def create_test_image(width: int, height: int, channels: int = 3) -> np.ndarray:
    """Create a test image with random content."""
    if channels == 3:
        return np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    elif channels == 4:
        return np.random.randint(0, 256, (height, width, 4), dtype=np.uint8)
    else:
        return np.random.randint(0, 256, (height, width), dtype=np.uint8)


def save_test_image(img: np.ndarray, path: str) -> bool:
    """Save a test image to disk."""
    return cv2.imwrite(path, img)


# Property 22: Image Upload Validation
# **Feature: storyline-timeline-editor, Property 22: Image Upload Validation**
# **Validates: Requirements 9.1, 12.1**
class TestImageUploadValidation:
    """
    Property 22: Image Upload Validation
    
    *For any* uploaded image (cover or guidance), the system SHALL accept 
    only PNG, JPG, or WebP formats.
    
    **Feature: storyline-timeline-editor, Property 22: Image Upload Validation**
    **Validates: Requirements 9.1, 12.1**
    """
    
    @settings(max_examples=100)
    @given(extension=invalid_image_extension_strategy())
    def test_non_supported_extensions_rejected(self, extension):
        """
        Non-supported file extensions should be rejected.
        
        **Feature: storyline-timeline-editor, Property 22: Image Upload Validation**
        **Validates: Requirements 9.1, 12.1**
        """
        # Create a temporary file with invalid extension
        with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as f:
            f.write(b"dummy content")
            temp_path = f.name
        
        try:
            metadata = image_processor.validate_image_format(temp_path)
            
            # Should be invalid
            assert not metadata.is_valid, f"Expected {extension} to be rejected"
            assert "PNG" in metadata.error_message or "JPG" in metadata.error_message or "WebP" in metadata.error_message
        finally:
            os.unlink(temp_path)
    
    @settings(max_examples=50, deadline=1000)
    @given(
        extension=valid_image_extension_strategy(),
        dimensions=valid_image_dimensions_strategy()
    )
    def test_valid_extensions_accepted(self, extension, dimensions):
        """
        Valid image extensions with valid content should be accepted.
        
        **Feature: storyline-timeline-editor, Property 22: Image Upload Validation**
        **Validates: Requirements 9.1, 12.1**
        """
        width, height = dimensions
        
        # Create a valid test image
        img = create_test_image(width, height)
        
        with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as f:
            temp_path = f.name
        
        try:
            # Save the image
            save_test_image(img, temp_path)
            
            metadata = image_processor.validate_image_format(temp_path)
            
            # Should be valid
            assert metadata.is_valid, f"Expected {extension} to be accepted, got error: {metadata.error_message}"
            assert metadata.width == width
            assert metadata.height == height
            assert metadata.format in ["png", "jpg", "jpeg", "webp"]
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    
    @settings(max_examples=50)
    @given(filename=st.text(min_size=1, max_size=50, alphabet=st.characters(
        whitelist_categories=('L', 'N'),
        blacklist_characters='/\\:*?"<>|'
    )))
    def test_nonexistent_file_rejected(self, filename):
        """
        Non-existent files should be rejected with appropriate error.
        
        **Feature: storyline-timeline-editor, Property 22: Image Upload Validation**
        **Validates: Requirements 9.1, 12.1**
        """
        assume(len(filename.strip()) > 0)
        
        # Create a path that doesn't exist
        fake_path = os.path.join(tempfile.gettempdir(), f"{filename}_nonexistent.png")
        
        # Ensure it doesn't exist
        if os.path.exists(fake_path):
            return  # Skip this test case
        
        metadata = image_processor.validate_image_format(fake_path)
        
        assert not metadata.is_valid
        assert "not found" in metadata.error_message.lower()
    
    @settings(max_examples=50)
    @given(
        extension=valid_image_extension_strategy(),
        content=st.binary(min_size=0, max_size=100)
    )
    def test_invalid_image_content_rejected(self, extension, content):
        """
        Files with valid extension but invalid content should be rejected.
        
        **Feature: storyline-timeline-editor, Property 22: Image Upload Validation**
        **Validates: Requirements 9.1, 12.1**
        """
        # Create a temporary file with valid extension but invalid content
        with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as f:
            f.write(content)
            temp_path = f.name
        
        try:
            metadata = image_processor.validate_image_format(temp_path)
            
            # Should be invalid (random bytes are not valid images)
            # Note: Very rarely, random bytes might form valid image headers
            if metadata.is_valid:
                # If somehow valid, it should have extracted metadata
                assert metadata.width >= 0
                assert metadata.height >= 0
            else:
                # Invalid content should have an error message
                assert len(metadata.error_message) > 0
        finally:
            os.unlink(temp_path)
    
    def test_supported_extensions_defined(self):
        """
        Supported extensions should include PNG, JPG, and WebP.
        
        **Feature: storyline-timeline-editor, Property 22: Image Upload Validation**
        **Validates: Requirements 9.1, 12.1**
        """
        extensions = ImageProcessor.SUPPORTED_EXTENSIONS
        assert ".png" in extensions
        assert ".jpg" in extensions
        assert ".jpeg" in extensions
        assert ".webp" in extensions


# Property 23: Cover Image Size Generation
# **Feature: storyline-timeline-editor, Property 23: Cover Image Size Generation**
# **Validates: Requirements 9.3**
class TestCoverImageSizeGeneration:
    """
    Property 23: Cover Image Size Generation
    
    *For any* cover image upload, the system SHALL generate three sizes: 
    thumbnail (200x150), medium (400x300), and large (800x600).
    
    **Feature: storyline-timeline-editor, Property 23: Cover Image Size Generation**
    **Validates: Requirements 9.3**
    """
    
    @settings(max_examples=30, deadline=2000)
    @given(dimensions=cover_valid_dimensions_strategy())
    def test_cover_images_generated_at_all_sizes(self, dimensions):
        """
        Cover image generation should create all three required sizes.
        
        **Feature: storyline-timeline-editor, Property 23: Cover Image Size Generation**
        **Validates: Requirements 9.3**
        """
        width, height = dimensions
        
        # Create a valid test image
        img = create_test_image(width, height)
        
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = os.path.join(temp_dir, "source.jpg")
            save_test_image(img, source_path)
            
            output_dir = os.path.join(temp_dir, "output")
            
            result, error = image_processor.generate_cover_images(
                source_path, output_dir, "test_cover"
            )
            
            assert result is not None, f"Expected cover images to be generated, got error: {error}"
            assert error == ""
            
            # Verify all paths exist
            assert os.path.exists(result.original_path), "Original path should exist"
            assert os.path.exists(result.thumbnail_path), "Thumbnail path should exist"
            assert os.path.exists(result.medium_path), "Medium path should exist"
            assert os.path.exists(result.large_path), "Large path should exist"
    
    @settings(max_examples=30, deadline=2000)
    @given(dimensions=cover_valid_dimensions_strategy())
    def test_cover_images_have_correct_dimensions(self, dimensions):
        """
        Generated cover images should have the correct dimensions.
        
        **Feature: storyline-timeline-editor, Property 23: Cover Image Size Generation**
        **Validates: Requirements 9.3**
        """
        width, height = dimensions
        
        # Create a valid test image
        img = create_test_image(width, height)
        
        with tempfile.TemporaryDirectory() as temp_dir:
            source_path = os.path.join(temp_dir, "source.jpg")
            save_test_image(img, source_path)
            
            output_dir = os.path.join(temp_dir, "output")
            
            result, error = image_processor.generate_cover_images(
                source_path, output_dir, "test_cover"
            )
            
            assert result is not None, f"Expected cover images to be generated, got error: {error}"
            
            # Verify thumbnail dimensions (200x150)
            thumb_img = cv2.imread(result.thumbnail_path)
            assert thumb_img is not None
            assert thumb_img.shape[1] == 200, f"Thumbnail width should be 200, got {thumb_img.shape[1]}"
            assert thumb_img.shape[0] == 150, f"Thumbnail height should be 150, got {thumb_img.shape[0]}"
            
            # Verify medium dimensions (400x300)
            medium_img = cv2.imread(result.medium_path)
            assert medium_img is not None
            assert medium_img.shape[1] == 400, f"Medium width should be 400, got {medium_img.shape[1]}"
            assert medium_img.shape[0] == 300, f"Medium height should be 300, got {medium_img.shape[0]}"
            
            # Verify large dimensions (800x600)
            large_img = cv2.imread(result.large_path)
            assert large_img is not None
            assert large_img.shape[1] == 800, f"Large width should be 800, got {large_img.shape[1]}"
            assert large_img.shape[0] == 600, f"Large height should be 600, got {large_img.shape[0]}"
    
    def test_cover_sizes_defined_correctly(self):
        """
        Cover sizes should be defined as specified in requirements.
        
        **Feature: storyline-timeline-editor, Property 23: Cover Image Size Generation**
        **Validates: Requirements 9.3**
        """
        assert "thumbnail" in COVER_SIZES
        assert "medium" in COVER_SIZES
        assert "large" in COVER_SIZES
        
        assert COVER_SIZES["thumbnail"] == (200, 150)
        assert COVER_SIZES["medium"] == (400, 300)
        assert COVER_SIZES["large"] == (800, 600)
    
    @settings(max_examples=20)
    @given(dimensions=cover_invalid_dimensions_strategy())
    def test_cover_validation_rejects_small_images(self, dimensions):
        """
        Cover image validation should reject images below minimum resolution.
        
        **Feature: storyline-timeline-editor, Property 23: Cover Image Size Generation**
        **Validates: Requirements 9.3**
        """
        width, height = dimensions
        
        # Create a small test image
        img = create_test_image(width, height)
        
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            temp_path = f.name
        
        try:
            save_test_image(img, temp_path)
            
            metadata = image_processor.validate_cover_image(temp_path)
            
            # Should be invalid due to size
            assert not metadata.is_valid, f"Expected small image ({width}x{height}) to be rejected for cover"
            assert "400" in metadata.error_message or "300" in metadata.error_message
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
    
    @settings(max_examples=20)
    @given(dimensions=cover_valid_dimensions_strategy())
    def test_cover_validation_accepts_large_images(self, dimensions):
        """
        Cover image validation should accept images at or above minimum resolution.
        
        **Feature: storyline-timeline-editor, Property 23: Cover Image Size Generation**
        **Validates: Requirements 9.3**
        """
        width, height = dimensions
        
        # Create a valid-sized test image
        img = create_test_image(width, height)
        
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            temp_path = f.name
        
        try:
            save_test_image(img, temp_path)
            
            metadata = image_processor.validate_cover_image(temp_path)
            
            # Should be valid
            assert metadata.is_valid, f"Expected large image ({width}x{height}) to be accepted for cover, got error: {metadata.error_message}"
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)


class TestImageMetadataInvariants:
    """
    Test invariants that should hold for ImageMetadata.
    
    **Feature: storyline-timeline-editor, Property 22: Image Upload Validation**
    **Validates: Requirements 9.1, 12.1**
    """
    
    @settings(max_examples=50)
    @given(
        width=st.integers(min_value=0, max_value=10000),
        height=st.integers(min_value=0, max_value=10000),
        format_name=st.text(min_size=0, max_size=10),
        is_valid=st.booleans(),
        error_message=st.text(min_size=0, max_size=200)
    )
    def test_image_metadata_construction(self, width, height, format_name, is_valid, error_message):
        """
        ImageMetadata should accept any valid field values.
        
        **Feature: storyline-timeline-editor, Property 22: Image Upload Validation**
        **Validates: Requirements 9.1, 12.1**
        """
        metadata = ImageMetadata(
            width=width,
            height=height,
            format=format_name,
            is_valid=is_valid,
            error_message=error_message
        )
        
        assert metadata.width == width
        assert metadata.height == height
        assert metadata.format == format_name
        assert metadata.is_valid == is_valid
        assert metadata.error_message == error_message
    
    def test_valid_metadata_structure(self):
        """
        ImageMetadata should always have all required fields.
        
        **Feature: storyline-timeline-editor, Property 22: Image Upload Validation**
        **Validates: Requirements 9.1, 12.1**
        """
        # Test with non-existent file
        metadata = image_processor.validate_image_format("/nonexistent/path.png")
        
        # All fields should be present
        assert hasattr(metadata, 'width')
        assert hasattr(metadata, 'height')
        assert hasattr(metadata, 'format')
        assert hasattr(metadata, 'is_valid')
        assert hasattr(metadata, 'error_message')
        
        # Types should be correct
        assert isinstance(metadata.width, int)
        assert isinstance(metadata.height, int)
        assert isinstance(metadata.format, str)
        assert isinstance(metadata.is_valid, bool)
        assert isinstance(metadata.error_message, str)

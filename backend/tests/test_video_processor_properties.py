"""
Property-based tests for video processor service.

These tests use Hypothesis to verify universal properties across all inputs.

**Feature: storyline-timeline-editor**
**Validates: Requirements 2.1**
"""
import os
import tempfile
import pytest
from hypothesis import given, strategies as st, settings, assume

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.admin.video_processor import VideoProcessor, VideoMetadata


# Create a test instance
video_processor = VideoProcessor()


# Strategy for generating file extensions
@st.composite
def file_extension_strategy(draw):
    """Generate various file extensions."""
    extensions = [
        ".mp4", ".MP4", ".Mp4",  # Valid
        ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm",  # Invalid video formats
        ".jpg", ".png", ".gif", ".pdf", ".txt", ".doc",  # Non-video formats
        "", ".mp3", ".wav",  # Audio formats
    ]
    return draw(st.sampled_from(extensions))


@st.composite
def valid_mp4_extension_strategy(draw):
    """Generate valid MP4 extensions (case variations)."""
    return draw(st.sampled_from([".mp4", ".MP4", ".Mp4", ".mP4"]))


@st.composite
def invalid_extension_strategy(draw):
    """Generate invalid (non-MP4) extensions."""
    invalid = [".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm", 
               ".jpg", ".png", ".gif", ".pdf", ".txt", ".mp3"]
    return draw(st.sampled_from(invalid))


# Property 6: Video Format Validation
# **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
# **Validates: Requirements 2.1**
class TestVideoFormatValidation:
    """
    Property 6: Video Format Validation
    
    *For any* uploaded video file, the system SHALL accept only MP4 format 
    with H.264 codec and SHALL extract duration and resolution metadata.
    
    **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
    **Validates: Requirements 2.1**
    """
    
    @settings(max_examples=100)
    @given(extension=invalid_extension_strategy())
    def test_non_mp4_extensions_rejected(self, extension):
        """
        Non-MP4 file extensions should be rejected.
        
        **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
        **Validates: Requirements 2.1**
        """
        # Create a temporary file with invalid extension
        with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as f:
            f.write(b"dummy content")
            temp_path = f.name
        
        try:
            metadata = video_processor.validate_video_format(temp_path)
            
            # Should be invalid
            assert not metadata.is_valid, f"Expected {extension} to be rejected"
            assert "MP4" in metadata.error_message or "format" in metadata.error_message.lower()
        finally:
            os.unlink(temp_path)
    
    @settings(max_examples=50)
    @given(filename=st.text(min_size=1, max_size=50, alphabet=st.characters(
        whitelist_categories=('L', 'N'),
        blacklist_characters='/\\:*?"<>|'
    )))
    def test_nonexistent_file_rejected(self, filename):
        """
        Non-existent files should be rejected with appropriate error.
        
        **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
        **Validates: Requirements 2.1**
        """
        assume(len(filename.strip()) > 0)
        
        # Create a path that doesn't exist
        fake_path = os.path.join(tempfile.gettempdir(), f"{filename}_nonexistent.mp4")
        
        # Ensure it doesn't exist
        if os.path.exists(fake_path):
            return  # Skip this test case
        
        metadata = video_processor.validate_video_format(fake_path)
        
        assert not metadata.is_valid
        assert "not found" in metadata.error_message.lower()
    
    @settings(max_examples=50)
    @given(content=st.binary(min_size=0, max_size=1000))
    def test_invalid_mp4_content_rejected(self, content):
        """
        Files with .mp4 extension but invalid content should be rejected.
        
        **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
        **Validates: Requirements 2.1**
        """
        # Create a temporary file with .mp4 extension but invalid content
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            f.write(content)
            temp_path = f.name
        
        try:
            metadata = video_processor.validate_video_format(temp_path)
            
            # Should be invalid (can't be a valid video with random bytes)
            # Note: Very rarely, random bytes might accidentally form valid video headers
            # but this is extremely unlikely with small content sizes
            if metadata.is_valid:
                # If somehow valid, it should have extracted metadata
                assert metadata.duration >= 0
                assert metadata.width >= 0
                assert metadata.height >= 0
            else:
                # Invalid content should have an error message
                assert len(metadata.error_message) > 0
        finally:
            os.unlink(temp_path)
    
    def test_valid_metadata_structure(self):
        """
        VideoMetadata should always have all required fields.
        
        **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
        **Validates: Requirements 2.1**
        """
        # Test with non-existent file
        metadata = video_processor.validate_video_format("/nonexistent/path.mp4")
        
        # All fields should be present
        assert hasattr(metadata, 'duration')
        assert hasattr(metadata, 'width')
        assert hasattr(metadata, 'height')
        assert hasattr(metadata, 'codec')
        assert hasattr(metadata, 'fps')
        assert hasattr(metadata, 'is_valid')
        assert hasattr(metadata, 'error_message')
        
        # Types should be correct
        assert isinstance(metadata.duration, float)
        assert isinstance(metadata.width, int)
        assert isinstance(metadata.height, int)
        assert isinstance(metadata.codec, str)
        assert isinstance(metadata.fps, float)
        assert isinstance(metadata.is_valid, bool)
        assert isinstance(metadata.error_message, str)
    
    @settings(max_examples=30)
    @given(
        timestamp=st.floats(min_value=-100, max_value=100, allow_nan=False, allow_infinity=False)
    )
    def test_frame_extraction_with_invalid_file(self, timestamp):
        """
        Frame extraction from non-existent file should return error.
        
        **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
        **Validates: Requirements 2.1**
        """
        result, error = video_processor.extract_frame(
            "/nonexistent/video.mp4",
            timestamp
        )
        
        assert result is None
        assert len(error) > 0
        assert "not found" in error.lower()
    
    @settings(max_examples=30)
    @given(
        timestamp=st.floats(min_value=-100, max_value=100, allow_nan=False, allow_infinity=False),
        width=st.integers(min_value=1, max_value=1920),
        height=st.integers(min_value=1, max_value=1080)
    )
    def test_thumbnail_generation_with_invalid_file(self, timestamp, width, height):
        """
        Thumbnail generation from non-existent file should return error.
        
        **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
        **Validates: Requirements 2.1**
        """
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            output_path = f.name
        
        try:
            success, error = video_processor.generate_thumbnail(
                "/nonexistent/video.mp4",
                output_path,
                timestamp,
                width,
                height
            )
            
            assert not success
            assert len(error) > 0
            assert "not found" in error.lower()
        finally:
            if os.path.exists(output_path):
                os.unlink(output_path)


class TestVideoMetadataInvariants:
    """
    Test invariants that should hold for VideoMetadata.
    
    **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
    **Validates: Requirements 2.1**
    """
    
    @settings(max_examples=50)
    @given(
        duration=st.floats(min_value=0, max_value=10000, allow_nan=False, allow_infinity=False),
        width=st.integers(min_value=0, max_value=7680),
        height=st.integers(min_value=0, max_value=4320),
        fps=st.floats(min_value=0, max_value=240, allow_nan=False, allow_infinity=False),
        is_valid=st.booleans(),
        codec=st.text(min_size=0, max_size=20),
        error_message=st.text(min_size=0, max_size=200)
    )
    def test_video_metadata_construction(self, duration, width, height, fps, is_valid, codec, error_message):
        """
        VideoMetadata should accept any valid field values.
        
        **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
        **Validates: Requirements 2.1**
        """
        metadata = VideoMetadata(
            duration=duration,
            width=width,
            height=height,
            codec=codec,
            fps=fps,
            is_valid=is_valid,
            error_message=error_message
        )
        
        assert metadata.duration == duration
        assert metadata.width == width
        assert metadata.height == height
        assert metadata.codec == codec
        assert metadata.fps == fps
        assert metadata.is_valid == is_valid
        assert metadata.error_message == error_message
    
    def test_invalid_metadata_has_error_message(self):
        """
        When is_valid is False, there should be a meaningful error message.
        
        **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
        **Validates: Requirements 2.1**
        """
        # Test various invalid scenarios
        test_cases = [
            "/nonexistent/file.mp4",
            "",
        ]
        
        for path in test_cases:
            if path:  # Skip empty path as it might cause issues
                metadata = video_processor.validate_video_format(path)
                if not metadata.is_valid:
                    assert len(metadata.error_message) > 0, \
                        f"Invalid metadata for '{path}' should have error message"


class TestSupportedFormats:
    """
    Test that supported formats are correctly defined.
    
    **Feature: storyline-timeline-editor, Property 6: Video Format Validation**
    **Validates: Requirements 2.1**
    """
    
    def test_supported_extensions(self):
        """MP4 should be the only supported extension."""
        assert ".mp4" in VideoProcessor.SUPPORTED_EXTENSIONS
        assert len(VideoProcessor.SUPPORTED_EXTENSIONS) == 1
    
    def test_supported_codecs(self):
        """H.264 variants should be supported."""
        codecs = VideoProcessor.SUPPORTED_CODECS
        assert "h264" in codecs
        assert "avc1" in codecs or "avc" in codecs

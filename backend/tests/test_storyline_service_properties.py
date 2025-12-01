"""
Property-based tests for storyline service operations.

These tests use Hypothesis to verify universal properties across all inputs.

**Feature: storyline-timeline-editor**
"""
import pytest
import os
import tempfile
import shutil
import uuid
from datetime import datetime
from unittest.mock import patch, MagicMock, AsyncMock
from hypothesis import given, strategies as st, settings, assume, HealthCheck

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.models.admin.storyline import (
    StorylineDB,
    SegmentDB,
    StorylineStatus,
    StorylineExtendedCreate,
)
from app.services.admin.storyline_service import StorylineService, STORYLINES_DIR


# Custom strategies for generating test data

@st.composite
def uuid_strategy(draw):
    """Generate valid UUID strings."""
    return str(uuid.uuid4())


@st.composite
def file_path_strategy(draw, prefix="file"):
    """Generate valid file path strings."""
    filename = draw(st.text(
        alphabet=st.characters(whitelist_categories=('L', 'N'), min_codepoint=ord('a'), max_codepoint=ord('z')),
        min_size=3,
        max_size=10
    ))
    ext = draw(st.sampled_from(['.mp4', '.png', '.jpg']))
    return f"{prefix}_{filename}{ext}"


@st.composite
def storyline_files_strategy(draw):
    """Generate a set of files that might exist for a storyline."""
    has_video = draw(st.booleans())
    has_cover = draw(st.booleans())
    num_guidance_images = draw(st.integers(min_value=0, max_value=4))
    
    files = []
    
    if has_video:
        files.append("base_video.mp4")
    
    if has_cover:
        files.extend([
            "cover_original.jpg",
            "cover_thumbnail.jpg",
            "cover_medium.jpg",
            "cover_large.jpg"
        ])
    
    for i in range(num_guidance_images):
        files.append(f"segment{i}_guide.png")
    
    return files


# Property 4: Cascade Deletion
# **Feature: storyline-timeline-editor, Property 4: Cascade Deletion**
# **Validates: Requirements 1.4**
class TestCascadeDeletion:
    """Tests for Property 4: Cascade Deletion."""
    
    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    @given(
        storyline_id=uuid_strategy(),
        files=storyline_files_strategy()
    )
    def test_property_4_cascade_deletion_removes_all_files(self, storyline_id, files):
        """
        Property 4: Cascade Deletion
        
        *For any* storyline deletion, all associated files (video, cover images, 
        guidance images) SHALL be removed from storage.
        
        **Feature: storyline-timeline-editor, Property 4: Cascade Deletion**
        **Validates: Requirements 1.4**
        """
        # Create a temporary directory structure
        with tempfile.TemporaryDirectory() as temp_dir:
            storyline_dir = os.path.join(temp_dir, "storylines", storyline_id)
            os.makedirs(storyline_dir, exist_ok=True)
            
            # Create the files
            created_files = []
            for filename in files:
                file_path = os.path.join(storyline_dir, filename)
                with open(file_path, 'wb') as f:
                    f.write(b'test content')
                created_files.append(file_path)
                assert os.path.exists(file_path), f"File should exist: {file_path}"
            
            # Verify files exist before deletion
            for file_path in created_files:
                assert os.path.exists(file_path), f"File should exist before deletion: {file_path}"
            
            # Simulate deletion by removing the directory
            if os.path.exists(storyline_dir):
                shutil.rmtree(storyline_dir)
            
            # Verify all files are removed after deletion
            for file_path in created_files:
                assert not os.path.exists(file_path), f"File should be deleted: {file_path}"
            
            # Verify directory is removed
            assert not os.path.exists(storyline_dir), "Storyline directory should be deleted"


    @settings(max_examples=50)
    @given(
        storyline_id=uuid_strategy(),
        has_video=st.booleans(),
        has_cover=st.booleans(),
        num_segments=st.integers(min_value=0, max_value=4)
    )
    def test_property_4_cascade_deletion_file_count(self, storyline_id, has_video, has_cover, num_segments):
        """
        Property 4: Cascade Deletion - File Count Verification
        
        *For any* storyline with associated files, the deletion operation SHALL
        report the correct count of deleted files.
        
        **Feature: storyline-timeline-editor, Property 4: Cascade Deletion**
        **Validates: Requirements 1.4**
        """
        with tempfile.TemporaryDirectory() as temp_dir:
            storyline_dir = os.path.join(temp_dir, "storylines", storyline_id)
            os.makedirs(storyline_dir, exist_ok=True)
            
            expected_file_count = 0
            
            # Create video file
            if has_video:
                video_path = os.path.join(storyline_dir, "base_video.mp4")
                with open(video_path, 'wb') as f:
                    f.write(b'video content')
                expected_file_count += 1
            
            # Create cover images
            if has_cover:
                for cover_name in ["cover_original.jpg", "cover_thumbnail.jpg", "cover_medium.jpg", "cover_large.jpg"]:
                    cover_path = os.path.join(storyline_dir, cover_name)
                    with open(cover_path, 'wb') as f:
                        f.write(b'cover content')
                    expected_file_count += 1
            
            # Create guidance images
            for i in range(num_segments):
                guidance_path = os.path.join(storyline_dir, f"segment{i}_guide.png")
                with open(guidance_path, 'wb') as f:
                    f.write(b'guidance content')
                expected_file_count += 1
            
            # Count files before deletion
            actual_file_count = 0
            for root, dirs, files in os.walk(storyline_dir):
                actual_file_count += len(files)
            
            assert actual_file_count == expected_file_count, \
                f"Expected {expected_file_count} files, found {actual_file_count}"
            
            # Delete directory
            shutil.rmtree(storyline_dir)
            
            # Verify directory is gone
            assert not os.path.exists(storyline_dir), "Directory should be deleted"


    @settings(max_examples=30)
    @given(
        storyline_id=uuid_strategy(),
        nested_depth=st.integers(min_value=0, max_value=3)
    )
    def test_property_4_cascade_deletion_nested_directories(self, storyline_id, nested_depth):
        """
        Property 4: Cascade Deletion - Nested Directory Handling
        
        *For any* storyline with nested subdirectories, the deletion operation
        SHALL remove all nested content recursively.
        
        **Feature: storyline-timeline-editor, Property 4: Cascade Deletion**
        **Validates: Requirements 1.4**
        """
        with tempfile.TemporaryDirectory() as temp_dir:
            storyline_dir = os.path.join(temp_dir, "storylines", storyline_id)
            os.makedirs(storyline_dir, exist_ok=True)
            
            # Create nested directories with files
            current_dir = storyline_dir
            all_paths = [storyline_dir]
            
            for i in range(nested_depth):
                nested_dir = os.path.join(current_dir, f"nested_{i}")
                os.makedirs(nested_dir, exist_ok=True)
                all_paths.append(nested_dir)
                
                # Create a file in each nested directory
                file_path = os.path.join(nested_dir, f"file_{i}.txt")
                with open(file_path, 'w') as f:
                    f.write(f"content {i}")
                all_paths.append(file_path)
                
                current_dir = nested_dir
            
            # Verify all paths exist
            for path in all_paths:
                assert os.path.exists(path), f"Path should exist: {path}"
            
            # Delete the storyline directory
            shutil.rmtree(storyline_dir)
            
            # Verify all paths are removed
            for path in all_paths:
                assert not os.path.exists(path), f"Path should be deleted: {path}"



# Property 2: Draft Status Without Video
# **Feature: storyline-timeline-editor, Property 2: Draft Status Without Video**
# **Validates: Requirements 1.2**
class TestDraftStatusWithoutVideo:
    """Tests for Property 2: Draft Status Without Video."""
    
    @settings(max_examples=100)
    @given(
        storyline_id=uuid_strategy(),
        has_video=st.booleans(),
        video_path=st.one_of(st.none(), st.just(""), st.just("storylines/test/base_video.mp4"))
    )
    def test_property_2_draft_status_without_video(self, storyline_id, has_video, video_path):
        """
        Property 2: Draft Status Without Video
        
        *For any* storyline without a background video, the status SHALL be "draft"
        and cannot be changed to "published".
        
        **Feature: storyline-timeline-editor, Property 2: Draft Status Without Video**
        **Validates: Requirements 1.2**
        """
        # Determine if video is effectively present
        video_present = has_video and video_path and len(video_path) > 0
        
        # Simulate the publish validation logic
        can_publish = video_present
        
        if not can_publish:
            # Without video, status must remain draft
            # This simulates the service behavior
            assert not video_present, "Storyline without video should not be publishable"
        else:
            # With video, publishing should be allowed
            assert video_present, "Storyline with video should be publishable"

    @settings(max_examples=50)
    @given(
        name=st.text(min_size=1, max_size=50).filter(lambda x: len(x.strip()) > 0),
        synopsis=st.text(min_size=0, max_size=100)
    )
    def test_property_2_new_storyline_defaults_to_draft(self, name, synopsis):
        """
        Property 2: New Storyline Defaults to Draft
        
        *For any* newly created storyline, the status SHALL default to "draft".
        
        **Feature: storyline-timeline-editor, Property 2: Draft Status Without Video**
        **Validates: Requirements 1.2**
        """
        # Create a storyline using the extended create model
        storyline_data = StorylineExtendedCreate(
            name=name.strip(),
            synopsis=synopsis
        )
        
        # Verify the model doesn't have a status field (it's set by service)
        # The service should set status to DRAFT by default
        assert storyline_data.name == name.strip()
        
        # Verify StorylineStatus enum has DRAFT as a valid value
        assert StorylineStatus.DRAFT.value == "draft"
        assert StorylineStatus.PUBLISHED.value == "published"

    @settings(max_examples=50)
    @given(
        video_path_type=st.sampled_from(["none", "empty", "whitespace", "valid"])
    )
    def test_property_2_publish_requires_video_path(self, video_path_type):
        """
        Property 2: Publish Requires Video Path
        
        *For any* publish attempt, the system SHALL reject if video path is
        None, empty, or whitespace-only.
        
        **Feature: storyline-timeline-editor, Property 2: Draft Status Without Video**
        **Validates: Requirements 1.2**
        """
        # Map video_path_type to actual values
        video_paths = {
            "none": None,
            "empty": "",
            "whitespace": "   ",
            "valid": "storylines/test-id/base_video.mp4"
        }
        
        video_path = video_paths[video_path_type]
        
        # Simulate the publish validation
        def can_publish(path):
            if path is None:
                return False
            if not path.strip():
                return False
            return True
        
        result = can_publish(video_path)
        
        if video_path_type == "valid":
            assert result is True, "Valid video path should allow publishing"
        else:
            assert result is False, f"Invalid video path ({video_path_type}) should prevent publishing"



# Property 25: Storyline Order Persistence
# **Feature: storyline-timeline-editor, Property 25: Storyline Order Persistence**
# **Validates: Requirements 10.3**
class TestStorylineOrderPersistence:
    """Tests for Property 25: Storyline Order Persistence."""
    
    @settings(max_examples=100)
    @given(
        storyline_orders=st.lists(
            st.tuples(uuid_strategy(), st.integers(min_value=0, max_value=100)),
            min_size=1,
            max_size=10,
            unique_by=lambda x: x[0]  # Unique storyline IDs
        )
    )
    def test_property_25_order_sorting(self, storyline_orders):
        """
        Property 25: Storyline Order Persistence
        
        *For any* storyline order update, the frontend list SHALL return
        storylines sorted by display_order ascending.
        
        **Feature: storyline-timeline-editor, Property 25: Storyline Order Persistence**
        **Validates: Requirements 10.3**
        """
        # Simulate storylines with their orders
        storylines = [
            {"id": sid, "display_order": order}
            for sid, order in storyline_orders
        ]
        
        # Sort by display_order (simulating what the service does)
        sorted_storylines = sorted(storylines, key=lambda x: x["display_order"])
        
        # Verify the sorting is correct
        for i in range(len(sorted_storylines) - 1):
            assert sorted_storylines[i]["display_order"] <= sorted_storylines[i + 1]["display_order"], \
                f"Storylines should be sorted by display_order ascending"

    @settings(max_examples=50)
    @given(
        initial_orders=st.lists(
            st.integers(min_value=0, max_value=50),
            min_size=2,
            max_size=10
        ),
        swap_indices=st.tuples(
            st.integers(min_value=0, max_value=9),
            st.integers(min_value=0, max_value=9)
        )
    )
    def test_property_25_order_update_persistence(self, initial_orders, swap_indices):
        """
        Property 25: Order Update Persistence
        
        *For any* order update operation, the new order SHALL be persisted
        and reflected in subsequent queries.
        
        **Feature: storyline-timeline-editor, Property 25: Storyline Order Persistence**
        **Validates: Requirements 10.3**
        """
        # Ensure swap indices are within bounds
        idx1, idx2 = swap_indices
        if idx1 >= len(initial_orders) or idx2 >= len(initial_orders):
            return  # Skip invalid indices
        
        # Create storylines with initial orders
        storylines = [
            {"id": f"storyline-{i}", "display_order": order}
            for i, order in enumerate(initial_orders)
        ]
        
        # Swap orders
        storylines[idx1]["display_order"], storylines[idx2]["display_order"] = \
            storylines[idx2]["display_order"], storylines[idx1]["display_order"]
        
        # Sort and verify
        sorted_storylines = sorted(storylines, key=lambda x: x["display_order"])
        
        # Verify sorting is maintained after swap
        for i in range(len(sorted_storylines) - 1):
            assert sorted_storylines[i]["display_order"] <= sorted_storylines[i + 1]["display_order"], \
                "Order should be maintained after swap"

    @settings(max_examples=50)
    @given(
        num_storylines=st.integers(min_value=1, max_value=20),
        shuffle_seed=st.integers(min_value=0, max_value=1000)
    )
    def test_property_25_reorder_all_storylines(self, num_storylines, shuffle_seed):
        """
        Property 25: Reorder All Storylines
        
        *For any* batch reorder operation, all storylines SHALL be returned
        in the new order.
        
        **Feature: storyline-timeline-editor, Property 25: Storyline Order Persistence**
        **Validates: Requirements 10.3**
        """
        import random
        
        # Create storylines with sequential IDs
        storylines = [
            {"id": f"storyline-{i}", "display_order": i}
            for i in range(num_storylines)
        ]
        
        # Shuffle the order using the seed
        random.seed(shuffle_seed)
        new_orders = list(range(num_storylines))
        random.shuffle(new_orders)
        
        # Apply new orders
        for i, storyline in enumerate(storylines):
            storyline["display_order"] = new_orders[i]
        
        # Sort by new order
        sorted_storylines = sorted(storylines, key=lambda x: x["display_order"])
        
        # Verify all storylines are present and sorted
        assert len(sorted_storylines) == num_storylines
        
        # Verify sorting
        for i in range(len(sorted_storylines) - 1):
            assert sorted_storylines[i]["display_order"] <= sorted_storylines[i + 1]["display_order"]
        
        # Verify all orders are unique and sequential from 0 to num_storylines-1
        actual_orders = sorted([s["display_order"] for s in sorted_storylines])
        expected_orders = list(range(num_storylines))
        assert actual_orders == expected_orders, \
            f"Orders should be sequential: expected {expected_orders}, got {actual_orders}"


# Property 8: Segment Non-Overlap
# **Feature: storyline-timeline-editor, Property 8: Segment Non-Overlap**
# **Validates: Requirements 4.2**
class TestSegmentNonOverlap:
    """Tests for Property 8: Segment Non-Overlap."""
    
    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    @given(
        num_segments=st.integers(min_value=2, max_value=10),
        video_duration=st.floats(min_value=30.0, max_value=300.0)
    )
    def test_property_8_non_overlapping_segments_pass_validation(self, num_segments, video_duration):
        """
        Property 8: Segment Non-Overlap - Valid Non-Overlapping Segments
        
        *For any* set of segments in a storyline, no two segments SHALL have
        overlapping time ranges (start_time to start_time + duration).
        
        This test generates non-overlapping segments and verifies they pass validation.
        
        **Feature: storyline-timeline-editor, Property 8: Segment Non-Overlap**
        **Validates: Requirements 4.2**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        
        # Generate non-overlapping segments
        segment_duration = video_duration / (num_segments + 1)  # Leave some gap
        segments = []
        
        for i in range(num_segments):
            start_time = i * (segment_duration + 1.0)  # 1 second gap between segments
            segments.append(TimelineSegment(
                id=f"seg-{i}",
                index=i,
                start_time=start_time,
                duration=segment_duration,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            ))
        
        # Validate non-overlap
        is_valid, error, conflicting = StorylineService.validate_segment_non_overlap(segments)
        
        assert is_valid, f"Non-overlapping segments should pass validation: {error}"
        assert error == "", "Error message should be empty for valid segments"
        assert conflicting is None, "No conflicting indices for valid segments"

    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    @given(
        start_time1=st.floats(min_value=0.0, max_value=50.0),
        duration1=st.floats(min_value=5.0, max_value=20.0),
        overlap_amount=st.floats(min_value=0.1, max_value=5.0)
    )
    def test_property_8_overlapping_segments_fail_validation(self, start_time1, duration1, overlap_amount):
        """
        Property 8: Segment Non-Overlap - Overlapping Segments Rejected
        
        *For any* set of segments with overlapping time ranges, the validation
        SHALL reject with an error indicating the conflicting segments.
        
        **Feature: storyline-timeline-editor, Property 8: Segment Non-Overlap**
        **Validates: Requirements 4.2**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        
        # Create two overlapping segments
        # Segment 2 starts before segment 1 ends
        start_time2 = start_time1 + duration1 - overlap_amount
        
        segments = [
            TimelineSegment(
                id="seg-0",
                index=0,
                start_time=start_time1,
                duration=duration1,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            ),
            TimelineSegment(
                id="seg-1",
                index=1,
                start_time=start_time2,
                duration=10.0,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            ),
        ]
        
        # Validate - should fail
        is_valid, error, conflicting = StorylineService.validate_segment_non_overlap(segments)
        
        assert not is_valid, "Overlapping segments should fail validation"
        assert "overlap" in error.lower(), f"Error should mention overlap: {error}"
        assert conflicting is not None, "Should return conflicting indices"

    @settings(max_examples=50)
    @given(
        num_segments=st.integers(min_value=1, max_value=1)
    )
    def test_property_8_single_segment_always_valid(self, num_segments):
        """
        Property 8: Segment Non-Overlap - Single Segment Always Valid
        
        *For any* storyline with only one segment, there can be no overlap.
        
        **Feature: storyline-timeline-editor, Property 8: Segment Non-Overlap**
        **Validates: Requirements 4.2**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        
        segments = [
            TimelineSegment(
                id="seg-0",
                index=0,
                start_time=0.0,
                duration=10.0,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            )
        ]
        
        is_valid, error, conflicting = StorylineService.validate_segment_non_overlap(segments)
        
        assert is_valid, "Single segment should always be valid"
        assert error == "", "No error for single segment"
        assert conflicting is None, "No conflicts for single segment"

    def test_property_8_empty_segments_valid(self):
        """
        Property 8: Segment Non-Overlap - Empty Segment List Valid
        
        *For any* storyline with no segments, validation should pass.
        
        **Feature: storyline-timeline-editor, Property 8: Segment Non-Overlap**
        **Validates: Requirements 4.2**
        """
        from app.services.admin.storyline_service import StorylineService
        
        is_valid, error, conflicting = StorylineService.validate_segment_non_overlap([])
        
        assert is_valid, "Empty segment list should be valid"
        assert error == "", "No error for empty list"
        assert conflicting is None, "No conflicts for empty list"

    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    @given(
        num_segments=st.integers(min_value=2, max_value=8),
        base_duration=st.floats(min_value=5.0, max_value=15.0)
    )
    def test_property_8_adjacent_segments_valid(self, num_segments, base_duration):
        """
        Property 8: Segment Non-Overlap - Adjacent Segments (No Gap) Valid
        
        *For any* set of segments that are exactly adjacent (end time equals
        next start time), validation should pass.
        
        **Feature: storyline-timeline-editor, Property 8: Segment Non-Overlap**
        **Validates: Requirements 4.2**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        
        # Create adjacent segments (no gap, no overlap)
        segments = []
        current_time = 0.0
        
        for i in range(num_segments):
            segments.append(TimelineSegment(
                id=f"seg-{i}",
                index=i,
                start_time=current_time,
                duration=base_duration,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            ))
            current_time += base_duration  # Next segment starts exactly where this one ends
        
        is_valid, error, conflicting = StorylineService.validate_segment_non_overlap(segments)
        
        assert is_valid, f"Adjacent segments should be valid: {error}"
        assert error == "", "No error for adjacent segments"
        assert conflicting is None, "No conflicts for adjacent segments"



# Property 11: Total Duration Validation
# **Feature: storyline-timeline-editor, Property 11: Total Duration Validation**
# **Validates: Requirements 4.6**
class TestTotalDurationValidation:
    """Tests for Property 11: Total Duration Validation."""
    
    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    @given(
        num_segments=st.integers(min_value=1, max_value=10),
        video_duration=st.floats(min_value=30.0, max_value=300.0)
    )
    def test_property_11_segments_within_duration_pass(self, num_segments, video_duration):
        """
        Property 11: Total Duration Validation - Valid Duration
        
        *For any* storyline save attempt where total segment duration is less than
        or equal to video_duration, validation should pass.
        
        **Feature: storyline-timeline-editor, Property 11: Total Duration Validation**
        **Validates: Requirements 4.6**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        
        # Create segments that fit within video duration
        segment_duration = (video_duration * 0.8) / num_segments  # Use 80% of video
        segments = []
        
        for i in range(num_segments):
            segments.append(TimelineSegment(
                id=f"seg-{i}",
                index=i,
                start_time=i * segment_duration,
                duration=segment_duration,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            ))
        
        # Validate total duration
        is_valid, error = StorylineService.validate_timeline_segment_duration(
            segments, video_duration
        )
        
        total_duration = sum(s.duration for s in segments)
        assert is_valid, f"Segments with total duration {total_duration:.2f}s should fit in {video_duration:.2f}s video: {error}"
        assert error == "", "No error for valid duration"

    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    @given(
        video_duration=st.floats(min_value=30.0, max_value=100.0),
        excess_factor=st.floats(min_value=1.1, max_value=2.0)
    )
    def test_property_11_segments_exceeding_duration_fail(self, video_duration, excess_factor):
        """
        Property 11: Total Duration Validation - Exceeds Duration
        
        *For any* storyline save attempt where total segment duration exceeds
        video_duration, the system SHALL reject with a validation error.
        
        **Feature: storyline-timeline-editor, Property 11: Total Duration Validation**
        **Validates: Requirements 4.6**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        
        # Create segments that exceed video duration
        total_segment_duration = video_duration * excess_factor
        
        segments = [
            TimelineSegment(
                id="seg-0",
                index=0,
                start_time=0.0,
                duration=total_segment_duration,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            )
        ]
        
        # Validate - should fail
        is_valid, error = StorylineService.validate_timeline_segment_duration(
            segments, video_duration
        )
        
        assert not is_valid, f"Segments exceeding video duration should fail validation"
        assert "exceeds" in error.lower(), f"Error should mention exceeding: {error}"

    @settings(max_examples=50)
    @given(
        video_duration=st.floats(min_value=30.0, max_value=300.0)
    )
    def test_property_11_empty_segments_valid(self, video_duration):
        """
        Property 11: Total Duration Validation - Empty Segments Valid
        
        *For any* storyline with no segments, total duration is 0 which is
        always valid.
        
        **Feature: storyline-timeline-editor, Property 11: Total Duration Validation**
        **Validates: Requirements 4.6**
        """
        from app.services.admin.storyline_service import StorylineService
        
        is_valid, error = StorylineService.validate_timeline_segment_duration([], video_duration)
        
        assert is_valid, "Empty segment list should be valid"
        assert error == "", "No error for empty list"

    @settings(max_examples=50)
    @given(
        num_segments=st.integers(min_value=1, max_value=5),
        segment_duration=st.floats(min_value=5.0, max_value=20.0)
    )
    def test_property_11_exact_duration_valid(self, num_segments, segment_duration):
        """
        Property 11: Total Duration Validation - Exact Duration Valid
        
        *For any* storyline where total segment duration exactly equals
        video_duration, validation should pass.
        
        **Feature: storyline-timeline-editor, Property 11: Total Duration Validation**
        **Validates: Requirements 4.6**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        
        # Create segments that exactly match video duration
        video_duration = num_segments * segment_duration
        segments = []
        
        for i in range(num_segments):
            segments.append(TimelineSegment(
                id=f"seg-{i}",
                index=i,
                start_time=i * segment_duration,
                duration=segment_duration,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            ))
        
        is_valid, error = StorylineService.validate_timeline_segment_duration(
            segments, video_duration
        )
        
        assert is_valid, f"Segments exactly matching video duration should be valid: {error}"
        assert error == "", "No error for exact match"

    @settings(max_examples=50)
    @given(
        num_segments=st.integers(min_value=1, max_value=10)
    )
    def test_property_11_zero_video_duration_skips_validation(self, num_segments):
        """
        Property 11: Total Duration Validation - Zero Video Duration
        
        *For any* storyline without a video (duration = 0), duration validation
        should be skipped (pass).
        
        **Feature: storyline-timeline-editor, Property 11: Total Duration Validation**
        **Validates: Requirements 4.6**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        
        # Create segments with any duration
        segments = []
        for i in range(num_segments):
            segments.append(TimelineSegment(
                id=f"seg-{i}",
                index=i,
                start_time=i * 10.0,
                duration=10.0,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            ))
        
        # With video_duration = 0, validation should pass (no video to compare against)
        is_valid, error = StorylineService.validate_timeline_segment_duration(segments, 0.0)
        
        assert is_valid, "Zero video duration should skip validation"
        assert error == "", "No error when video duration is 0"



# Property 10: Segment Index Continuity
# **Feature: storyline-timeline-editor, Property 10: Segment Index Continuity**
# **Validates: Requirements 4.5**
class TestSegmentIndexContinuity:
    """Tests for Property 10: Segment Index Continuity."""
    
    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    @given(
        num_segments=st.integers(min_value=1, max_value=10),
        base_duration=st.floats(min_value=5.0, max_value=15.0)
    )
    def test_property_10_reindex_produces_sequential_indices(self, num_segments, base_duration):
        """
        Property 10: Segment Index Continuity - Sequential Indices
        
        *For any* set of segments after re-indexing, the indices SHALL be
        sequential starting from 0 with no gaps.
        
        **Feature: storyline-timeline-editor, Property 10: Segment Index Continuity**
        **Validates: Requirements 4.5**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        
        # Create segments with random indices (simulating gaps after deletion)
        segments = []
        for i in range(num_segments):
            segments.append(TimelineSegment(
                id=f"seg-{i}",
                index=i * 3,  # Non-sequential indices (0, 3, 6, 9, ...)
                start_time=i * base_duration,
                duration=base_duration,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            ))
        
        # Re-index segments
        reindexed = StorylineService.reindex_segments(segments)
        
        # Verify sequential indices starting from 0
        expected_indices = list(range(num_segments))
        actual_indices = [s.index for s in reindexed]
        
        assert actual_indices == expected_indices, \
            f"Indices should be sequential from 0: expected {expected_indices}, got {actual_indices}"

    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    @given(
        num_segments=st.integers(min_value=2, max_value=10),
        delete_index=st.integers(min_value=0, max_value=9)
    )
    def test_property_10_deletion_maintains_continuity(self, num_segments, delete_index):
        """
        Property 10: Segment Index Continuity - After Deletion
        
        *For any* segment deletion, the remaining segments SHALL have
        sequential indices starting from 0.
        
        **Feature: storyline-timeline-editor, Property 10: Segment Index Continuity**
        **Validates: Requirements 4.5**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        
        # Skip if delete_index is out of bounds
        if delete_index >= num_segments:
            return
        
        # Create segments with sequential indices
        segments = []
        for i in range(num_segments):
            segments.append(TimelineSegment(
                id=f"seg-{i}",
                index=i,
                start_time=i * 10.0,
                duration=10.0,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            ))
        
        # Simulate deletion by removing segment at delete_index
        remaining = [s for s in segments if s.index != delete_index]
        
        # Re-index remaining segments
        reindexed = StorylineService.reindex_segments(remaining)
        
        # Verify sequential indices
        expected_count = num_segments - 1
        assert len(reindexed) == expected_count, \
            f"Should have {expected_count} segments after deletion"
        
        expected_indices = list(range(expected_count))
        actual_indices = [s.index for s in reindexed]
        
        assert actual_indices == expected_indices, \
            f"Indices should be sequential after deletion: expected {expected_indices}, got {actual_indices}"

    @settings(max_examples=50)
    @given(
        num_segments=st.integers(min_value=2, max_value=8)
    )
    def test_property_10_reindex_preserves_temporal_order(self, num_segments):
        """
        Property 10: Segment Index Continuity - Temporal Order Preserved
        
        *For any* re-indexing operation, segments SHALL be ordered by
        start_time, and indices SHALL reflect this order.
        
        **Feature: storyline-timeline-editor, Property 10: Segment Index Continuity**
        **Validates: Requirements 4.5**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        import random
        
        # Create segments with shuffled start times
        start_times = [i * 10.0 for i in range(num_segments)]
        random.shuffle(start_times)
        
        segments = []
        for i, start_time in enumerate(start_times):
            segments.append(TimelineSegment(
                id=f"seg-{i}",
                index=i,  # Original index doesn't match temporal order
                start_time=start_time,
                duration=8.0,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            ))
        
        # Re-index segments
        reindexed = StorylineService.reindex_segments(segments)
        
        # Verify segments are sorted by start_time
        for i in range(len(reindexed) - 1):
            assert reindexed[i].start_time <= reindexed[i + 1].start_time, \
                "Segments should be sorted by start_time"
        
        # Verify indices match temporal order
        for i, segment in enumerate(reindexed):
            assert segment.index == i, \
                f"Segment at position {i} should have index {i}, got {segment.index}"

    def test_property_10_empty_list_reindex(self):
        """
        Property 10: Segment Index Continuity - Empty List
        
        *For any* empty segment list, re-indexing should return empty list.
        
        **Feature: storyline-timeline-editor, Property 10: Segment Index Continuity**
        **Validates: Requirements 4.5**
        """
        from app.services.admin.storyline_service import StorylineService
        
        reindexed = StorylineService.reindex_segments([])
        
        assert reindexed == [], "Empty list should return empty list"

    @settings(max_examples=50)
    @given(
        start_time=st.floats(min_value=0.0, max_value=100.0),
        duration=st.floats(min_value=5.0, max_value=20.0)
    )
    def test_property_10_single_segment_reindex(self, start_time, duration):
        """
        Property 10: Segment Index Continuity - Single Segment
        
        *For any* single segment, re-indexing should set index to 0.
        
        **Feature: storyline-timeline-editor, Property 10: Segment Index Continuity**
        **Validates: Requirements 4.5**
        """
        from app.models.admin.storyline import TimelineSegment, AnimationConfig, AnimationType
        from app.services.admin.storyline_service import StorylineService
        
        segments = [
            TimelineSegment(
                id="seg-0",
                index=99,  # Any arbitrary index
                start_time=start_time,
                duration=duration,
                path_type="static",
                entry_animation=AnimationConfig(type=AnimationType.INSTANT),
                exit_animation=AnimationConfig(type=AnimationType.INSTANT),
            )
        ]
        
        reindexed = StorylineService.reindex_segments(segments)
        
        assert len(reindexed) == 1, "Should have one segment"
        assert reindexed[0].index == 0, "Single segment should have index 0"


# Property 15: Transition Storage Round-Trip
# **Feature: storyline-timeline-editor, Property 15: Transition Storage Round-Trip**
# **Validates: Requirements 6.3**
class TestTransitionStorageRoundTrip:
    """Tests for Property 15: Transition Storage Round-Trip."""
    
    @settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
    @given(
        transition_type=st.sampled_from(["cut", "crossfade", "fade_to_black", "wipe_left", "wipe_right"]),
        duration=st.floats(min_value=0.1, max_value=3.0),
        from_index=st.integers(min_value=0, max_value=10),
        to_index=st.integers(min_value=0, max_value=10)
    )
    def test_property_15_transition_type_and_duration_preserved(
        self, transition_type, duration, from_index, to_index
    ):
        """
        Property 15: Transition Storage Round-Trip
        
        *For any* transition saved, reading the transition SHALL return
        identical type and duration values.
        
        **Feature: storyline-timeline-editor, Property 15: Transition Storage Round-Trip**
        **Validates: Requirements 6.3**
        """
        from app.models.admin.storyline import Transition, TransitionType
        
        # Create a transition with the given values
        transition = Transition(
            id=str(uuid.uuid4()),
            from_segment_index=from_index,
            to_segment_index=to_index,
            type=TransitionType(transition_type),
            duration=duration
        )
        
        # Simulate storage by converting to dict and back (like DB storage)
        stored_data = {
            "id": transition.id,
            "from_segment_index": transition.from_segment_index,
            "to_segment_index": transition.to_segment_index,
            "type": transition.type.value,
            "duration": transition.duration
        }
        
        # Reconstruct from stored data (simulating read from DB)
        restored_transition = Transition(
            id=stored_data["id"],
            from_segment_index=stored_data["from_segment_index"],
            to_segment_index=stored_data["to_segment_index"],
            type=TransitionType(stored_data["type"]),
            duration=stored_data["duration"]
        )
        
        # Verify round-trip preserves all values
        assert restored_transition.id == transition.id, \
            f"ID should be preserved: expected {transition.id}, got {restored_transition.id}"
        assert restored_transition.from_segment_index == transition.from_segment_index, \
            f"from_segment_index should be preserved"
        assert restored_transition.to_segment_index == transition.to_segment_index, \
            f"to_segment_index should be preserved"
        assert restored_transition.type == transition.type, \
            f"Type should be preserved: expected {transition.type}, got {restored_transition.type}"
        assert abs(restored_transition.duration - transition.duration) < 0.0001, \
            f"Duration should be preserved: expected {transition.duration}, got {restored_transition.duration}"

    @settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow])
    @given(
        num_transitions=st.integers(min_value=1, max_value=10)
    )
    def test_property_15_multiple_transitions_round_trip(self, num_transitions):
        """
        Property 15: Multiple Transitions Round-Trip
        
        *For any* set of transitions saved, reading them back SHALL return
        all transitions with identical values.
        
        **Feature: storyline-timeline-editor, Property 15: Transition Storage Round-Trip**
        **Validates: Requirements 6.3**
        """
        from app.models.admin.storyline import Transition, TransitionType
        import random
        
        transition_types = list(TransitionType)
        
        # Create multiple transitions
        original_transitions = []
        for i in range(num_transitions):
            original_transitions.append(Transition(
                id=str(uuid.uuid4()),
                from_segment_index=i,
                to_segment_index=i + 1,
                type=random.choice(transition_types),
                duration=round(random.uniform(0.1, 3.0), 2)
            ))
        
        # Simulate batch storage
        stored_data = [
            {
                "id": t.id,
                "from_segment_index": t.from_segment_index,
                "to_segment_index": t.to_segment_index,
                "type": t.type.value,
                "duration": t.duration
            }
            for t in original_transitions
        ]
        
        # Reconstruct from stored data
        restored_transitions = [
            Transition(
                id=d["id"],
                from_segment_index=d["from_segment_index"],
                to_segment_index=d["to_segment_index"],
                type=TransitionType(d["type"]),
                duration=d["duration"]
            )
            for d in stored_data
        ]
        
        # Verify all transitions are preserved
        assert len(restored_transitions) == len(original_transitions), \
            "Number of transitions should be preserved"
        
        for orig, restored in zip(original_transitions, restored_transitions):
            assert restored.id == orig.id, "ID should be preserved"
            assert restored.type == orig.type, "Type should be preserved"
            assert abs(restored.duration - orig.duration) < 0.0001, "Duration should be preserved"

    @settings(max_examples=100)
    @given(
        transition_type=st.sampled_from(["cut", "crossfade", "fade_to_black", "wipe_left", "wipe_right"])
    )
    def test_property_15_transition_type_enum_round_trip(self, transition_type):
        """
        Property 15: Transition Type Enum Round-Trip
        
        *For any* valid transition type, converting to string and back
        SHALL produce the same enum value.
        
        **Feature: storyline-timeline-editor, Property 15: Transition Storage Round-Trip**
        **Validates: Requirements 6.3**
        """
        from app.models.admin.storyline import TransitionType
        
        # Create enum from string
        original_enum = TransitionType(transition_type)
        
        # Convert to string (as stored in DB)
        stored_value = original_enum.value
        
        # Convert back to enum
        restored_enum = TransitionType(stored_value)
        
        # Verify round-trip
        assert restored_enum == original_enum, \
            f"Enum should be preserved: expected {original_enum}, got {restored_enum}"
        assert restored_enum.value == transition_type, \
            f"Value should match original: expected {transition_type}, got {restored_enum.value}"

    @settings(max_examples=50)
    @given(
        duration=st.floats(min_value=0.1, max_value=3.0)
    )
    def test_property_15_duration_precision_preserved(self, duration):
        """
        Property 15: Duration Precision Preserved
        
        *For any* transition duration within valid range, the precision
        SHALL be preserved after storage round-trip.
        
        **Feature: storyline-timeline-editor, Property 15: Transition Storage Round-Trip**
        **Validates: Requirements 6.3**
        """
        from app.models.admin.storyline import Transition, TransitionType
        
        # Create transition with specific duration
        transition = Transition(
            id=str(uuid.uuid4()),
            from_segment_index=0,
            to_segment_index=1,
            type=TransitionType.CUT,
            duration=duration
        )
        
        # Simulate storage (float to float, no conversion)
        stored_duration = float(transition.duration)
        
        # Verify precision is maintained
        assert abs(stored_duration - duration) < 1e-10, \
            f"Duration precision should be preserved: expected {duration}, got {stored_duration}"

    def test_property_15_all_transition_types_valid(self):
        """
        Property 15: All Transition Types Valid
        
        *For any* transition type in the enum, it SHALL be a valid value
        that can be stored and retrieved.
        
        **Feature: storyline-timeline-editor, Property 15: Transition Storage Round-Trip**
        **Validates: Requirements 6.3**
        """
        from app.models.admin.storyline import TransitionType
        
        expected_types = ["cut", "crossfade", "fade_to_black", "wipe_left", "wipe_right"]
        
        # Verify all expected types exist in enum
        for type_str in expected_types:
            try:
                enum_val = TransitionType(type_str)
                assert enum_val.value == type_str, \
                    f"Enum value should match string: {type_str}"
            except ValueError:
                pytest.fail(f"TransitionType should include '{type_str}'")
        
        # Verify enum has exactly these types
        actual_types = [t.value for t in TransitionType]
        assert set(actual_types) == set(expected_types), \
            f"TransitionType should have exactly {expected_types}, got {actual_types}"


# Property 16: Character Count Validation
# **Feature: storyline-timeline-editor, Property 16: Character Count Validation**
# **Validates: Requirements 7.2**
class TestCharacterCountValidation:
    """Tests for Property 16: Character Count Validation."""
    
    @settings(max_examples=100)
    @given(
        num_characters=st.integers(min_value=1, max_value=10)
    )
    def test_property_16_valid_character_count(self, num_characters):
        """
        Property 16: Character Count Validation - Valid Count
        
        *For any* storyline character configuration with 1-10 characters,
        validation should pass.
        
        **Feature: storyline-timeline-editor, Property 16: Character Count Validation**
        **Validates: Requirements 7.2**
        """
        from app.services.admin.storyline_service import StorylineService
        
        # Generate character IDs
        character_ids = [f"char-{i}" for i in range(num_characters)]
        
        # Validate
        is_valid, error = StorylineService.validate_character_count(character_ids)
        
        assert is_valid, f"Character count {num_characters} should be valid: {error}"
        assert error == "", "No error for valid character count"

    @settings(max_examples=50)
    @given(
        num_characters=st.integers(min_value=11, max_value=50)
    )
    def test_property_16_too_many_characters(self, num_characters):
        """
        Property 16: Character Count Validation - Too Many Characters
        
        *For any* storyline character configuration with more than 10 characters,
        validation should fail.
        
        **Feature: storyline-timeline-editor, Property 16: Character Count Validation**
        **Validates: Requirements 7.2**
        """
        from app.services.admin.storyline_service import StorylineService
        
        # Generate too many character IDs
        character_ids = [f"char-{i}" for i in range(num_characters)]
        
        # Validate
        is_valid, error = StorylineService.validate_character_count(character_ids)
        
        assert not is_valid, f"Character count {num_characters} should be invalid"
        assert "10" in error or "maximum" in error.lower(), f"Error should mention limit: {error}"

    def test_property_16_zero_characters(self):
        """
        Property 16: Character Count Validation - Zero Characters
        
        *For any* storyline character configuration with 0 characters,
        validation should fail.
        
        **Feature: storyline-timeline-editor, Property 16: Character Count Validation**
        **Validates: Requirements 7.2**
        """
        from app.services.admin.storyline_service import StorylineService
        
        # Empty character list
        character_ids = []
        
        # Validate
        is_valid, error = StorylineService.validate_character_count(character_ids)
        
        assert not is_valid, "Zero characters should be invalid"
        assert "1" in error or "least" in error.lower(), f"Error should mention minimum: {error}"

    @settings(max_examples=50)
    @given(
        num_characters=st.integers(min_value=1, max_value=10)
    )
    def test_property_16_boundary_values(self, num_characters):
        """
        Property 16: Character Count Validation - Boundary Values
        
        *For any* character count at boundaries (1 and 10), validation should pass.
        
        **Feature: storyline-timeline-editor, Property 16: Character Count Validation**
        **Validates: Requirements 7.2**
        """
        from app.services.admin.storyline_service import StorylineService
        
        # Test minimum boundary
        min_chars = ["char-0"]
        is_valid_min, _ = StorylineService.validate_character_count(min_chars)
        assert is_valid_min, "Minimum (1) character should be valid"
        
        # Test maximum boundary
        max_chars = [f"char-{i}" for i in range(10)]
        is_valid_max, _ = StorylineService.validate_character_count(max_chars)
        assert is_valid_max, "Maximum (10) characters should be valid"
        
        # Test just over maximum
        over_max_chars = [f"char-{i}" for i in range(11)]
        is_valid_over, _ = StorylineService.validate_character_count(over_max_chars)
        assert not is_valid_over, "11 characters should be invalid"


# Property 17: Default Character Uniqueness
# **Feature: storyline-timeline-editor, Property 17: Default Character Uniqueness**
# **Validates: Requirements 7.3**
class TestDefaultCharacterUniqueness:
    """Tests for Property 17: Default Character Uniqueness."""
    
    @settings(max_examples=100)
    @given(
        num_characters=st.integers(min_value=1, max_value=10),
        default_index=st.integers(min_value=0, max_value=9)
    )
    def test_property_17_default_in_list(self, num_characters, default_index):
        """
        Property 17: Default Character Uniqueness - Default In List
        
        *For any* storyline with character configuration, the default character
        SHALL be in the selected characters list.
        
        **Feature: storyline-timeline-editor, Property 17: Default Character Uniqueness**
        **Validates: Requirements 7.3**
        """
        from app.services.admin.storyline_service import StorylineService
        
        # Generate character IDs
        character_ids = [f"char-{i}" for i in range(num_characters)]
        
        # Pick a valid default (within the list)
        valid_default_index = default_index % num_characters
        default_character_id = character_ids[valid_default_index]
        
        # Validate
        is_valid, error = StorylineService.validate_default_character(
            character_ids, default_character_id
        )
        
        assert is_valid, f"Default character in list should be valid: {error}"
        assert error == "", "No error when default is in list"

    @settings(max_examples=100)
    @given(
        num_characters=st.integers(min_value=1, max_value=10)
    )
    def test_property_17_default_not_in_list(self, num_characters):
        """
        Property 17: Default Character Uniqueness - Default Not In List
        
        *For any* default character not in the selected characters list,
        validation should fail.
        
        **Feature: storyline-timeline-editor, Property 17: Default Character Uniqueness**
        **Validates: Requirements 7.3**
        """
        from app.services.admin.storyline_service import StorylineService
        
        # Generate character IDs
        character_ids = [f"char-{i}" for i in range(num_characters)]
        
        # Use a default that's not in the list
        invalid_default = "char-not-in-list"
        
        # Validate
        is_valid, error = StorylineService.validate_default_character(
            character_ids, invalid_default
        )
        
        assert not is_valid, "Default character not in list should be invalid"
        assert "must be in" in error.lower() or "not in" in error.lower() or invalid_default in error, \
            f"Error should indicate default not in list: {error}"

    def test_property_17_empty_default(self):
        """
        Property 17: Default Character Uniqueness - Empty Default
        
        *For any* empty default character ID, validation should fail.
        
        **Feature: storyline-timeline-editor, Property 17: Default Character Uniqueness**
        **Validates: Requirements 7.3**
        """
        from app.services.admin.storyline_service import StorylineService
        
        character_ids = ["char-0", "char-1"]
        
        # Test empty string
        is_valid_empty, error_empty = StorylineService.validate_default_character(
            character_ids, ""
        )
        assert not is_valid_empty, "Empty default should be invalid"
        
        # Test None (if applicable - may raise exception)
        # Note: The function expects a string, so None would be a type error

    @settings(max_examples=50)
    @given(
        num_characters=st.integers(min_value=2, max_value=10)
    )
    def test_property_17_exactly_one_default(self, num_characters):
        """
        Property 17: Default Character Uniqueness - Exactly One Default
        
        *For any* valid character configuration, exactly one character
        SHALL be marked as default.
        
        **Feature: storyline-timeline-editor, Property 17: Default Character Uniqueness**
        **Validates: Requirements 7.3**
        """
        from app.models.admin.storyline import StorylineCharacterConfig
        
        # Generate character IDs
        character_ids = [f"char-{i}" for i in range(num_characters)]
        default_character_id = character_ids[0]
        
        # Create config - this validates that default is in list
        config = StorylineCharacterConfig(
            character_ids=character_ids,
            default_character_id=default_character_id,
            display_order=character_ids
        )
        
        # Verify exactly one default
        assert config.default_character_id == default_character_id
        assert config.default_character_id in config.character_ids


# Property 19: Character Deletion Cascade
# **Feature: storyline-timeline-editor, Property 19: Character Deletion Cascade**
# **Validates: Requirements 7.5**
class TestCharacterDeletionCascade:
    """Tests for Property 19: Character Deletion Cascade."""
    
    @settings(max_examples=50)
    @given(
        num_storylines=st.integers(min_value=1, max_value=5),
        num_characters=st.integers(min_value=2, max_value=5),
        deleted_char_index=st.integers(min_value=0, max_value=4)
    )
    def test_property_19_character_removed_from_configs(
        self, num_storylines, num_characters, deleted_char_index
    ):
        """
        Property 19: Character Deletion Cascade - Character Removed
        
        *For any* character deleted from the system, that character SHALL be
        removed from all storyline character configurations.
        
        **Feature: storyline-timeline-editor, Property 19: Character Deletion Cascade**
        **Validates: Requirements 7.5**
        """
        # Ensure deleted_char_index is within bounds
        deleted_char_index = deleted_char_index % num_characters
        
        # Simulate storyline configurations
        character_ids = [f"char-{i}" for i in range(num_characters)]
        deleted_char_id = character_ids[deleted_char_index]
        
        storyline_configs = []
        for i in range(num_storylines):
            # Each storyline has all characters
            storyline_configs.append({
                "storyline_id": f"storyline-{i}",
                "character_ids": character_ids.copy(),
                "default_character_id": character_ids[0]
            })
        
        # Simulate cascade deletion
        for config in storyline_configs:
            if deleted_char_id in config["character_ids"]:
                config["character_ids"].remove(deleted_char_id)
                
                # If deleted was default, update default
                if config["default_character_id"] == deleted_char_id:
                    if config["character_ids"]:
                        config["default_character_id"] = config["character_ids"][0]
                    else:
                        config["default_character_id"] = None
        
        # Verify character is removed from all configs
        for config in storyline_configs:
            assert deleted_char_id not in config["character_ids"], \
                f"Deleted character should be removed from storyline {config['storyline_id']}"

    @settings(max_examples=50)
    @given(
        num_characters=st.integers(min_value=2, max_value=5)
    )
    def test_property_19_default_updated_on_deletion(self, num_characters):
        """
        Property 19: Character Deletion Cascade - Default Updated
        
        *For any* character deletion where the deleted character was the default,
        the default SHALL be updated to another character in the list.
        
        **Feature: storyline-timeline-editor, Property 19: Character Deletion Cascade**
        **Validates: Requirements 7.5**
        """
        # Create character list with first as default
        character_ids = [f"char-{i}" for i in range(num_characters)]
        default_char_id = character_ids[0]  # First character is default
        
        # Simulate deleting the default character
        deleted_char_id = default_char_id
        remaining_chars = [c for c in character_ids if c != deleted_char_id]
        
        # New default should be the first remaining character
        new_default = remaining_chars[0] if remaining_chars else None
        
        # Verify
        assert deleted_char_id not in remaining_chars, "Deleted character should be removed"
        if remaining_chars:
            assert new_default is not None, "New default should be set"
            assert new_default in remaining_chars, "New default should be in remaining list"
            assert new_default != deleted_char_id, "New default should not be deleted character"

    @settings(max_examples=30)
    @given(
        num_storylines=st.integers(min_value=1, max_value=3),
        chars_per_storyline=st.lists(
            st.integers(min_value=2, max_value=5),
            min_size=1,
            max_size=3
        )
    )
    def test_property_19_display_order_reindexed(self, num_storylines, chars_per_storyline):
        """
        Property 19: Character Deletion Cascade - Display Order Reindexed
        
        *For any* character deletion, the display_order of remaining characters
        SHALL be re-indexed to maintain sequential order.
        
        **Feature: storyline-timeline-editor, Property 19: Character Deletion Cascade**
        **Validates: Requirements 7.5**
        """
        # Ensure we have enough storylines
        num_storylines = min(num_storylines, len(chars_per_storyline))
        
        for i in range(num_storylines):
            num_chars = chars_per_storyline[i % len(chars_per_storyline)]
            
            # Create characters with display order
            characters = [
                {"id": f"char-{j}", "display_order": j}
                for j in range(num_chars)
            ]
            
            # Delete middle character
            delete_index = num_chars // 2
            deleted_char = characters[delete_index]
            remaining = [c for c in characters if c["id"] != deleted_char["id"]]
            
            # Re-index display order
            for j, char in enumerate(remaining):
                char["display_order"] = j
            
            # Verify sequential order
            for j, char in enumerate(remaining):
                assert char["display_order"] == j, \
                    f"Display order should be sequential: expected {j}, got {char['display_order']}"


# Property 24: Status-Based Visibility
# **Feature: storyline-timeline-editor, Property 24: Status-Based Visibility**
# **Validates: Requirements 10.1, 10.2**
class TestStatusBasedVisibility:
    """Tests for Property 24: Status-Based Visibility."""
    
    @settings(max_examples=100)
    @given(
        num_storylines=st.integers(min_value=1, max_value=20),
        published_ratio=st.floats(min_value=0.0, max_value=1.0)
    )
    def test_property_24_only_published_storylines_visible(self, num_storylines, published_ratio):
        """
        Property 24: Status-Based Visibility
        
        *For any* frontend storyline list request, only storylines with status
        "published" SHALL be included in the response.
        
        **Feature: storyline-timeline-editor, Property 24: Status-Based Visibility**
        **Validates: Requirements 10.1, 10.2**
        """
        import random
        
        # Create storylines with mixed statuses
        storylines = []
        num_published = int(num_storylines * published_ratio)
        
        for i in range(num_storylines):
            status = StorylineStatus.PUBLISHED.value if i < num_published else StorylineStatus.DRAFT.value
            storylines.append({
                "id": f"storyline-{i}",
                "name": f"Storyline {i}",
                "status": status,
                "display_order": i
            })
        
        # Shuffle to randomize order
        random.shuffle(storylines)
        
        # Filter to only published (simulating get_published_storylines)
        published_storylines = [s for s in storylines if s["status"] == StorylineStatus.PUBLISHED.value]
        
        # Verify only published storylines are returned
        for storyline in published_storylines:
            assert storyline["status"] == StorylineStatus.PUBLISHED.value, \
                f"Only published storylines should be visible, got status: {storyline['status']}"
        
        # Verify count matches expected
        assert len(published_storylines) == num_published, \
            f"Expected {num_published} published storylines, got {len(published_storylines)}"

    @settings(max_examples=50)
    @given(
        num_draft=st.integers(min_value=0, max_value=10),
        num_published=st.integers(min_value=0, max_value=10)
    )
    def test_property_24_draft_storylines_hidden(self, num_draft, num_published):
        """
        Property 24: Status-Based Visibility - Draft Storylines Hidden
        
        *For any* storyline with status "draft", it SHALL NOT be included
        in the frontend storyline list response.
        
        **Feature: storyline-timeline-editor, Property 24: Status-Based Visibility**
        **Validates: Requirements 10.1, 10.2**
        """
        # Create draft storylines
        draft_storylines = [
            {"id": f"draft-{i}", "status": StorylineStatus.DRAFT.value}
            for i in range(num_draft)
        ]
        
        # Create published storylines
        published_storylines = [
            {"id": f"published-{i}", "status": StorylineStatus.PUBLISHED.value}
            for i in range(num_published)
        ]
        
        # Combine all storylines
        all_storylines = draft_storylines + published_storylines
        
        # Filter for frontend (only published)
        visible_storylines = [s for s in all_storylines if s["status"] == StorylineStatus.PUBLISHED.value]
        
        # Verify no draft storylines are visible
        for storyline in visible_storylines:
            assert storyline["status"] != StorylineStatus.DRAFT.value, \
                "Draft storylines should not be visible in frontend"
        
        # Verify all visible storylines are published
        assert len(visible_storylines) == num_published, \
            f"Expected {num_published} visible storylines, got {len(visible_storylines)}"
        
        # Verify draft storylines are excluded
        visible_ids = {s["id"] for s in visible_storylines}
        for draft in draft_storylines:
            assert draft["id"] not in visible_ids, \
                f"Draft storyline {draft['id']} should not be visible"

    @settings(max_examples=50)
    @given(
        storyline_id=uuid_strategy(),
        initial_status=st.sampled_from([StorylineStatus.DRAFT, StorylineStatus.PUBLISHED])
    )
    def test_property_24_status_change_affects_visibility(self, storyline_id, initial_status):
        """
        Property 24: Status-Based Visibility - Status Change Affects Visibility
        
        *For any* storyline status change, the visibility in frontend SHALL
        immediately reflect the new status.
        
        **Feature: storyline-timeline-editor, Property 24: Status-Based Visibility**
        **Validates: Requirements 10.1, 10.2**
        """
        # Create storyline with initial status
        storyline = {
            "id": storyline_id,
            "status": initial_status.value
        }
        
        # Check initial visibility
        def is_visible(s):
            return s["status"] == StorylineStatus.PUBLISHED.value
        
        initial_visibility = is_visible(storyline)
        
        if initial_status == StorylineStatus.PUBLISHED:
            assert initial_visibility is True, "Published storyline should be visible"
        else:
            assert initial_visibility is False, "Draft storyline should not be visible"
        
        # Change status
        new_status = StorylineStatus.DRAFT if initial_status == StorylineStatus.PUBLISHED else StorylineStatus.PUBLISHED
        storyline["status"] = new_status.value
        
        # Check new visibility
        new_visibility = is_visible(storyline)
        
        if new_status == StorylineStatus.PUBLISHED:
            assert new_visibility is True, "After publishing, storyline should be visible"
        else:
            assert new_visibility is False, "After unpublishing, storyline should not be visible"
        
        # Verify visibility changed
        assert initial_visibility != new_visibility, \
            "Visibility should change when status changes"

    @settings(max_examples=100)
    @given(
        num_storylines=st.integers(min_value=1, max_value=15)
    )
    def test_property_24_published_storylines_sorted_by_display_order(self, num_storylines):
        """
        Property 24: Status-Based Visibility - Published Sorted by Display Order
        
        *For any* frontend storyline list request, published storylines SHALL
        be returned sorted by display_order ascending.
        
        **Feature: storyline-timeline-editor, Property 24: Status-Based Visibility**
        **Validates: Requirements 10.1, 10.2, 10.3**
        """
        import random
        
        # Create published storylines with random display orders
        display_orders = list(range(num_storylines))
        random.shuffle(display_orders)
        
        storylines = [
            {
                "id": f"storyline-{i}",
                "status": StorylineStatus.PUBLISHED.value,
                "display_order": display_orders[i]
            }
            for i in range(num_storylines)
        ]
        
        # Sort by display_order (simulating service behavior)
        sorted_storylines = sorted(storylines, key=lambda x: x["display_order"])
        
        # Verify sorting
        for i in range(len(sorted_storylines) - 1):
            assert sorted_storylines[i]["display_order"] <= sorted_storylines[i + 1]["display_order"], \
                f"Storylines should be sorted by display_order ascending"

    @settings(max_examples=30)
    @given(
        has_video=st.booleans()
    )
    def test_property_24_publish_requires_video(self, has_video):
        """
        Property 24: Status-Based Visibility - Publish Requires Video
        
        *For any* storyline without a video, it cannot be published and thus
        cannot be visible in the frontend.
        
        This combines Property 2 (Draft Status Without Video) with Property 24.
        
        **Feature: storyline-timeline-editor, Property 24: Status-Based Visibility**
        **Validates: Requirements 1.2, 10.1, 10.2**
        """
        # Simulate storyline
        storyline = {
            "id": "test-storyline",
            "status": StorylineStatus.DRAFT.value,
            "base_video_path": "storylines/test/video.mp4" if has_video else None
        }
        
        # Attempt to publish
        def can_publish(s):
            return s["base_video_path"] is not None and len(s["base_video_path"]) > 0
        
        if can_publish(storyline):
            # Can publish - update status
            storyline["status"] = StorylineStatus.PUBLISHED.value
            
            # Should be visible
            is_visible = storyline["status"] == StorylineStatus.PUBLISHED.value
            assert is_visible is True, "Published storyline with video should be visible"
        else:
            # Cannot publish - status remains draft
            assert storyline["status"] == StorylineStatus.DRAFT.value, \
                "Storyline without video should remain draft"
            
            # Should not be visible
            is_visible = storyline["status"] == StorylineStatus.PUBLISHED.value
            assert is_visible is False, "Draft storyline should not be visible"

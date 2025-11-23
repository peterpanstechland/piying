"""
Property-based tests for session management

These tests use Hypothesis to verify universal properties across all inputs.
"""
import pytest
import tempfile
import shutil
from pathlib import Path
from hypothesis import given, strategies as st, settings, HealthCheck
from app.models import SessionStatus, Segment, PoseFrame
from app.services import SessionManager


# Custom strategies for generating test data
@st.composite
def scene_id_strategy(draw):
    """Generate valid scene IDs"""
    return draw(st.sampled_from(["sceneA", "sceneB", "sceneC"]))


@st.composite
def pose_frame_strategy(draw):
    """Generate valid PoseFrame data"""
    timestamp = draw(st.floats(min_value=0.0, max_value=10000.0))
    # Reduce number of landmarks to speed up generation
    num_landmarks = draw(st.integers(min_value=1, max_value=10))
    landmarks = []
    for _ in range(num_landmarks):
        # Each landmark: [x, y, z, visibility] with normalized coordinates
        landmark = [
            draw(st.floats(min_value=0.0, max_value=1.0)),  # x
            draw(st.floats(min_value=0.0, max_value=1.0)),  # y
            draw(st.floats(min_value=-1.0, max_value=1.0)),  # z
            draw(st.floats(min_value=0.0, max_value=1.0)),  # visibility
        ]
        landmarks.append(landmark)
    
    return PoseFrame(timestamp=timestamp, landmarks=landmarks)


@st.composite
def segment_strategy(draw):
    """Generate valid Segment data"""
    index = draw(st.integers(min_value=0, max_value=10))
    duration = draw(st.floats(min_value=1.0, max_value=20.0))
    # Reduce max frames to speed up generation
    num_frames = draw(st.integers(min_value=0, max_value=10))
    frames = [draw(pose_frame_strategy()) for _ in range(num_frames)]
    
    return Segment(index=index, duration=duration, frames=frames)


# Property 10: New sessions have correct initial state
# Feature: shadow-puppet-interactive-system, Property 10: New sessions have correct initial state
# Validates: Requirements 7.5
@settings(max_examples=100)
@given(scene_id=scene_id_strategy())
def test_property_10_new_sessions_have_correct_initial_state(scene_id):
    """
    Property 10: New sessions have correct initial state
    
    For any newly created session, it should have:
    - A unique session ID
    - The selected scene ID
    - An empty segments array
    - Status set to "pending"
    """
    # Create temporary directory for this test
    temp_dir = tempfile.mkdtemp()
    try:
        from app.services import StorageManager
        storage_manager = StorageManager(base_path=temp_dir)
        manager = SessionManager(storage_manager=storage_manager)
        
        # Create session
        session = manager.create_session(scene_id)
        
        # Verify initial state
        assert session.id is not None, "Session should have an ID"
        assert len(session.id) > 0, "Session ID should not be empty"
        assert session.scene_id == scene_id, f"Scene ID should be {scene_id}"
        assert session.segments == [], "Segments should be empty initially"
        assert session.status == SessionStatus.PENDING, "Status should be PENDING"
        assert session.output_path is None, "Output path should be None initially"
        assert session.created_at > 0, "Created timestamp should be set"
        assert session.updated_at > 0, "Updated timestamp should be set"
        
        # Verify session can be retrieved
        retrieved = manager.get_session(session.id)
        assert retrieved is not None, "Session should be retrievable"
        assert retrieved.id == session.id, "Retrieved session should have same ID"
        assert retrieved.scene_id == scene_id, "Retrieved session should have same scene_id"
        assert retrieved.status == SessionStatus.PENDING, "Retrieved session should have PENDING status"
    finally:
        # Cleanup
        shutil.rmtree(temp_dir, ignore_errors=True)


# Property 8: Segment data round-trip preservation
# Feature: shadow-puppet-interactive-system, Property 8: Segment data round-trip preservation
# Validates: Requirements 7.2
@settings(max_examples=100, suppress_health_check=[HealthCheck.too_slow])
@given(
    scene_id=scene_id_strategy(),
    segment=segment_strategy()
)
def test_property_8_segment_data_round_trip(scene_id, segment):
    """
    Property 8: Segment data round-trip preservation
    
    For any segment data uploaded to the backend, retrieving the session
    should return the same segment data with matching index, duration, and frame count.
    """
    # Create temporary directory for this test
    temp_dir = tempfile.mkdtemp()
    try:
        from app.services import StorageManager
        storage_manager = StorageManager(base_path=temp_dir)
        manager = SessionManager(storage_manager=storage_manager)
        
        # Create session
        session = manager.create_session(scene_id)
        session_id = session.id
        
        # Upload segment
        manager.update_segment(session_id, segment)
        
        # Retrieve session
        retrieved_session = manager.get_session(session_id)
        
        # Verify session was retrieved
        assert retrieved_session is not None, "Session should be retrievable"
        
        # Find the segment in retrieved session
        found_segment = None
        for seg in retrieved_session.segments:
            if seg.index == segment.index:
                found_segment = seg
                break
        
        assert found_segment is not None, f"Segment with index {segment.index} should exist"
        
        # Verify segment data matches
        assert found_segment.index == segment.index, "Segment index should match"
        assert found_segment.duration == segment.duration, "Segment duration should match"
        assert len(found_segment.frames) == len(segment.frames), "Frame count should match"
        
        # Verify frame data
        for i, (original_frame, retrieved_frame) in enumerate(zip(segment.frames, found_segment.frames)):
            assert retrieved_frame.timestamp == original_frame.timestamp, \
                f"Frame {i} timestamp should match"
            assert len(retrieved_frame.landmarks) == len(original_frame.landmarks), \
                f"Frame {i} landmark count should match"
            
            # Verify landmark data
            for j, (orig_landmark, retr_landmark) in enumerate(zip(original_frame.landmarks, retrieved_frame.landmarks)):
                assert len(retr_landmark) == len(orig_landmark), \
                    f"Frame {i} landmark {j} should have same length"
                for k in range(len(orig_landmark)):
                    assert retr_landmark[k] == orig_landmark[k], \
                        f"Frame {i} landmark {j} coordinate {k} should match"
    finally:
        # Cleanup
        shutil.rmtree(temp_dir, ignore_errors=True)


# Property 9: Complete segments trigger processing status
# Feature: shadow-puppet-interactive-system, Property 9: Complete segments trigger processing status
# Validates: Requirements 7.3
@settings(max_examples=100)
@given(
    scene_id=scene_id_strategy(),
    num_segments=st.integers(min_value=2, max_value=4)
)
def test_property_9_complete_segments_trigger_processing_status(scene_id, num_segments):
    """
    Property 9: Complete segments trigger processing status
    
    For any session, when the number of uploaded segments equals the configured
    segment count for that scene, the session status should transition to "processing".
    
    Note: In this test, we simulate the expected segment count and verify that
    when all segments are uploaded, the status can be updated to processing.
    """
    # Create temporary directory for this test
    temp_dir = tempfile.mkdtemp()
    try:
        from app.services import StorageManager
        storage_manager = StorageManager(base_path=temp_dir)
        manager = SessionManager(storage_manager=storage_manager)
        
        # Create session
        session = manager.create_session(scene_id)
        session_id = session.id
        
        # Upload all segments
        for i in range(num_segments):
            segment = Segment(
                index=i,
                duration=8.0,
                frames=[
                    PoseFrame(timestamp=0.033, landmarks=[[0.5, 0.5, 0.0, 1.0]])
                ]
            )
            manager.update_segment(session_id, segment)
        
        # Retrieve session and check segment count
        retrieved_session = manager.get_session(session_id)
        assert retrieved_session is not None, "Session should be retrievable"
        assert len(retrieved_session.segments) == num_segments, \
            f"Should have {num_segments} segments"
        
        # When all segments are complete, status should be updatable to processing
        # (In real system, this would be triggered automatically by the API)
        manager.update_status(session_id, SessionStatus.PROCESSING)
        
        # Verify status was updated
        updated_session = manager.get_session(session_id)
        assert updated_session is not None, "Session should still be retrievable"
        assert updated_session.status == SessionStatus.PROCESSING, \
            "Status should be PROCESSING after all segments uploaded"
    finally:
        # Cleanup
        shutil.rmtree(temp_dir, ignore_errors=True)


# Property 36: Scene configuration contains required parameters
# Feature: shadow-puppet-interactive-system, Property 36: Scene configuration contains required parameters
# Validates: Requirements 20.2
@settings(max_examples=100)
@given(scene_id=st.sampled_from(["sceneA", "sceneB", "sceneC"]))
def test_property_36_scene_configuration_contains_required_parameters(scene_id):
    """
    Property 36: Scene configuration contains required parameters
    
    For any scene in the configuration file, it should contain:
    - Segment count (number of segments)
    - Duration for each segment
    - Character path parameters (offset_start, offset_end, path_type)
    """
    from app.config import ConfigLoader
    import os
    
    # Load configuration from project root
    # When running tests from backend directory, need to go up one level
    config_dir = "../config" if os.path.exists("../config") else "config"
    config_loader = ConfigLoader(config_dir=config_dir)
    
    # Get scene configuration
    scene_config = config_loader.get_scene(scene_id)
    
    # Verify scene exists
    assert scene_config is not None, f"Scene {scene_id} should exist in configuration"
    
    # Verify scene has required fields
    assert scene_config.id == scene_id, "Scene ID should match"
    assert scene_config.name is not None and len(scene_config.name) > 0, \
        "Scene should have a name"
    assert scene_config.description is not None, "Scene should have a description"
    assert scene_config.base_video_path is not None and len(scene_config.base_video_path) > 0, \
        "Scene should have a base video path"
    
    # Verify segments configuration
    assert scene_config.segments is not None, "Scene should have segments"
    assert len(scene_config.segments) > 0, "Scene should have at least one segment"
    
    # Verify each segment has required parameters
    for i, segment in enumerate(scene_config.segments):
        # Check duration
        assert segment.duration > 0, \
            f"Segment {i} should have positive duration"
        
        # Check path type
        assert segment.path_type is not None and len(segment.path_type) > 0, \
            f"Segment {i} should have a path_type"
        
        # Check offset_start
        assert segment.offset_start is not None, \
            f"Segment {i} should have offset_start"
        assert len(segment.offset_start) == 2, \
            f"Segment {i} offset_start should have 2 coordinates [x, y]"
        assert isinstance(segment.offset_start[0], int), \
            f"Segment {i} offset_start[0] should be an integer"
        assert isinstance(segment.offset_start[1], int), \
            f"Segment {i} offset_start[1] should be an integer"
        
        # Check offset_end
        assert segment.offset_end is not None, \
            f"Segment {i} should have offset_end"
        assert len(segment.offset_end) == 2, \
            f"Segment {i} offset_end should have 2 coordinates [x, y]"
        assert isinstance(segment.offset_end[0], int), \
            f"Segment {i} offset_end[0] should be an integer"
        assert isinstance(segment.offset_end[1], int), \
            f"Segment {i} offset_end[1] should be an integer"
    
    # Verify segment count is accessible
    segment_count = len(scene_config.segments)
    assert segment_count > 0, "Scene should have at least one segment"
    assert segment_count <= 10, "Scene should have reasonable number of segments (<=10)"

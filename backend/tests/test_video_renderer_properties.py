"""
Property-based tests for video rendering

These tests use Hypothesis to verify universal properties across all inputs.
"""
import pytest
import tempfile
import shutil
import cv2
import numpy as np
from pathlib import Path
from hypothesis import given, strategies as st, settings, assume, HealthCheck
from app.models import Session, SessionStatus, Segment, PoseFrame
from app.services import VideoRenderer, CharacterPath
from app.config import ConfigLoader, SceneConfig, SegmentConfig


# Custom strategies for generating test data
@st.composite
def scene_id_strategy(draw):
    """Generate valid scene IDs"""
    return draw(st.sampled_from(["sceneA", "sceneB", "sceneC"]))


@st.composite
def pose_frame_strategy(draw):
    """Generate valid PoseFrame data with 33 landmarks (MediaPipe Pose format)"""
    timestamp = draw(st.floats(min_value=0.0, max_value=10000.0))
    landmarks = []
    for _ in range(33):  # MediaPipe Pose has 33 landmarks
        landmark = [
            draw(st.floats(min_value=0.0, max_value=1.0)),  # x (normalized)
            draw(st.floats(min_value=0.0, max_value=1.0)),  # y (normalized)
            draw(st.floats(min_value=-1.0, max_value=1.0)),  # z
            draw(st.floats(min_value=0.5, max_value=1.0)),  # visibility (keep high for testing)
        ]
        landmarks.append(landmark)
    
    return PoseFrame(timestamp=timestamp, landmarks=landmarks)


@st.composite
def segment_with_frames_strategy(draw, index, duration):
    """Generate Segment with frames covering the duration"""
    # Generate frames at regular intervals
    fps = 30
    num_frames = int(duration * fps)
    frames = []
    
    for i in range(min(num_frames, 10)):  # Limit to 10 frames for speed
        timestamp_ms = (i / fps) * 1000
        frame = draw(pose_frame_strategy())
        frame.timestamp = timestamp_ms
        frames.append(frame)
    
    return Segment(index=index, duration=duration, frames=frames)


def create_test_video(path: Path, width: int = 640, height: int = 480, fps: int = 30, duration: float = 5.0):
    """Create a test video file for testing"""
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    out = cv2.VideoWriter(str(path), fourcc, fps, (width, height))
    
    num_frames = int(fps * duration)
    for i in range(num_frames):
        # Create a simple gradient frame
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        frame[:, :] = (i * 255 // num_frames, 100, 150)
        out.write(frame)
    
    out.release()


# Property 11: Rendered video uses correct time windows
# Feature: shadow-puppet-interactive-system, Property 11: Rendered video uses correct time windows
# Validates: Requirements 8.2
@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large])
@given(
    global_time=st.floats(min_value=0.0, max_value=15.0),
    segment_durations=st.lists(
        st.floats(min_value=2.0, max_value=5.0),
        min_size=2,
        max_size=3
    )
)
def test_property_11_time_window_mapping(global_time, segment_durations):
    """
    Property 11: Rendered video uses correct time windows
    
    For any frame at global time T in the rendered video, the pose data
    should come from the segment whose time window contains T.
    """
    # Create segments with frames
    segments = []
    for i, duration in enumerate(segment_durations):
        # Create simple segment with one frame
        segment = Segment(
            index=i,
            duration=duration,
            frames=[
                PoseFrame(
                    timestamp=duration * 500,  # Middle of segment in ms
                    landmarks=[[0.5, 0.5, 0.0, 1.0]] * 33
                )
            ]
        )
        segments.append(segment)
    
    # Calculate total duration
    total_duration = sum(segment_durations)
    
    # Only test times within the total duration
    assume(global_time < total_duration)
    
    # Create temporary scene config
    temp_dir = tempfile.mkdtemp()
    try:
        # Create test video
        test_video_path = Path(temp_dir) / "test_base.mp4"
        create_test_video(test_video_path, duration=total_duration)
        
        # Create scene config
        segment_configs = []
        for duration in segment_durations:
            segment_configs.append(
                SegmentConfig(
                    duration=duration,
                    path_type="static",
                    offset_start=[0, 0],
                    offset_end=[0, 0]
                )
            )
        
        scene_config = SceneConfig(
            id="test_scene",
            name="Test Scene",
            name_en="Test Scene",
            description="Test",
            description_en="Test",
            base_video_path=str(test_video_path),
            icon="🎭",
            segments=segment_configs
        )
        
        # Create renderer
        renderer = VideoRenderer(scene_config, output_dir=temp_dir)
        
        # Test the time window mapping
        pose_frame = renderer._map_pose_to_frame(global_time, segments)
        
        # Determine which segment should contain this time
        cumulative_time = 0.0
        expected_segment_index = None
        
        for i, duration in enumerate(segment_durations):
            if cumulative_time <= global_time < cumulative_time + duration:
                expected_segment_index = i
                break
            cumulative_time += duration
        
        # Verify the result
        if expected_segment_index is not None:
            # Should find a pose frame from the correct segment
            assert pose_frame is not None, \
                f"Should find pose data for time {global_time} in segment {expected_segment_index}"
            
            # The pose frame should come from the expected segment
            # (We can verify this by checking it matches one of the frames in that segment)
            expected_segment = segments[expected_segment_index]
            assert pose_frame in expected_segment.frames, \
                f"Pose frame should come from segment {expected_segment_index}"
        else:
            # Time is outside all segments
            assert pose_frame is None, \
                f"Should not find pose data for time {global_time} outside segment windows"
    
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


# Property 12: Rendering completion updates status and creates file
# Feature: shadow-puppet-interactive-system, Property 12: Rendering completion updates status and creates file
# Validates: Requirements 8.4
@settings(max_examples=15, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    scene_id=scene_id_strategy(),
    num_segments=st.integers(min_value=1, max_value=3)
)
def test_property_12_rendering_completion(scene_id, num_segments):
    """
    Property 12: Rendering completion updates status and creates file
    
    For any session that completes rendering, the output file should exist
    at path `final_{sessionId}.mp4` and the session status should be "done".
    """
    temp_dir = tempfile.mkdtemp()
    try:
        # Create test base video
        test_video_path = Path(temp_dir) / "test_base.mp4"
        total_duration = num_segments * 5.0
        create_test_video(test_video_path, duration=total_duration)
        
        # Create scene config
        segment_configs = []
        for i in range(num_segments):
            segment_configs.append(
                SegmentConfig(
                    duration=5.0,
                    path_type="static",
                    offset_start=[0, 0],
                    offset_end=[0, 0]
                )
            )
        
        scene_config = SceneConfig(
            id=scene_id,
            name="Test Scene",
            name_en="Test Scene",
            description="Test",
            description_en="Test",
            base_video_path=str(test_video_path),
            icon="🎭",
            segments=segment_configs
        )
        
        # Create session with segments
        from app.services import SessionManager, StorageManager
        storage_manager = StorageManager(base_path=temp_dir)
        session_manager = SessionManager(storage_manager)
        
        session = session_manager.create_session(scene_id)
        session_id = session.id
        
        # Add segments with pose data
        for i in range(num_segments):
            segment = Segment(
                index=i,
                duration=5.0,
                frames=[
                    PoseFrame(
                        timestamp=j * 33.33,  # ~30 FPS
                        landmarks=[[0.5 + j * 0.01, 0.5, 0.0, 0.9]] * 33
                    )
                    for j in range(5)  # Just a few frames for speed
                ]
            )
            session_manager.update_segment(session_id, segment)
        
        # Get updated session
        session = session_manager.get_session(session_id)
        
        # Render video
        renderer = VideoRenderer(scene_config, output_dir=temp_dir)
        output_path = renderer.render_video(session)
        
        # Verify output file exists
        assert Path(output_path).exists(), \
            f"Output video file should exist at {output_path}"
        
        # Verify filename matches expected pattern
        expected_filename = f"final_{session_id}.mp4"
        assert Path(output_path).name == expected_filename, \
            f"Output filename should be {expected_filename}"
        
        # Update session status to done
        session_manager.update_status(session_id, SessionStatus.DONE, output_path)
        
        # Verify status was updated
        updated_session = session_manager.get_session(session_id)
        assert updated_session.status == SessionStatus.DONE, \
            "Session status should be DONE after rendering"
        assert updated_session.output_path == output_path, \
            "Session should have output_path set"
    
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


# Property 25: Rendered video matches base video resolution
# Feature: shadow-puppet-interactive-system, Property 25: Rendered video matches base video resolution
# Validates: Requirements 15.1
@settings(max_examples=15, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    width=st.integers(min_value=320, max_value=1920).filter(lambda x: x % 2 == 0),
    height=st.integers(min_value=240, max_value=1080).filter(lambda x: x % 2 == 0)
)
def test_property_25_video_resolution(width, height):
    """
    Property 25: Rendered video matches base video resolution
    
    For any rendered video, the output resolution should exactly match
    the base scene video resolution.
    """
    temp_dir = tempfile.mkdtemp()
    try:
        # Create test base video with specific resolution
        test_video_path = Path(temp_dir) / "test_base.mp4"
        create_test_video(test_video_path, width=width, height=height, duration=3.0)
        
        # Create scene config
        scene_config = SceneConfig(
            id="test_scene",
            name="Test Scene",
            name_en="Test Scene",
            description="Test",
            description_en="Test",
            base_video_path=str(test_video_path),
            icon="🎭",
            segments=[
                SegmentConfig(
                    duration=3.0,
                    path_type="static",
                    offset_start=[0, 0],
                    offset_end=[0, 0]
                )
            ]
        )
        
        # Create session with one segment
        from app.services import SessionManager, StorageManager
        storage_manager = StorageManager(base_path=temp_dir)
        session_manager = SessionManager(storage_manager)
        
        session = session_manager.create_session("test_scene")
        segment = Segment(
            index=0,
            duration=3.0,
            frames=[
                PoseFrame(
                    timestamp=i * 33.33,
                    landmarks=[[0.5, 0.5, 0.0, 0.9]] * 33
                )
                for i in range(3)
            ]
        )
        session_manager.update_segment(session.id, segment)
        session = session_manager.get_session(session.id)
        
        # Render video
        renderer = VideoRenderer(scene_config, output_dir=temp_dir)
        output_path = renderer.render_video(session)
        
        # Check output video resolution
        cap = cv2.VideoCapture(output_path)
        assert cap.isOpened(), "Output video should be readable"
        
        output_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        output_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()
        
        # Verify resolution matches
        assert output_width == width, \
            f"Output width {output_width} should match base video width {width}"
        assert output_height == height, \
            f"Output height {output_height} should match base video height {height}"
    
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


# Property 26: Rendered video maintains target frame rate
# Feature: shadow-puppet-interactive-system, Property 26: Rendered video maintains target frame rate
# Validates: Requirements 15.2
@settings(max_examples=15, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    base_fps=st.integers(min_value=24, max_value=60)
)
def test_property_26_video_frame_rate(base_fps):
    """
    Property 26: Rendered video maintains target frame rate
    
    For any rendered video, the frame rate should be 30 FPS (±1 FPS tolerance).
    Note: The output FPS is determined by the base video FPS.
    """
    temp_dir = tempfile.mkdtemp()
    try:
        # Create test base video with specific FPS
        test_video_path = Path(temp_dir) / "test_base.mp4"
        create_test_video(test_video_path, fps=base_fps, duration=2.0)
        
        # Create scene config
        scene_config = SceneConfig(
            id="test_scene",
            name="Test Scene",
            name_en="Test Scene",
            description="Test",
            description_en="Test",
            base_video_path=str(test_video_path),
            icon="🎭",
            segments=[
                SegmentConfig(
                    duration=2.0,
                    path_type="static",
                    offset_start=[0, 0],
                    offset_end=[0, 0]
                )
            ]
        )
        
        # Create session with one segment
        from app.services import SessionManager, StorageManager
        storage_manager = StorageManager(base_path=temp_dir)
        session_manager = SessionManager(storage_manager)
        
        session = session_manager.create_session("test_scene")
        segment = Segment(
            index=0,
            duration=2.0,
            frames=[
                PoseFrame(
                    timestamp=i * 33.33,
                    landmarks=[[0.5, 0.5, 0.0, 0.9]] * 33
                )
                for i in range(3)
            ]
        )
        session_manager.update_segment(session.id, segment)
        session = session_manager.get_session(session.id)
        
        # Render video
        renderer = VideoRenderer(scene_config, output_dir=temp_dir)
        output_path = renderer.render_video(session)
        
        # Check output video FPS
        cap = cv2.VideoCapture(output_path)
        assert cap.isOpened(), "Output video should be readable"
        
        output_fps = int(cap.get(cv2.CAP_PROP_FPS))
        cap.release()
        
        # Verify FPS matches base video FPS (within tolerance)
        assert abs(output_fps - base_fps) <= 1, \
            f"Output FPS {output_fps} should match base video FPS {base_fps} (±1 FPS tolerance)"
    
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


# Property 27: Rendered video uses H.264 codec
# Feature: shadow-puppet-interactive-system, Property 27: Rendered video uses H.264 codec
# Validates: Requirements 15.4
@settings(max_examples=15, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(scene_id=scene_id_strategy())
def test_property_27_video_codec(scene_id):
    """
    Property 27: Rendered video uses H.264 codec
    
    For any rendered video file, the video codec should be H.264.
    """
    temp_dir = tempfile.mkdtemp()
    try:
        # Create test base video
        test_video_path = Path(temp_dir) / "test_base.mp4"
        create_test_video(test_video_path, duration=2.0)
        
        # Create scene config
        scene_config = SceneConfig(
            id=scene_id,
            name="Test Scene",
            name_en="Test Scene",
            description="Test",
            description_en="Test",
            base_video_path=str(test_video_path),
            icon="🎭",
            segments=[
                SegmentConfig(
                    duration=2.0,
                    path_type="static",
                    offset_start=[0, 0],
                    offset_end=[0, 0]
                )
            ]
        )
        
        # Create session with one segment
        from app.services import SessionManager, StorageManager
        storage_manager = StorageManager(base_path=temp_dir)
        session_manager = SessionManager(storage_manager)
        
        session = session_manager.create_session(scene_id)
        segment = Segment(
            index=0,
            duration=2.0,
            frames=[
                PoseFrame(
                    timestamp=i * 33.33,
                    landmarks=[[0.5, 0.5, 0.0, 0.9]] * 33
                )
                for i in range(3)
            ]
        )
        session_manager.update_segment(session.id, segment)
        session = session_manager.get_session(session.id)
        
        # Render video
        renderer = VideoRenderer(scene_config, output_dir=temp_dir)
        output_path = renderer.render_video(session)
        
        # Verify file exists and is a valid video
        assert Path(output_path).exists(), "Output video should exist"
        
        cap = cv2.VideoCapture(output_path)
        assert cap.isOpened(), "Output video should be readable"
        
        # Get codec information
        fourcc = int(cap.get(cv2.CAP_PROP_FOURCC))
        codec_str = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)])
        cap.release()
        
        # H.264 codec can be represented as 'avc1', 'h264', 'H264', or 'x264'
        h264_codecs = ['avc1', 'h264', 'H264', 'x264', 'AVC1']
        assert codec_str in h264_codecs, \
            f"Video codec should be H.264 (got '{codec_str}')"
    
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


# Property 37: Rendering applies scene-specific parameters
# Feature: shadow-puppet-interactive-system, Property 37: Rendering applies scene-specific parameters
# Validates: Requirements 20.4
@settings(max_examples=15, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    scene_id=scene_id_strategy(),
    offset_x=st.integers(min_value=-200, max_value=200),
    offset_y=st.integers(min_value=-200, max_value=200)
)
def test_property_37_scene_parameters(scene_id, offset_x, offset_y):
    """
    Property 37: Rendering applies scene-specific parameters
    
    For any video rendering, the system should use the segment durations
    and character paths defined in that scene's configuration.
    """
    temp_dir = tempfile.mkdtemp()
    try:
        # Create test base video
        test_video_path = Path(temp_dir) / "test_base.mp4"
        duration = 5.0
        create_test_video(test_video_path, duration=duration)
        
        # Create scene config with specific parameters
        scene_config = SceneConfig(
            id=scene_id,
            name="Test Scene",
            name_en="Test Scene",
            description="Test",
            description_en="Test",
            base_video_path=str(test_video_path),
            icon="🎭",
            segments=[
                SegmentConfig(
                    duration=duration,
                    path_type="custom",
                    offset_start=[offset_x, offset_y],
                    offset_end=[offset_x + 50, offset_y + 50]
                )
            ]
        )
        
        # Create CharacterPath and verify it uses the scene parameters
        path = CharacterPath(
            scene_config.segments[0].offset_start,
            scene_config.segments[0].offset_end,
            scene_config.segments[0].duration
        )
        
        # Test offset at start
        start_offset = path.get_offset(0.0)
        assert start_offset == (offset_x, offset_y), \
            f"Start offset should be ({offset_x}, {offset_y})"
        
        # Test offset at end
        end_offset = path.get_offset(duration)
        assert end_offset == (offset_x + 50, offset_y + 50), \
            f"End offset should be ({offset_x + 50}, {offset_y + 50})"
        
        # Test offset at middle (should be interpolated)
        mid_offset = path.get_offset(duration / 2)
        expected_mid_x = offset_x + 25
        expected_mid_y = offset_y + 25
        assert mid_offset == (expected_mid_x, expected_mid_y), \
            f"Mid offset should be ({expected_mid_x}, {expected_mid_y})"
        
        # Now test full rendering with these parameters
        from app.services import SessionManager, StorageManager
        storage_manager = StorageManager(base_path=temp_dir)
        session_manager = SessionManager(storage_manager)
        
        session = session_manager.create_session(scene_id)
        segment = Segment(
            index=0,
            duration=duration,
            frames=[
                PoseFrame(
                    timestamp=i * 1000,
                    landmarks=[[0.5, 0.5, 0.0, 0.9]] * 33
                )
                for i in range(3)
            ]
        )
        session_manager.update_segment(session.id, segment)
        session = session_manager.get_session(session.id)
        
        # Render video (should use scene parameters)
        renderer = VideoRenderer(scene_config, output_dir=temp_dir)
        output_path = renderer.render_video(session)
        
        # Verify video was created successfully
        assert Path(output_path).exists(), "Output video should exist"
        
        # Verify video is valid
        cap = cv2.VideoCapture(output_path)
        assert cap.isOpened(), "Output video should be readable"
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()
        
        assert frame_count > 0, "Output video should have frames"
    
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

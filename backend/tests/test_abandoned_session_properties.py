"""
Property-based tests for abandoned session status
Feature: shadow-puppet-interactive-system, Property 20: Abandoned sessions marked as cancelled
Validates: Requirements 17.5
"""
import pytest
from hypothesis import given, strategies as st, settings, HealthCheck
from app.models import Session, SessionStatus, Segment, PoseFrame
from app.services import SessionManager, StorageManager
import tempfile
import shutil
from pathlib import Path


# Strategies for generating test data
@st.composite
def pose_frame_strategy(draw):
    """Generate a valid PoseFrame"""
    return PoseFrame(
        timestamp=draw(st.floats(min_value=0, max_value=10000, allow_nan=False, allow_infinity=False)),
        landmarks=[[
            draw(st.floats(min_value=0, max_value=1, allow_nan=False, allow_infinity=False)),
            draw(st.floats(min_value=0, max_value=1, allow_nan=False, allow_infinity=False)),
            draw(st.floats(min_value=-1, max_value=1, allow_nan=False, allow_infinity=False)),
            draw(st.floats(min_value=0, max_value=1, allow_nan=False, allow_infinity=False))
        ] for _ in range(33)]
    )


@st.composite
def segment_strategy(draw):
    """Generate a valid Segment"""
    return Segment(
        index=draw(st.integers(min_value=0, max_value=3)),
        duration=draw(st.floats(min_value=6.0, max_value=10.0, allow_nan=False, allow_infinity=False)),
        frames=draw(st.lists(pose_frame_strategy(), min_size=1, max_size=50))
    )


@st.composite
def session_strategy(draw):
    """Generate a valid Session with random data"""
    scene_id = draw(st.sampled_from(['sceneA', 'sceneB', 'sceneC']))
    status = draw(st.sampled_from([
        SessionStatus.PENDING,
        SessionStatus.PROCESSING,
        SessionStatus.DONE,
        SessionStatus.FAILED
    ]))
    segments = draw(st.lists(segment_strategy(), min_size=0, max_size=4))
    
    return {
        'scene_id': scene_id,
        'status': status,
        'segments': segments
    }


class TestAbandonedSessionProperties:
    """Property-based tests for abandoned session handling"""
    
    @pytest.fixture(autouse=True)
    def setup_teardown(self):
        """Setup and teardown for each test"""
        # Create temporary directory for test storage
        self.temp_dir = tempfile.mkdtemp()
        self.storage_manager = StorageManager(base_path=self.temp_dir)
        self.session_manager = SessionManager(storage_manager=self.storage_manager)
        
        yield
        
        # Cleanup
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    @given(session_strategy())
    @settings(max_examples=100, deadline=None)
    def test_mark_cancelled_updates_status_to_cancelled(self, session_data):
        """
        Property: For any session, calling mark_cancelled should update status to CANCELLED
        """
        # Create session
        session = self.session_manager.create_session(session_data['scene_id'])
        
        # Update with test data
        for segment in session_data['segments']:
            self.session_manager.update_segment(session.id, segment)
        
        if session_data['status'] != SessionStatus.PENDING:
            self.session_manager.update_status(session.id, session_data['status'])
        
        # Action: Mark as cancelled
        self.session_manager.mark_cancelled(session.id)
        
        # Verify: Status is CANCELLED
        updated_session = self.session_manager.get_session(session.id)
        assert updated_session is not None
        assert updated_session.status == SessionStatus.CANCELLED
    
    @given(session_strategy())
    @settings(max_examples=100, deadline=None)
    def test_cancelled_session_persists_to_storage(self, session_data):
        """
        Property: For any session marked as cancelled, the status should persist to storage
        """
        # Create session
        session = self.session_manager.create_session(session_data['scene_id'])
        
        # Mark as cancelled
        self.session_manager.mark_cancelled(session.id)
        
        # Create new session manager to force reload from storage
        new_session_manager = SessionManager(storage_manager=self.storage_manager)
        
        # Verify: Status is still CANCELLED after reload
        reloaded_session = new_session_manager.get_session(session.id)
        assert reloaded_session is not None
        assert reloaded_session.status == SessionStatus.CANCELLED
    
    @given(session_strategy())
    @settings(max_examples=100, deadline=None)
    def test_mark_cancelled_preserves_session_data(self, session_data):
        """
        Property: For any session, marking as cancelled should preserve all other session data
        """
        # Create session
        session = self.session_manager.create_session(session_data['scene_id'])
        
        # Update with test data
        for segment in session_data['segments']:
            self.session_manager.update_segment(session.id, segment)
        
        # Store original data for comparison
        original_session = self.session_manager.get_session(session.id)
        original_scene_id = original_session.scene_id
        original_segment_count = len(original_session.segments)
        original_created_at = original_session.created_at
        
        # Action: Mark as cancelled
        self.session_manager.mark_cancelled(session.id)
        
        # Verify: All data except status is preserved
        updated_session = self.session_manager.get_session(session.id)
        assert updated_session is not None
        assert updated_session.scene_id == original_scene_id
        assert len(updated_session.segments) == original_segment_count
        assert updated_session.created_at == original_created_at
        assert updated_session.id == session.id
    
    @given(st.lists(session_strategy(), min_size=1, max_size=5))
    @settings(max_examples=50, deadline=None, suppress_health_check=[HealthCheck.data_too_large])
    def test_multiple_sessions_can_be_cancelled_independently(self, sessions_data):
        """
        Property: For any set of sessions, each can be cancelled independently
        """
        # Create multiple sessions
        session_ids = []
        for session_data in sessions_data:
            session = self.session_manager.create_session(session_data['scene_id'])
            session_ids.append(session.id)
        
        # Cancel a random subset of sessions
        import random
        sessions_to_cancel = random.sample(session_ids, k=max(1, len(session_ids) // 2))
        
        for session_id in sessions_to_cancel:
            self.session_manager.mark_cancelled(session_id)
        
        # Verify: Only cancelled sessions have CANCELLED status
        for session_id in session_ids:
            session = self.session_manager.get_session(session_id)
            assert session is not None
            if session_id in sessions_to_cancel:
                assert session.status == SessionStatus.CANCELLED
            else:
                assert session.status == SessionStatus.PENDING
    
    @given(session_strategy())
    @settings(max_examples=100, deadline=None)
    def test_mark_cancelled_is_idempotent(self, session_data):
        """
        Property: For any session, calling mark_cancelled multiple times has same effect as once
        """
        # Create session
        session = self.session_manager.create_session(session_data['scene_id'])
        
        # Mark as cancelled multiple times
        for _ in range(3):
            self.session_manager.mark_cancelled(session.id)
        
        # Verify: Status is CANCELLED (not corrupted by multiple calls)
        updated_session = self.session_manager.get_session(session.id)
        assert updated_session is not None
        assert updated_session.status == SessionStatus.CANCELLED
    
    @given(session_strategy())
    @settings(max_examples=100, deadline=None)
    def test_mark_cancelled_updates_timestamp(self, session_data):
        """
        Property: For any session, marking as cancelled should update the updated_at timestamp
        """
        # Create session
        session = self.session_manager.create_session(session_data['scene_id'])
        original_updated_at = session.updated_at
        
        # Small delay to ensure timestamp difference
        import time
        time.sleep(0.01)
        
        # Mark as cancelled
        self.session_manager.mark_cancelled(session.id)
        
        # Verify: updated_at timestamp has changed
        updated_session = self.session_manager.get_session(session.id)
        assert updated_session is not None
        assert updated_session.updated_at > original_updated_at
    
    @given(session_strategy())
    @settings(max_examples=100, deadline=None)
    def test_cancelled_sessions_can_be_listed(self, session_data):
        """
        Property: For any cancelled session, it should appear in list of cancelled sessions
        """
        # Create session
        session = self.session_manager.create_session(session_data['scene_id'])
        
        # Mark as cancelled
        self.session_manager.mark_cancelled(session.id)
        
        # Verify: Session appears in cancelled sessions list
        cancelled_sessions = self.session_manager.list_sessions(status=SessionStatus.CANCELLED)
        cancelled_ids = [s.id for s in cancelled_sessions]
        assert session.id in cancelled_ids
    
    @given(session_strategy())
    @settings(max_examples=100, deadline=None)
    def test_cancelled_sessions_not_in_other_status_lists(self, session_data):
        """
        Property: For any cancelled session, it should not appear in lists of other statuses
        """
        # Create session
        session = self.session_manager.create_session(session_data['scene_id'])
        
        # Mark as cancelled
        self.session_manager.mark_cancelled(session.id)
        
        # Verify: Session does not appear in other status lists
        pending_sessions = self.session_manager.list_sessions(status=SessionStatus.PENDING)
        processing_sessions = self.session_manager.list_sessions(status=SessionStatus.PROCESSING)
        done_sessions = self.session_manager.list_sessions(status=SessionStatus.DONE)
        failed_sessions = self.session_manager.list_sessions(status=SessionStatus.FAILED)
        
        pending_ids = [s.id for s in pending_sessions]
        processing_ids = [s.id for s in processing_sessions]
        done_ids = [s.id for s in done_sessions]
        failed_ids = [s.id for s in failed_sessions]
        
        assert session.id not in pending_ids
        assert session.id not in processing_ids
        assert session.id not in done_ids
        assert session.id not in failed_ids

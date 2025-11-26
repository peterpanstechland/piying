"""
Property-based tests for logging functionality
Feature: shadow-puppet-interactive-system
"""
import pytest
import logging
import json
import io
from hypothesis import given, strategies as st, settings
from app.utils.logger import (
    setup_logging,
    StructuredFormatter,
    log_session_event,
    log_render_performance,
    log_error_with_context
)


# Test strategies
session_id_strategy = st.uuids().map(str)
scene_id_strategy = st.sampled_from(["sceneA", "sceneB", "sceneC"])
event_type_strategy = st.sampled_from(["created", "completed", "cancelled", "failed"])
duration_strategy = st.floats(min_value=1.0, max_value=30.0)
file_size_strategy = st.floats(min_value=1.0, max_value=500.0)
frame_count_strategy = st.integers(min_value=30, max_value=1800)


@pytest.mark.property
@given(
    log_level=st.sampled_from(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]),
    message=st.text(min_size=1, max_size=200)
)
@settings(max_examples=100)
def test_property_42_log_entries_contain_required_fields(log_level, message):
    """
    Feature: shadow-puppet-interactive-system, Property 42: Log entries contain required fields
    **Validates: Requirements 22.1**
    
    For any key operation, the log entry should contain timestamp, log level, and context information.
    """
    # Set up a logger with structured formatter
    logger = logging.getLogger(f"test_logger_{log_level}")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    
    # Create a string stream to capture log output
    log_stream = io.StringIO()
    handler = logging.StreamHandler(log_stream)
    handler.setFormatter(StructuredFormatter())
    logger.addHandler(handler)
    
    # Log a message at the specified level
    log_method = getattr(logger, log_level.lower())
    log_method(message)
    
    # Get the logged output
    log_output = log_stream.getvalue().strip()
    
    # Parse the JSON log entry
    log_entry = json.loads(log_output)
    
    # Verify required fields are present
    assert "timestamp" in log_entry, "Log entry must contain timestamp"
    assert "level" in log_entry, "Log entry must contain level"
    assert "message" in log_entry, "Log entry must contain message"
    assert "logger" in log_entry, "Log entry must contain logger name"
    assert "module" in log_entry, "Log entry must contain module"
    assert "function" in log_entry, "Log entry must contain function"
    assert "line" in log_entry, "Log entry must contain line number"
    
    # Verify field values
    assert log_entry["level"] == log_level
    assert log_entry["message"] == message
    
    # Verify timestamp is in ISO format
    from datetime import datetime
    try:
        datetime.fromisoformat(log_entry["timestamp"])
    except ValueError:
        pytest.fail("Timestamp must be in ISO format")


@pytest.mark.property
@given(
    session_id=session_id_strategy,
    scene_id=scene_id_strategy,
    event_type=event_type_strategy
)
@settings(max_examples=100)
def test_property_44_session_lifecycle_events_are_logged(session_id, scene_id, event_type):
    """
    Feature: shadow-puppet-interactive-system, Property 44: Session lifecycle events are logged
    **Validates: Requirements 22.3**
    
    For any session creation, completion, or cancellation, the backend should create a log entry
    for that lifecycle event.
    """
    # Set up a logger with structured formatter
    logger = logging.getLogger(f"test_lifecycle_{session_id}")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    
    # Create a string stream to capture log output
    log_stream = io.StringIO()
    handler = logging.StreamHandler(log_stream)
    handler.setFormatter(StructuredFormatter())
    logger.addHandler(handler)
    
    # Log a session event
    log_session_event(
        logger,
        event_type,
        session_id,
        scene_id=scene_id
    )
    
    # Get the logged output
    log_output = log_stream.getvalue().strip()
    
    # Parse the JSON log entry
    log_entry = json.loads(log_output)
    
    # Verify the log entry contains session lifecycle information
    assert "context" in log_entry, "Log entry must contain context"
    context = log_entry["context"]
    
    assert "event_type" in context, "Context must contain event_type"
    assert "session_id" in context, "Context must contain session_id"
    assert context["event_type"] == event_type
    assert context["session_id"] == session_id
    assert context["scene_id"] == scene_id
    
    # Verify the message mentions the session
    assert session_id in log_entry["message"]


@pytest.mark.property
@given(
    session_id=session_id_strategy,
    duration=duration_strategy,
    file_size=file_size_strategy,
    frame_count=frame_count_strategy
)
@settings(max_examples=100)
def test_property_45_render_completion_logs_performance_metrics(
    session_id, duration, file_size, frame_count
):
    """
    Feature: shadow-puppet-interactive-system, Property 45: Render completion logs performance metrics
    **Validates: Requirements 22.4**
    
    For any completed video rendering, the log should include rendering duration and output file size.
    """
    # Set up a logger with structured formatter
    logger = logging.getLogger(f"test_render_{session_id}")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    
    # Create a string stream to capture log output
    log_stream = io.StringIO()
    handler = logging.StreamHandler(log_stream)
    handler.setFormatter(StructuredFormatter())
    logger.addHandler(handler)
    
    # Log render performance
    log_render_performance(
        logger,
        session_id,
        duration,
        file_size,
        frame_count
    )
    
    # Get the logged output
    log_output = log_stream.getvalue().strip()
    
    # Parse the JSON log entry
    log_entry = json.loads(log_output)
    
    # Verify the log entry contains performance metrics
    assert "context" in log_entry, "Log entry must contain context"
    context = log_entry["context"]
    
    assert "event_type" in context, "Context must contain event_type"
    assert context["event_type"] == "render_completed"
    
    assert "session_id" in context, "Context must contain session_id"
    assert context["session_id"] == session_id
    
    assert "duration_seconds" in context, "Context must contain duration_seconds"
    assert context["duration_seconds"] == duration
    
    assert "output_file_size_mb" in context, "Context must contain output_file_size_mb"
    assert context["output_file_size_mb"] == file_size
    
    assert "frame_count" in context, "Context must contain frame_count"
    assert context["frame_count"] == frame_count
    
    # Verify frames_per_second is calculated
    assert "frames_per_second" in context, "Context must contain frames_per_second"
    expected_fps = frame_count / duration if duration > 0 else 0
    assert abs(context["frames_per_second"] - expected_fps) < 0.01



@pytest.mark.property
@given(
    error_message=st.text(min_size=1, max_size=200),
    context_key=st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'), min_codepoint=97, max_codepoint=122)),
    context_value=st.text(min_size=1, max_size=100)
)
@settings(max_examples=100)
def test_property_43_error_logs_include_stack_traces(error_message, context_key, context_value):
    """
    Feature: shadow-puppet-interactive-system, Property 43: Error logs include stack traces
    **Validates: Requirements 22.2**
    
    For any error that occurs, the log entry should include error details, stack trace,
    and relevant state information.
    """
    # Set up a logger with structured formatter
    logger = logging.getLogger(f"test_error_{context_key}")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    
    # Create a string stream to capture log output
    log_stream = io.StringIO()
    handler = logging.StreamHandler(log_stream)
    handler.setFormatter(StructuredFormatter())
    logger.addHandler(handler)
    
    # Create an exception
    try:
        raise ValueError(error_message)
    except ValueError as e:
        # Log the error with context
        log_error_with_context(
            logger,
            f"Test error: {error_message}",
            e,
            **{context_key: context_value}
        )
    
    # Get the logged output
    log_output = log_stream.getvalue().strip()
    
    # Parse the JSON log entry
    log_entry = json.loads(log_output)
    
    # Verify the log entry contains error information
    assert "level" in log_entry, "Log entry must contain level"
    assert log_entry["level"] == "ERROR", "Error logs must have ERROR level"
    
    # Verify exception information is present
    assert "exception" in log_entry, "Error log must contain exception information"
    exception_info = log_entry["exception"]
    
    assert "type" in exception_info, "Exception info must contain type"
    assert exception_info["type"] == "ValueError"
    
    assert "message" in exception_info, "Exception info must contain message"
    assert error_message in exception_info["message"]
    
    assert "traceback" in exception_info, "Exception info must contain traceback"
    assert exception_info["traceback"] is not None, "Traceback must not be None"
    assert len(exception_info["traceback"]) > 0, "Traceback must not be empty"
    
    # Verify traceback contains stack trace information
    traceback = exception_info["traceback"]
    assert "Traceback" in traceback, "Traceback must contain 'Traceback' header"
    assert "ValueError" in traceback, "Traceback must contain exception type"
    
    # Verify context is present
    assert "context" in log_entry, "Log entry must contain context"
    context = log_entry["context"]
    assert context_key in context, f"Context must contain {context_key}"
    assert context[context_key] == context_value

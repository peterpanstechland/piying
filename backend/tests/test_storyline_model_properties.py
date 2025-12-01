"""
Property-based tests for storyline data model validation.

These tests use Hypothesis to verify universal properties across all inputs.

**Feature: storyline-timeline-editor**
**Validates: Requirements 1.1, 5.1, 5.3, 6.2, 8.2**
"""
import pytest
from hypothesis import given, strategies as st, settings, assume
from pydantic import ValidationError

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.models.admin.storyline import (
    StorylineStatus,
    AnimationType,
    TransitionType,
    AnimationConfig,
    Transition,
    StorylineCharacterConfig,
    StorylineExtended,
    StorylineExtendedCreate,
    TimelineSegment,
)


# Custom strategies for generating test data

@st.composite
def chinese_text_strategy(draw, min_size=1, max_size=100):
    """Generate text that could be Chinese or ASCII (for name/synopsis)."""
    text = draw(st.text(
        alphabet=st.characters(
            whitelist_categories=('L', 'N', 'P', 'S', 'Z'),
            blacklist_characters='\x00\n\r',
            max_codepoint=0xFFFF
        ),
        min_size=min_size,
        max_size=max_size
    ))
    assume(len(text.strip()) > 0)
    return text.strip()


@st.composite
def uuid_strategy(draw):
    """Generate valid UUID-like strings."""
    import uuid
    return str(uuid.uuid4())


@st.composite
def animation_type_strategy(draw):
    """Generate valid animation types."""
    return draw(st.sampled_from(list(AnimationType)))


@st.composite
def transition_type_strategy(draw):
    """Generate valid transition types."""
    return draw(st.sampled_from(list(TransitionType)))


@st.composite
def animation_config_strategy(draw):
    """Generate valid animation configurations."""
    return AnimationConfig(
        type=draw(animation_type_strategy()),
        duration=draw(st.floats(min_value=0.5, max_value=5.0, allow_nan=False, allow_infinity=False)),
        delay=draw(st.floats(min_value=0.0, max_value=10.0, allow_nan=False, allow_infinity=False))
    )


# Property 1: Storyline Required Fields Validation
# **Feature: storyline-timeline-editor, Property 1: Storyline Required Fields Validation**
# **Validates: Requirements 1.1, 8.2**
@settings(max_examples=100)
@given(
    name=st.text(min_size=0, max_size=5),
    synopsis=st.text(min_size=0, max_size=10)
)
def test_property_1_storyline_required_fields_validation(name, synopsis):
    """
    Property 1: Storyline Required Fields Validation
    
    *For any* storyline creation or update request, if the Chinese name is empty
    or missing, the system SHALL reject the request with a validation error.
    
    **Feature: storyline-timeline-editor, Property 1: Storyline Required Fields Validation**
    **Validates: Requirements 1.1, 8.2**
    """
    # Test with empty or whitespace-only name
    stripped_name = name.strip()
    
    if len(stripped_name) == 0:
        # Empty name should be rejected
        with pytest.raises(ValidationError) as exc_info:
            StorylineExtendedCreate(name=name)
        # Verify the error is about the name field
        errors = exc_info.value.errors()
        assert any(
            'name' in str(e.get('loc', '')) or 'min_length' in str(e.get('type', ''))
            for e in errors
        ), f"Expected validation error for empty name, got: {errors}"
    else:
        # Non-empty name should be accepted
        storyline = StorylineExtendedCreate(name=name, synopsis=synopsis)
        assert storyline.name == name


# Property 12: Animation Type Validation
# **Feature: storyline-timeline-editor, Property 12: Animation Type Validation**
# **Validates: Requirements 5.1, 5.3**
@settings(max_examples=100)
@given(animation_type=st.text(min_size=1, max_size=30))
def test_property_12_animation_type_validation(animation_type):
    """
    Property 12: Animation Type Validation
    
    *For any* animation configuration, the type SHALL be one of:
    fade_in, fade_out, slide_left, slide_right, slide_up, slide_down, instant.
    
    **Feature: storyline-timeline-editor, Property 12: Animation Type Validation**
    **Validates: Requirements 5.1, 5.3**
    """
    valid_types = {t.value for t in AnimationType}
    
    if animation_type in valid_types:
        # Valid type should be accepted
        config = AnimationConfig(type=animation_type)
        assert config.type.value == animation_type or config.type == animation_type
    else:
        # Invalid type should be rejected
        with pytest.raises(ValidationError) as exc_info:
            AnimationConfig(type=animation_type)
        errors = exc_info.value.errors()
        assert len(errors) > 0, f"Expected validation error for invalid animation type '{animation_type}'"


# Test that all valid animation types are accepted
@settings(max_examples=50)
@given(animation_type=animation_type_strategy())
def test_property_12_valid_animation_types_accepted(animation_type):
    """
    Verify all valid animation types from the enum are accepted.
    
    **Feature: storyline-timeline-editor, Property 12: Animation Type Validation**
    **Validates: Requirements 5.1, 5.3**
    """
    config = AnimationConfig(type=animation_type)
    assert config.type == animation_type
    assert config.duration >= 0.5
    assert config.duration <= 5.0
    assert config.delay >= 0.0


# Property 14: Transition Type Validation
# **Feature: storyline-timeline-editor, Property 14: Transition Type Validation**
# **Validates: Requirements 6.2**
@settings(max_examples=100)
@given(transition_type=st.text(min_size=1, max_size=30))
def test_property_14_transition_type_validation(transition_type):
    """
    Property 14: Transition Type Validation
    
    *For any* transition configuration, the type SHALL be one of:
    cut, crossfade, fade_to_black, wipe_left, wipe_right.
    
    **Feature: storyline-timeline-editor, Property 14: Transition Type Validation**
    **Validates: Requirements 6.2**
    """
    valid_types = {t.value for t in TransitionType}
    
    if transition_type in valid_types:
        # Valid type should be accepted
        transition = Transition(
            id="test-id",
            from_segment_index=0,
            to_segment_index=1,
            type=transition_type
        )
        assert transition.type.value == transition_type or transition.type == transition_type
    else:
        # Invalid type should be rejected
        with pytest.raises(ValidationError) as exc_info:
            Transition(
                id="test-id",
                from_segment_index=0,
                to_segment_index=1,
                type=transition_type
            )
        errors = exc_info.value.errors()
        assert len(errors) > 0, f"Expected validation error for invalid transition type '{transition_type}'"


# Test that all valid transition types are accepted
@settings(max_examples=50)
@given(transition_type=transition_type_strategy())
def test_property_14_valid_transition_types_accepted(transition_type):
    """
    Verify all valid transition types from the enum are accepted.
    
    **Feature: storyline-timeline-editor, Property 14: Transition Type Validation**
    **Validates: Requirements 6.2**
    """
    transition = Transition(
        id="test-id",
        from_segment_index=0,
        to_segment_index=1,
        type=transition_type,
        duration=0.5
    )
    assert transition.type == transition_type
    assert transition.duration >= 0.1
    assert transition.duration <= 3.0


# Additional property tests for animation duration bounds
@settings(max_examples=100)
@given(
    duration=st.floats(min_value=-100, max_value=100, allow_nan=False, allow_infinity=False)
)
def test_animation_duration_bounds(duration):
    """
    Animation duration must be between 0.5 and 5.0 seconds.
    
    **Feature: storyline-timeline-editor, Property 12: Animation Type Validation**
    **Validates: Requirements 5.2, 5.4**
    """
    if 0.5 <= duration <= 5.0:
        # Valid duration should be accepted
        config = AnimationConfig(type=AnimationType.FADE_IN, duration=duration)
        assert config.duration == duration
    else:
        # Invalid duration should be rejected
        with pytest.raises(ValidationError):
            AnimationConfig(type=AnimationType.FADE_IN, duration=duration)


# Test transition duration bounds
@settings(max_examples=100)
@given(
    duration=st.floats(min_value=-100, max_value=100, allow_nan=False, allow_infinity=False)
)
def test_transition_duration_bounds(duration):
    """
    Transition duration must be between 0.1 and 3.0 seconds.
    
    **Feature: storyline-timeline-editor, Property 14: Transition Type Validation**
    **Validates: Requirements 6.3**
    """
    if 0.1 <= duration <= 3.0:
        # Valid duration should be accepted
        transition = Transition(
            id="test-id",
            from_segment_index=0,
            to_segment_index=1,
            type=TransitionType.CUT,
            duration=duration
        )
        assert transition.duration == duration
    else:
        # Invalid duration should be rejected
        with pytest.raises(ValidationError):
            Transition(
                id="test-id",
                from_segment_index=0,
                to_segment_index=1,
                type=TransitionType.CUT,
                duration=duration
            )


# Test character configuration validation
@settings(max_examples=50)
@given(
    character_ids=st.lists(uuid_strategy(), min_size=0, max_size=15, unique=True)
)
def test_character_count_validation(character_ids):
    """
    Character count must be between 1 and 10 inclusive.
    
    **Feature: storyline-timeline-editor, Property 16: Character Count Validation**
    **Validates: Requirements 7.2**
    """
    if 1 <= len(character_ids) <= 10:
        # Valid count should be accepted
        config = StorylineCharacterConfig(
            character_ids=character_ids,
            default_character_id=character_ids[0],
            display_order=character_ids
        )
        assert len(config.character_ids) == len(character_ids)
    else:
        # Invalid count should be rejected
        with pytest.raises(ValidationError):
            StorylineCharacterConfig(
                character_ids=character_ids,
                default_character_id=character_ids[0] if character_ids else "dummy",
                display_order=character_ids
            )


# Test default character must be in character list
@settings(max_examples=50)
@given(
    character_ids=st.lists(uuid_strategy(), min_size=1, max_size=5, unique=True),
    default_id=uuid_strategy()
)
def test_default_character_in_list(character_ids, default_id):
    """
    Default character must be in the character_ids list.
    
    **Feature: storyline-timeline-editor, Property 17: Default Character Uniqueness**
    **Validates: Requirements 7.3**
    """
    if default_id in character_ids:
        # Default in list should be accepted
        config = StorylineCharacterConfig(
            character_ids=character_ids,
            default_character_id=default_id,
            display_order=character_ids
        )
        assert config.default_character_id == default_id
    else:
        # Default not in list should be rejected
        with pytest.raises(ValidationError) as exc_info:
            StorylineCharacterConfig(
                character_ids=character_ids,
                default_character_id=default_id,
                display_order=character_ids
            )
        errors = exc_info.value.errors()
        assert len(errors) > 0, "Expected validation error for default not in list"

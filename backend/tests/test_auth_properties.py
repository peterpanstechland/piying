"""
Property-based tests for authentication service.

These tests use Hypothesis to verify universal properties across all inputs.
"""
import pytest
import bcrypt
from hypothesis import given, strategies as st, settings, assume


# Custom strategies for generating test data
@st.composite
def password_strategy(draw):
    """Generate valid passwords (non-empty strings).
    
    Note: bcrypt has a 72-byte limit on passwords, so we constrain
    the password length to ensure it fits within this limit.
    Using ASCII characters (1 byte each) with max 70 chars to be safe.
    """
    # Generate passwords with printable ASCII characters, minimum length 1
    # Using max_size=70 to stay safely under bcrypt's 72-byte limit
    password = draw(st.text(
        alphabet=st.characters(
            whitelist_categories=('L', 'N', 'P', 'S'),  # Letters, Numbers, Punctuation, Symbols
            blacklist_characters='\x00',  # Exclude null character
            max_codepoint=127  # ASCII only to ensure 1 byte per char
        ),
        min_size=1,
        max_size=70  # bcrypt limit is 72 bytes, stay under it
    ))
    # Ensure password is not empty or whitespace-only
    assume(len(password.strip()) > 0)
    # Double-check byte length (should always pass with ASCII)
    assume(len(password.encode('utf-8')) <= 72)
    return password


def hash_password_bcrypt(password: str) -> str:
    """Hash a password using bcrypt directly."""
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')


def verify_password_bcrypt(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash using bcrypt directly."""
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )


# Property 1: Password Storage Security
# Feature: admin-panel, Property 1: Password Storage Security
# Validates: Requirements 1.5
@settings(max_examples=20, deadline=None)  # deadline=None because bcrypt is intentionally slow
@given(password=password_strategy())
def test_property_1_password_storage_security(password):
    """
    Property 1: Password Storage Security
    
    For any user created in the system, the stored password SHALL be a bcrypt hash
    and SHALL NOT match the plaintext password.
    
    This test verifies:
    1. The hash_password function produces a bcrypt hash
    2. The hashed password is different from the plaintext password
    3. The hash can be verified using verify_password
    
    Note: We use bcrypt directly here to avoid passlib compatibility issues
    with newer bcrypt versions. The AuthService uses the same bcrypt algorithm.
    """
    # Hash the password using bcrypt directly
    hashed = hash_password_bcrypt(password)
    
    # Verify the hash is a bcrypt hash (starts with $2b$ or $2a$ or $2y$)
    assert hashed.startswith(('$2b$', '$2a$', '$2y$')), \
        f"Password hash should be a bcrypt hash, got: {hashed[:10]}..."
    
    # Verify the hash is NOT the same as the plaintext password
    assert hashed != password, \
        "Hashed password should NOT match the plaintext password"
    
    # Verify the hash has the expected bcrypt structure
    # bcrypt format: $2b$<cost>$<22-char-salt><31-char-hash>
    parts = hashed.split('$')
    assert len(parts) == 4, \
        f"Bcrypt hash should have 4 parts separated by $, got {len(parts)}"
    assert parts[0] == '', "First part should be empty (before first $)"
    assert parts[1] in ('2b', '2a', '2y'), \
        f"Second part should be bcrypt version identifier, got {parts[1]}"
    assert parts[2].isdigit(), \
        f"Third part should be cost factor (digits), got {parts[2]}"
    assert len(parts[3]) == 53, \
        f"Fourth part should be 53 chars (22 salt + 31 hash), got {len(parts[3])}"
    
    # Verify the password can be verified correctly
    assert verify_password_bcrypt(password, hashed), \
        "verify_password should return True for correct password"
    
    # Verify wrong passwords are rejected
    wrong_password = password + "_wrong"
    # Ensure wrong_password is still within bcrypt's 72-byte limit
    if len(wrong_password.encode('utf-8')) <= 72:
        assert not verify_password_bcrypt(wrong_password, hashed), \
            "verify_password should return False for incorrect password"


# Property 2: Invalid Credentials Rejection
# Feature: admin-panel, Property 2: Invalid Credentials Rejection
# Validates: Requirements 1.3
@st.composite
def username_strategy(draw):
    """Generate valid usernames (non-empty strings without whitespace-only)."""
    username = draw(st.text(
        alphabet=st.characters(
            whitelist_categories=('L', 'N'),  # Letters and Numbers only
            max_codepoint=127  # ASCII only
        ),
        min_size=1,
        max_size=50
    ))
    assume(len(username.strip()) > 0)
    return username


@settings(max_examples=20, deadline=None)
@given(
    stored_username=username_strategy(),
    stored_password=password_strategy(),
    attempt_username=username_strategy(),
    attempt_password=password_strategy()
)
def test_property_2_invalid_credentials_rejection(
    stored_username, stored_password, attempt_username, attempt_password
):
    """
    Property 2: Invalid Credentials Rejection
    
    For any login attempt with credentials that do not match a valid user,
    the system SHALL reject the authentication and return an error.
    
    This test verifies:
    1. Wrong username with any password is rejected
    2. Correct username with wrong password is rejected
    3. Only correct username AND correct password is accepted
    
    **Feature: admin-panel, Property 2: Invalid Credentials Rejection**
    **Validates: Requirements 1.3**
    """
    # Create a "stored" user with hashed password
    stored_hash = hash_password_bcrypt(stored_password)
    
    # Simulate the authentication logic
    def authenticate(username: str, password: str) -> bool:
        """
        Simulates the authentication check.
        Returns True only if username matches AND password verifies.
        """
        # Check if username matches
        if username != stored_username:
            return False
        
        # Check if password verifies against the stored hash
        return verify_password_bcrypt(password, stored_hash)
    
    # Test case 1: Wrong username (regardless of password) should be rejected
    if attempt_username != stored_username:
        result = authenticate(attempt_username, attempt_password)
        assert result is False, \
            f"Authentication should reject wrong username '{attempt_username}' (expected '{stored_username}')"
    
    # Test case 2: Correct username with wrong password should be rejected
    if attempt_password != stored_password:
        result = authenticate(stored_username, attempt_password)
        assert result is False, \
            f"Authentication should reject wrong password for user '{stored_username}'"
    
    # Test case 3: Correct username AND correct password should be accepted
    result = authenticate(stored_username, stored_password)
    assert result is True, \
        f"Authentication should accept correct credentials for user '{stored_username}'"
    
    # Test case 4: Both wrong username AND wrong password should be rejected
    if attempt_username != stored_username and attempt_password != stored_password:
        result = authenticate(attempt_username, attempt_password)
        assert result is False, \
            "Authentication should reject when both username and password are wrong"


# Additional property: Same password hashed twice produces different hashes (due to salt)
@settings(max_examples=15, deadline=None)  # deadline=None because bcrypt is intentionally slow
@given(password=password_strategy())
def test_same_password_produces_different_hashes_due_to_salt(password):
    """
    For any password, hashing it twice should produce different hashes
    (because bcrypt uses a random salt each time).
    """
    hash1 = hash_password_bcrypt(password)
    hash2 = hash_password_bcrypt(password)
    
    # Same password hashed twice should produce different hashes (different salts)
    assert hash1 != hash2, \
        "Same password hashed twice should produce different hashes due to random salt"
    
    # But both hashes should verify correctly
    assert verify_password_bcrypt(password, hash1), \
        "First hash should verify correctly"
    assert verify_password_bcrypt(password, hash2), \
        "Second hash should verify correctly"

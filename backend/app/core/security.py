import secrets
import string
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError

ALPHANUMERIC_CHARS = string.ascii_letters + string.digits
password_hasher = PasswordHasher()

def generate_room_id(length: int = 12) -> str:
    """Generate a cryptographically secure 12-character base62 room ID."""
    return "".join(secrets.choice(ALPHANUMERIC_CHARS) for _ in range(length))

def generate_token(prefix: str = "ses") -> str:
    """Generate a random hex security token."""
    return f"{prefix}_{secrets.token_hex(16)}"

def hash_pin(pin: str) -> str:
    """Hash room access PIN using Argon2id."""
    return password_hasher.hash(pin)

def verify_pin(pin: str, hashed_pin: str) -> bool:
    """Verify raw PIN against Argon2id hash."""
    try:
        return password_hasher.verify(hashed_pin, pin)
    except (VerifyMismatchError, VerificationError, Exception):
        return False

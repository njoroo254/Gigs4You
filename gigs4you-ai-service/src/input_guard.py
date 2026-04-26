"""
Input guard for Cathy AI — prompt injection detection and sanitization.

Defence-in-depth strategy:
1. Length cap  — reject absurdly long messages before they hit Claude.
2. Pattern block — reject inputs that contain known injection trigger phrases
   (e.g. "ignore previous instructions", "you are now DAN").
3. Structural sanitization — strip null bytes, control characters, and
   Unicode bidirectional override characters used to hide injections.
4. System-prompt boundary — the system prompt is assembled server-side only;
   user input is always placed in the `messages` array, never the `system` field.

This module does NOT need to be 100% accurate — it is one layer of several.
Claude itself is inherently resistant to many injection attempts.
"""

import logging
import re
import unicodedata
from typing import Optional

logger = logging.getLogger("gigs4you.input_guard")

# ── Config ─────────────────────────────────────────────────────────────────────
MAX_MESSAGE_LENGTH = 4_000   # chars — enforced by Pydantic too, double-checked here
MAX_WORD_COUNT     = 800     # rough secondary check

# ── Injection trigger patterns (case-insensitive, direct user input) ───────────
# Hallmarks of prompt injection — a legitimate Gigs4You user would never type these.
_INJECTION_PATTERNS: list[re.Pattern] = [re.compile(p, re.IGNORECASE) for p in [
    # Classic override phrases
    r"ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|rules?|prompts?|constraints?)",
    r"disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)",
    r"forget\s+(everything|all|your\s+instructions|your\s+training)",
    # Identity hijacking
    r"you\s+are\s+now\s+(a\s+)?(?:DAN|GPT|an?\s+unrestricted|an?\s+uncensored|evil|jailbroken)",
    r"act\s+as\s+(an?\s+)?(?:AI\s+without\s+restrictions?|uncensored|jailbroken|DAN)",
    r"pretend\s+(you\s+are|to\s+be)\s+(an?\s+)?(?:AI\s+without|uncensored|unrestricted)",
    r"jailbreak\s+(mode|activated|enabled)",
    r"developer\s+(mode|override)\s+(enabled|on|activated)",
    # Safety override phrases
    r"override\s+(your\s+)?(safety|security|guardrails?|rules?|instructions?)",
    r"bypass\s+(your\s+)?(filter|safety|guardrail|restriction|policy)",
    r"disable\s+(your\s+)?(safety|filter|guardrail|restriction)",
    # System prompt extraction
    r"reveal\s+(your\s+)?(system\s+prompt|instructions?|training\s+data|hidden\s+prompt)",
    r"print\s+(your\s+)?(system\s+prompt|full\s+prompt|initial\s+prompt)",
    r"show\s+me\s+(your\s+)?(system\s+prompt|instructions?|hidden)",
    r"repeat\s+(your\s+)?(system\s+prompt|initial\s+instructions?)",
    r"output\s+(your\s+)?(system\s+prompt|instructions?|configuration)",
    # Role-play jailbreaks
    r"in\s+this\s+(hypothetical|fictional|roleplay)\s+scenario.{0,30}(no\s+restrictions?|no\s+rules?|ignore)",
    r"for\s+(educational|research|fictional)\s+purposes.{0,40}(how\s+to|steps?\s+to)",
    # Structural injection (template / token attacks)
    r"new\s+instructions?:\s*\n",
    r"\[\[.*?(system|assistant|instructions?).*?\]\]",
    r"<\|.*?system.*?\|>",
    r"</?system>",
    r"</?INST>",
    r"\[SYSTEM\]",
    r"human:\s*\n",
    r"assistant:\s*\n",
    r"\{system\}",
    # Continuation attacks
    r"continue\s+from\s+where\s+you\s+left\s+off\s+without\s+(any\s+)?(restrictions?|filter|safety)",
    r"respond\s+only\s+in\s+(base64|hex|rot13|reverse)",
]]

# ── Indirect injection patterns (for content fetched from DB / tool results) ────
# These are softer — we log and strip rather than block, since DB content can
# legitimately contain some of these phrases in a different context.
_INDIRECT_INJECTION_PATTERNS: list[re.Pattern] = [re.compile(p, re.IGNORECASE) for p in [
    r"ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|prompts?)",
    r"you\s+are\s+now\s+(a\s+)?(?:DAN|unrestricted|jailbroken)",
    r"<\|.*?system.*?\|>",
    r"</?system>",
    r"\[\[.*?system.*?\]\]",
    r"override\s+(your\s+)?(safety|guardrails?|instructions?)",
]]

# ── Bidirectional override codepoints (used to visually hide injection text) ──
_BIDI_OVERRIDES = frozenset([
    "\u200b",  # zero-width space
    "\u200c",  # zero-width non-joiner
    "\u200d",  # zero-width joiner
    "\u200e",  # left-to-right mark
    "\u200f",  # right-to-left mark
    "\u202a",  # left-to-right embedding
    "\u202b",  # right-to-left embedding
    "\u202c",  # pop directional formatting
    "\u202d",  # left-to-right override
    "\u202e",  # right-to-left override  ← primary injection vector
    "\u2066",  # left-to-right isolate
    "\u2067",  # right-to-left isolate
    "\u2068",  # first strong isolate
    "\u2069",  # pop directional isolate
    "\ufeff",  # byte order mark / zero-width no-break space
])


class InjectionAttemptError(ValueError):
    """Raised when a message contains a suspected prompt injection attempt."""


def sanitize(message: str, source: str = "user") -> str:
    """
    Clean and validate a user message before it is sent to Claude.

    Parameters
    ----------
    message : The raw user-supplied string.
    source  : Label for log messages (default "user").

    Returns
    -------
    The sanitized string, safe to include in a Claude `messages` array.

    Raises
    ------
    InjectionAttemptError — if the message contains a known injection pattern.
    ValueError            — if the message is empty or exceeds length limits.
    """
    if not message or not message.strip():
        raise ValueError("Message must not be empty.")

    # 1. Strip null bytes and ASCII control characters (except tab/newline/CR)
    message = "".join(
        ch for ch in message
        if ch in ("\t", "\n", "\r") or (ord(ch) >= 0x20 and ch not in _BIDI_OVERRIDES)
    )

    # 2. Remove Unicode bidirectional override characters
    #    (these can hide injected text from human reviewers)
    message = "".join(ch for ch in message if ch not in _BIDI_OVERRIDES)

    # 3. Normalize Unicode (NFC) — prevents lookalike character attacks
    message = unicodedata.normalize("NFC", message)

    # 4. Length check
    if len(message) > MAX_MESSAGE_LENGTH:
        raise ValueError(
            f"Message too long ({len(message)} chars). Maximum is {MAX_MESSAGE_LENGTH} characters."
        )

    # 5. Injection pattern detection
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(message):
            logger.warning(
                "Prompt injection attempt detected from %s — pattern: %s | message[:120]: %s",
                source, pattern.pattern[:60], message[:120],
            )
            raise InjectionAttemptError(
                "Your message contains content that cannot be processed. "
                "Please rephrase and try again."
            )

    return message


def sanitize_tool_result(content: str, tool_name: str = "unknown") -> str:
    """
    Soft sanitization for content returned by tools (DB rows, external API calls).

    Does NOT raise — returns the cleaned string with any indirect injection attempts
    stripped to a safe placeholder. This protects against stored-prompt injection
    where an attacker places injection text inside a DB record (e.g. a job title).
    """
    if not content:
        return content

    # Strip BIDI overrides (same as direct sanitization)
    content = "".join(ch for ch in content if ch not in _BIDI_OVERRIDES)

    # Normalise unicode
    content = unicodedata.normalize("NFC", content)

    # Truncate absurdly long tool results (shouldn't happen, but prevents context flooding)
    if len(content) > 20_000:
        content = content[:20_000] + "\n[... content truncated ...]"

    # Detect and redact indirect injection attempts
    for pattern in _INDIRECT_INJECTION_PATTERNS:
        if pattern.search(content):
            logger.warning(
                "Indirect prompt injection detected in tool result '%s' — pattern: %s",
                tool_name, pattern.pattern[:60],
            )
            content = pattern.sub("[REDACTED]", content)

    return content


def is_safe(message: str, source: str = "user") -> tuple[bool, Optional[str]]:
    """
    Non-raising variant of sanitize().

    Returns (True, sanitized_message) or (False, error_reason).
    """
    try:
        return True, sanitize(message, source)
    except (InjectionAttemptError, ValueError) as exc:
        return False, str(exc)

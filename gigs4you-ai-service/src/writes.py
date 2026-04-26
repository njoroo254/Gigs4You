"""
Write and proxy helpers for the Gigs4You AI service.
These functions forward write operations to the existing NestJS API.

Route reference (all under /api/v1):
  POST   jobs                               create_job
  PATCH  jobs/:id                           update_job
  PATCH  jobs/:id/cancel                    close_job
  PATCH  jobs/:id/assign/:agent_id          assign_agent_to_job
  POST   jobs/:id/apply                     apply_to_job
  PATCH  jobs/applications/:id/accept       accept_application
  PATCH  jobs/applications/:id/reject       reject_application
  POST   tasks                              create_task
  PATCH  tasks/:id                          reassign_agent / update_task_status (generic)
  PATCH  tasks/:id/start|complete|fail|...  update_task_status (status-specific)
  POST   wallet/withdraw                    initiate_withdrawal
"""

import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    logger.warning("httpx not installed — write proxies disabled")
    HTTPX_AVAILABLE = False


def _resolve_nest_url(url: str) -> str:
    """
    When the AI service runs inside WSL2, 'localhost' resolves to WSL's own
    loopback, not the Windows host where NestJS runs.  Read the Windows host
    IP from the default route in /proc/net/route and substitute it so writes
    reach NestJS.  Falls back to the /etc/resolv.conf nameserver if the route
    table is unavailable.
    Requires an inbound Windows Firewall rule for port 3000 from WSL.
    """
    if "localhost" not in url and "127.0.0.1" not in url:
        return url

    try:
        with open("/proc/version") as f:
            if "microsoft" not in f.read().lower():
                return url  # not WSL — leave as-is
    except OSError:
        return url

    # Primary: read default gateway from /proc/net/route (the real Windows host IP).
    # The nameserver in /etc/resolv.conf is a WSL DNS proxy, not the host TCP address.
    try:
        import socket, struct
        with open("/proc/net/route") as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) >= 3 and parts[1] == "00000000" and parts[2] != "00000000":
                    windows_ip = socket.inet_ntoa(struct.pack("<I", int(parts[2], 16)))
                    resolved = url.replace("localhost", windows_ip).replace("127.0.0.1", windows_ip)
                    logger.info(f"WSL: NestJS URL → {resolved}")
                    return resolved
    except Exception:
        pass

    # Fallback: nameserver from /etc/resolv.conf
    try:
        with open("/etc/resolv.conf") as f:
            for line in f:
                if line.startswith("nameserver"):
                    windows_ip = line.split()[1].strip()
                    resolved = url.replace("localhost", windows_ip).replace("127.0.0.1", windows_ip)
                    logger.info(f"WSL: NestJS URL (nameserver fallback) → {resolved}")
                    return resolved
    except OSError:
        pass

    return url


NEST_API_URL = _resolve_nest_url(os.getenv("NEST_API_URL", "http://localhost:3000/api/v1"))
NEST_API_TIMEOUT = int(os.getenv("NEST_API_TIMEOUT", "30"))


async def _dispatch(
    method: str,
    path: str,
    payload: Dict[str, Any],
    user_jwt: Optional[str] = None,
) -> Dict[str, Any]:
    if not HTTPX_AVAILABLE:
        return {"success": False, "error": "httpx not installed"}

    url = f"{NEST_API_URL.rstrip('/')}/{path.lstrip('/')}"
    headers = {"Content-Type": "application/json"}
    if user_jwt:
        headers["Authorization"] = f"Bearer {user_jwt}"

    logger.info(f"DISPATCH {method} {url} payload={list(payload.keys())} jwt={'yes' if user_jwt else 'no'}")
    try:
        async with httpx.AsyncClient(timeout=NEST_API_TIMEOUT) as client:
            response = await client.request(method, url, json=payload, headers=headers)
            logger.info(f"DISPATCH response {response.status_code}")
            response.raise_for_status()
            try:
                return {"success": True, **response.json()}
            except ValueError:
                return {"success": True, "result": response.text}
    except httpx.HTTPStatusError as exc:
        body = exc.response.text
        logger.warning(f"DISPATCH FAILED {exc.response.status_code}: {body}")
        try:
            detail = exc.response.json()
        except Exception:
            detail = body
        return {"success": False, "status_code": exc.response.status_code, "error": detail}
    except Exception as exc:
        logger.error(f"DISPATCH ERROR {exc}")
        msg = str(exc)
        if "connect" in msg.lower():
            msg = (
                "Unable to reach the Gigs4You API server. "
                "Please ensure the backend service is running and try again."
            )
        return {"success": False, "error": msg}


def _strip_none(d: Dict[str, Any]) -> Dict[str, Any]:
    """Remove None values so NestJS whitelist validation doesn't see null fields."""
    return {k: v for k, v in d.items() if v is not None}


# ── Jobs ─────────────────────────────────────────────────────────────────────

def _coerce_int(val: Any) -> Optional[int]:
    """Convert a numeric value to int (drops decimals). Returns None if val is None."""
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _coerce_deadline(val: Any) -> Optional[str]:
    """Ensure deadline is a full ISO 8601 datetime string NestJS/TypeORM can parse.
    Bare dates like '2026-04-25' are promoted to '2026-04-25T23:59:59.000Z'."""
    if not val:
        return None
    s = str(val).strip()
    if len(s) == 10 and s[4] == '-' and s[7] == '-':
        # YYYY-MM-DD → full UTC timestamp at end of day
        return f"{s}T23:59:59.000Z"
    return s


async def create_job(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """POST /jobs — snake_case tool params → camelCase NestJS CreateJobDto."""
    body = _strip_none({
        "title":              params.get("title"),
        "description":        params.get("description"),
        "category":           params.get("category"),
        "location":           params.get("location"),
        "county":             params.get("county"),
        "budgetMin":          _coerce_int(params.get("budget_min")),
        "budgetMax":          _coerce_int(params.get("budget_max")),
        "budgetType":         (params.get("budget_type") or "fixed").lower(),
        "isUrgent":           params.get("is_urgent", False),
        "deadline":           _coerce_deadline(params.get("deadline")),
        "positionsAvailable": _coerce_int(params.get("positions_available")),
        "companyName":        params.get("company_name"),
    })
    return await _dispatch("POST", "jobs", body, user_jwt)


async def update_job(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """PATCH /jobs/:id — update editable job fields."""
    job_id = params.get("job_id")
    if not job_id:
        return {"success": False, "error": "job_id required"}
    body = _strip_none({
        "title":              params.get("title"),
        "description":        params.get("description"),
        "category":           params.get("category"),
        "location":           params.get("location"),
        "county":             params.get("county"),
        "budgetMin":          _coerce_int(params.get("budget_min")),
        "budgetMax":          _coerce_int(params.get("budget_max")),
        "budgetType":         params.get("budget_type"),
        "isUrgent":           params.get("is_urgent"),
        "deadline":           _coerce_deadline(params.get("deadline")),
        "positionsAvailable": _coerce_int(params.get("positions_available")),
        "companyName":        params.get("company_name"),
    })
    return await _dispatch("PATCH", f"jobs/{job_id}", body, user_jwt)


async def close_job(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """PATCH /jobs/:id/cancel — cancel/close a job listing."""
    job_id = params.get("job_id")
    if not job_id:
        return {"success": False, "error": "job_id required"}
    return await _dispatch("PATCH", f"jobs/{job_id}/cancel", {}, user_jwt)


async def extend_job_deadline(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """PATCH /jobs/:id — extend deadline by patching only the deadline field."""
    job_id = params.get("job_id")
    new_deadline = params.get("new_deadline")
    if not job_id:
        return {"success": False, "error": "job_id required"}
    if not new_deadline:
        return {"success": False, "error": "new_deadline required"}
    return await _dispatch("PATCH", f"jobs/{job_id}", {"deadline": _coerce_deadline(new_deadline)}, user_jwt)


async def assign_agent_to_job(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """PATCH /jobs/:id/assign/:agent_id — assign a worker to a job."""
    job_id = params.get("job_id")
    agent_id = params.get("agent_id")
    if not job_id:
        return {"success": False, "error": "job_id required"}
    if not agent_id:
        return {"success": False, "error": "agent_id required"}
    return await _dispatch("PATCH", f"jobs/{job_id}/assign/{agent_id}", {}, user_jwt)


async def apply_to_job(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """POST /jobs/:id/apply — worker applies for a job."""
    job_id = params.get("job_id")
    if not job_id:
        return {"success": False, "error": "job_id required"}
    body = _strip_none({
        "coverNote":    params.get("cover_note"),
        "proposedRate": params.get("proposed_rate"),
    })
    return await _dispatch("POST", f"jobs/{job_id}/apply", body, user_jwt)


async def accept_application(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """PATCH /jobs/applications/:id/accept — accept a job application."""
    application_id = params.get("application_id")
    if not application_id:
        return {"success": False, "error": "application_id required"}
    return await _dispatch("PATCH", f"jobs/applications/{application_id}/accept", {}, user_jwt)


async def reject_application(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """PATCH /jobs/applications/:id/reject — reject a job application."""
    application_id = params.get("application_id")
    if not application_id:
        return {"success": False, "error": "application_id required"}
    body = _strip_none({"reason": params.get("reason")})
    return await _dispatch("PATCH", f"jobs/applications/{application_id}/reject", body, user_jwt)


# ── Tasks ────────────────────────────────────────────────────────────────────

async def create_task(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """POST /tasks — snake_case tool params → camelCase NestJS CreateTaskDto."""
    body = _strip_none({
        "title":        params.get("title"),
        "description":  params.get("description"),
        "priority":     params.get("priority"),
        "agentId":      params.get("agent_id"),
        "locationName": params.get("location_name"),
        "dueAt":        params.get("due_at"),
        "xpReward":     params.get("xp_reward"),
    })
    return await _dispatch("POST", "tasks", body, user_jwt)


async def update_task_status(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """Route to the correct NestJS task status endpoint based on the requested status."""
    task_id = params.get("task_id")
    if not task_id:
        return {"success": False, "error": "task_id required"}

    status = (params.get("status") or "").lower().strip()

    # Map logical status values to NestJS sub-routes
    _STATUS_ROUTE = {
        "start":       "start",
        "started":     "start",
        "in_progress": "start",
        "complete":    "complete",
        "completed":   "complete",
        "fail":        "fail",
        "failed":      "fail",
        "accept":      "accept",
        "accepted":    "accept",
        "decline":     "decline",
        "declined":    "decline",
        "approve":     "approve",
        "approved":    "approve",
    }

    body: Dict[str, Any] = _strip_none({"reason": params.get("reason")})

    if status in ("cancel", "cancelled"):
        # DELETE /tasks/:id — cancel the task
        return await _dispatch("DELETE", f"tasks/{task_id}", {}, user_jwt)

    route = _STATUS_ROUTE.get(status)
    if route:
        return await _dispatch("PATCH", f"tasks/{task_id}/{route}", body, user_jwt)

    # Unknown status — fall back to generic PATCH with status in body
    return await _dispatch("PATCH", f"tasks/{task_id}", {"status": status, **body}, user_jwt)


async def reassign_agent(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """PATCH /tasks/:id — update agentId to reassign the task to a new agent."""
    task_id = params.get("task_id")
    new_agent_id = params.get("new_agent_id")
    if not task_id:
        return {"success": False, "error": "task_id required"}
    if not new_agent_id:
        return {"success": False, "error": "new_agent_id required"}
    body = _strip_none({"agentId": new_agent_id, "reassignReason": params.get("reason")})
    return await _dispatch("PATCH", f"tasks/{task_id}", body, user_jwt)


# ── Wallet ────────────────────────────────────────────────────────────────────

async def initiate_withdrawal(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    """POST /wallet/withdraw — agent requests M-Pesa withdrawal."""
    body = _strip_none({
        "amount":     params.get("amount"),
        "mpesaPhone": params.get("mpesa_phone"),
    })
    return await _dispatch("POST", "wallet/withdraw", body, user_jwt)


# ── Payment OTP ──────────────────────────────────────────────────────────────

async def send_payment_otp(user_jwt: str) -> bool:
    """POST /auth/payment-otp/send — trigger OTP delivery for high-value withdrawal."""
    result = await _dispatch("POST", "auth/payment-otp/send", {}, user_jwt)
    # 204 No Content → success=True, result="" — any non-error response is success
    return result.get("success", False)


async def verify_payment_otp(user_jwt: str, code: str) -> bool:
    """POST /auth/payment-otp/verify — validate the OTP and consume it (single-use)."""
    result = await _dispatch("POST", "auth/payment-otp/verify", {"code": code}, user_jwt)
    return bool(result.get("success") and result.get("valid"))


# ── Notifications ─────────────────────────────────────────────────────────────
# NestJS does not expose a REST endpoint for sending notifications — they are
# dispatched internally from service events.  These stubs return a clear error
# so Cathy can surface a helpful message instead of a confusing 404.

async def send_notification(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    return {
        "success": False,
        "error": "Direct notification dispatch is not available via the AI service. "
                 "Notifications are sent automatically by platform events.",
    }


async def broadcast_message(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    return {
        "success": False,
        "error": "Broadcast messaging is not available via the AI service. "
                 "Use the Notifications section in the dashboard to send bulk messages.",
    }


async def send_job_alerts(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    return {
        "success": False,
        "error": "Job alerts are dispatched automatically when a job is posted. "
                 "No manual trigger is available via the AI service.",
    }


# ── Admin / Security ──────────────────────────────────────────────────────────
# These features (flagging, anomaly detection, issue logging) do not have
# REST endpoints — they are internal platform operations or dashboard-only.

async def flag_user(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    return {
        "success": False,
        "error": "User flagging is a dashboard-only operation. "
                 "Go to Users → [user] → Flag in the admin dashboard.",
    }


async def flag_job(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    return {
        "success": False,
        "error": "Job flagging is a dashboard-only operation. "
                 "Go to Jobs → [job] → Flag in the admin dashboard.",
    }


async def detect_anomalies(params: Dict[str, Any], user_jwt: str) -> Dict[str, Any]:
    return {
        "success": False,
        "error": "Anomaly detection runs automatically in the background. "
                 "Check the Security Alerts section in the dashboard for results.",
    }


async def log_issue(params: Dict[str, Any], user_jwt: Optional[str] = None) -> Dict[str, Any]:
    return {
        "success": False,
        "error": "Issue logging is not available via the AI service. "
                 "Please report technical issues through the platform's support channel.",
    }


__all__ = [
    "create_job",
    "update_job",
    "close_job",
    "extend_job_deadline",
    "assign_agent_to_job",
    "apply_to_job",
    "accept_application",
    "reject_application",
    "create_task",
    "update_task_status",
    "reassign_agent",
    "initiate_withdrawal",
    "send_notification",
    "broadcast_message",
    "send_job_alerts",
    "flag_user",
    "flag_job",
    "detect_anomalies",
    "log_issue",
]

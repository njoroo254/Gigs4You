"""
Structured Response Builder
Ensures all AI responses follow a consistent format.
"""
import json
from typing import Any, Dict, List, Optional
from datetime import datetime

from .schemas import ExecutionStatus, IntentType, ConfidenceLevel


class ResponseBuilder:
    """
    Fluent builder for structured AI responses.

    Usage pattern — always chain to .build():
        ResponseBuilder().success(data=result).with_source("db").build()
        ResponseBuilder().failure(error="Not found").build()
        ResponseBuilder().partial(data=..., message="...").with_warning("...").build()

    success(), failure(), and partial() configure the builder and return self.
    build() materializes the final dict.
    """

    def __init__(self):
        self._success: bool = True
        self._status: str = ExecutionStatus.SUCCESS.value
        self._message: str = "OK"
        self._payload: Any = None          # set by success(data=...) / partial(data=...)
        self._data: Dict[str, Any] = {}    # accumulator used by specialized subclasses
        self._error: Optional[str] = None
        self._errors: List[str] = []
        self._warnings: List[str] = []
        self._metadata: Dict[str, Any] = {}
        self._tools_used: List[str] = []
        self._sources: List[str] = []

    # ── Terminal configuration methods (return self for chaining) ────────────

    def success(self, data: Any = None, message: str = "Success") -> "ResponseBuilder":
        """Configure builder for a success response."""
        self._success = True
        self._status = ExecutionStatus.SUCCESS.value
        self._message = message
        if data is not None:
            self._payload = data
        return self

    def failure(self, error: str, message: str = "Operation failed") -> "ResponseBuilder":
        """Configure builder for a failure response."""
        self._success = False
        self._status = ExecutionStatus.FAILURE.value
        self._message = message
        self._error = error
        return self

    def partial(
        self,
        data: Any,
        message: str,
        warnings: Optional[List[str]] = None,
    ) -> "ResponseBuilder":
        """Configure builder for a partial-success response."""
        self._success = True
        self._status = ExecutionStatus.PARTIAL.value
        self._message = message
        if data is not None:
            self._payload = data
        if warnings:
            self._warnings.extend(warnings)
        return self

    # ── Chain methods ────────────────────────────────────────────────────────

    def with_intent(
        self,
        intent: IntentType,
        confidence: float,
        confidence_level: ConfidenceLevel,
    ) -> "ResponseBuilder":
        """Add intent detection metadata."""
        self._metadata["intent"] = {
            "type": intent.value,
            "confidence": confidence,
            "level": confidence_level.value,
        }
        return self

    def with_tools_used(self, tools: List[str]) -> "ResponseBuilder":
        """Add tools-used metadata."""
        self._tools_used = tools
        return self

    def with_source(self, source: str) -> "ResponseBuilder":
        """Append a data source to the sources list."""
        self._sources.append(source)
        return self

    def with_warning(self, warning: str) -> "ResponseBuilder":
        """Append a warning message."""
        self._warnings.append(warning)
        return self

    def with_error(self, error: str) -> "ResponseBuilder":
        """Append an error to the errors list."""
        self._errors.append(error)
        return self

    def with_metadata(self, key: str, value: Any) -> "ResponseBuilder":
        """Add arbitrary metadata."""
        self._metadata[key] = value
        return self

    # ── Build ────────────────────────────────────────────────────────────────

    def build(self) -> Dict[str, Any]:
        """Materialize the configured response as a plain dict."""
        # Prefer explicit payload; fall back to subclass-accumulated _data dict
        data_value: Any = (
            self._payload
            if self._payload is not None
            else (self._data if self._data else None)
        )

        response: Dict[str, Any] = {
            "success": self._success,
            "status": self._status,
            "message": self._message,
            "timestamp": datetime.utcnow().isoformat(),
        }

        if data_value is not None:
            response["data"] = data_value
        if self._error:
            response["error"] = self._error
        if self._errors:
            response["errors"] = self._errors
        if self._warnings:
            response["warnings"] = self._warnings

        meta: Dict[str, Any] = {**self._metadata}
        if self._tools_used:
            meta["tools_used"] = self._tools_used
        if self._sources:
            meta["sources"] = self._sources
        if meta:
            response["metadata"] = meta

        return response

    # ── Static helpers ───────────────────────────────────────────────────────

    @staticmethod
    def from_tool_result(result: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a raw tool result dict to a structured response."""
        success = result.get("success", False)
        return {
            "success": success,
            "status": ExecutionStatus.SUCCESS.value if success else ExecutionStatus.FAILURE.value,
            "data": result.get("data"),
            "message": result.get("message", "Tool executed"),
            "error": result.get("error"),
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": {
                "tool_name": result.get("tool_name"),
                "execution_time_ms": result.get("execution_time_ms"),
            },
        }

    @staticmethod
    def format_for_client(response: Dict[str, Any]) -> Dict[str, Any]:
        """
        Strip internal (_-prefixed) fields and ensure safe JSON serialization.
        """
        clean: Dict[str, Any] = {
            k: v for k, v in response.items() if not k.startswith("_")
        }

        if "timestamp" in clean and isinstance(clean["timestamp"], datetime):
            clean["timestamp"] = clean["timestamp"].isoformat()

        try:
            if "data" in clean:
                json.dumps(clean["data"])
        except (TypeError, ValueError):
            clean["data"] = str(clean["data"])

        return clean


# ============================================================================
# SPECIALIZED RESPONSE BUILDERS
# ============================================================================

class JobSearchResponseBuilder(ResponseBuilder):
    """Specialized builder for job-search responses."""

    def add_jobs(self, jobs: List[Dict[str, Any]]) -> "JobSearchResponseBuilder":
        self._data["jobs"] = jobs
        self._data["count"] = len(jobs)
        return self

    def with_filters_applied(self, filters: Dict[str, Any]) -> "JobSearchResponseBuilder":
        self._metadata["filters_applied"] = filters
        return self


class WorkerMatchResponseBuilder(ResponseBuilder):
    """Specialized builder for worker-matching responses."""

    def add_matches(
        self,
        workers: List[Dict[str, Any]],
        scores: Dict[str, float],
    ) -> "WorkerMatchResponseBuilder":
        matched = []
        for worker in workers:
            matched.append({
                **worker,
                "match_score": scores.get(worker.get("id"), 0.0),
            })
        self._data["matches"] = matched
        self._data["count"] = len(matched)
        return self

    def with_recommendation_reason(self, reason: str) -> "WorkerMatchResponseBuilder":
        self._metadata["recommendation_reason"] = reason
        return self


class AnalyticsResponseBuilder(ResponseBuilder):
    """Specialized builder for analytics responses."""

    def add_metrics(self, metrics: Dict[str, Any]) -> "AnalyticsResponseBuilder":
        self._data["metrics"] = metrics
        return self

    def add_insights(self, insights: List[str]) -> "AnalyticsResponseBuilder":
        self._data["insights"] = insights
        return self

    def with_time_range(
        self,
        start: datetime,
        end: datetime,
    ) -> "AnalyticsResponseBuilder":
        self._metadata["time_range"] = {
            "start": start.isoformat(),
            "end": end.isoformat(),
        }
        return self

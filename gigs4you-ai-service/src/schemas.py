"""
Unified schemas and enums for the AI orchestration engine.
All internal data structures use these types for consistency.
"""
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


# ============================================================================
# ENUMS
# ============================================================================

class IntentType(str, Enum):
    """Detected user intent categories."""
    JOB_SEARCH = "job_search"
    JOB_POST = "job_post"
    WORKER_SEARCH = "worker_search"
    TASK_MANAGEMENT = "task_management"
    PAYMENT = "payment"
    PROFILE = "profile"
    ANALYTICS = "analytics"
    GENERAL_CHAT = "general_chat"
    MATCHING = "matching"
    VERIFICATION = "verification"
    SUPPORT = "support"
    UNKNOWN = "unknown"


class AgentType(str, Enum):
    """Specialized agent types for routing."""
    CHAT_ASSISTANT = "chat_assistant"
    JOB_MATCHER = "job_matcher"
    WORKER_MATCHER = "worker_matcher"
    TASK_ORCHESTRATOR = "task_orchestrator"
    ANALYTICS_ADVISOR = "analytics_advisor"
    PAYMENT_ADVISOR = "payment_advisor"
    VERIFICATION_AGENT = "verification_agent"
    GENERAL = "general"


class ToolCategory(str, Enum):
    """Categories for organizing tools."""
    JOB = "job"
    WORKER = "worker"
    TASK = "task"
    PAYMENT = "payment"
    PROFILE = "profile"
    ANALYTICS = "analytics"
    NOTIFICATION = "notification"
    LOCATION = "location"
    MATCHING = "matching"
    SECURITY = "security"
    SYSTEM = "system"
    CHAT = "chat"


class ExecutionStatus(str, Enum):
    """Status of tool/pipeline execution."""
    SUCCESS = "success"
    FAILURE = "failure"
    PARTIAL = "partial"
    PENDING = "pending"
    SKIPPED = "skipped"


class ConfidenceLevel(str, Enum):
    """Confidence levels for AI outputs."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# ============================================================================
# CORE DATA MODELS
# ============================================================================

class ToolResult(BaseModel):
    """Standardized result from a tool execution."""
    tool_name: str
    status: ExecutionStatus
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    execution_time_ms: Optional[float] = None
    cached: bool = False


class IntentResult(BaseModel):
    """Result of intent detection."""
    intent: IntentType
    confidence: float = Field(ge=0.0, le=1.0)
    confidence_level: ConfidenceLevel
    suggested_tools: List[str] = Field(default_factory=list)
    reasoning: Optional[str] = None
    entities: Dict[str, Any] = Field(default_factory=dict)


class ToolExecutionRequest(BaseModel):
    """Request to execute a specific tool."""
    tool_name: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(default=0, ge=0, le=10)


class PipelineStep(BaseModel):
    """A single step in the orchestration pipeline."""
    step_id: str
    tool_name: Optional[str] = None
    intent_detection: bool = False
    depends_on: List[str] = Field(default_factory=list)
    parallel_with: List[str] = Field(default_factory=list)
    parameters: Dict[str, Any] = Field(default_factory=dict)
    required: bool = True
    retry_count: int = Field(default=0, ge=0, le=3)


class PipelineResult(BaseModel):
    """Result of a complete pipeline execution."""
    pipeline_id: str
    status: ExecutionStatus
    steps: List[ToolResult] = Field(default_factory=list)
    total_execution_time_ms: float = 0.0
    final_response: Optional[Dict[str, Any]] = None
    context_updates: Dict[str, Any] = Field(default_factory=dict)


class OrchestrationContext(BaseModel):
    """Context maintained throughout orchestration."""
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    user_role: Optional[str] = None
    organisation_id: Optional[str] = None
    conversation_history: List[Dict[str, Any]] = Field(default_factory=list)
    extracted_entities: Dict[str, Any] = Field(default_factory=dict)
    tool_results: Dict[str, ToolResult] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# RESPONSE SCHEMAS
# ============================================================================

class OrchestrationResponse(BaseModel):
    """Standardized response from the orchestration engine."""
    success: bool
    status: ExecutionStatus
    intent: Optional[IntentType] = None
    message: str
    data: Optional[Dict[str, Any]] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    tools_used: List[str] = Field(default_factory=list)
    execution_time_ms: float = 0.0
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class StreamingChunk(BaseModel):
    """Chunk for streaming responses."""
    type: str  # "text", "tool_call", "tool_result", "done"
    content: Any
    tool_name: Optional[str] = None


# ============================================================================
# TOOL REGISTRY SCHEMAS
# ============================================================================

class ToolMetadata(BaseModel):
    """Metadata for a registered tool."""
    name: str
    description: str
    category: ToolCategory
    parameters: Dict[str, Any] = Field(default_factory=dict)
    requires_auth: bool = False
    requires_jwt: bool = False
    cacheable: bool = True
    cache_ttl_seconds: int = 300
    rate_limit: Optional[int] = None
    version: str = "1.0.0"
    deprecated: bool = False
    replacement_tool: Optional[str] = None


class ToolExecutionContext(BaseModel):
    """Context passed to tool executors."""
    tool_name: str
    parameters: Dict[str, Any]
    user_jwt: Optional[str] = None
    session_id: Optional[str] = None
    organisation_id: Optional[str] = None
    cache: bool = True


# ============================================================================
# VALIDATION SCHEMAS
# ============================================================================

class ChatRequest(BaseModel):
    """Validated chat request."""
    message: str = Field(min_length=1, max_length=4000)
    history: List[Dict[str, Any]] = Field(default_factory=list)
    session_id: Optional[str] = None


class MatchingRequest(BaseModel):
    """Validated matching request."""
    job_id: Optional[str] = None
    job_data: Optional[Dict[str, Any]] = None
    worker_ids: List[str] = Field(default_factory=list)
    constraints: Dict[str, Any] = Field(default_factory=dict)
    limit: int = Field(default=10, ge=1, le=50)


class IntentDetectionRequest(BaseModel):
    """Request for intent detection."""
    message: str
    history: List[Dict[str, Any]] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)

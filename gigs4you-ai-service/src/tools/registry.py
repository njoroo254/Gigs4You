"""
Tool Registry - Central registry for all available tools.
Ensures single source of truth for tool execution.
"""
import logging
import time
from typing import Any, Dict, List, Optional

from ..schemas import ToolMetadata, ToolCategory, ExecutionStatus
from .handler import dispatch

logger = logging.getLogger(__name__)


class ToolRegistry:
    """
    Central registry for all tools.
    All tool execution MUST go through this registry.
    """
    
    def __init__(self):
        self._tools: Dict[str, ToolMetadata] = {}
        self._handlers: Dict[str, callable] = {}
        self._initialize_tools()
    
    def _initialize_tools(self):
        """Initialize all tool metadata."""
        # Job Management Tools
        self._register_tool(
            name="search_jobs",
            description="Search for available jobs based on criteria",
            category=ToolCategory.JOB,
            requires_jwt=False,
            cacheable=True,
            cache_ttl_seconds=60,
        )
        self._register_tool(
            name="get_job_details",
            description="Get detailed information about a specific job",
            category=ToolCategory.JOB,
            requires_jwt=False,
            cacheable=True,
            cache_ttl_seconds=300,
        )
        self._register_tool(
            name="create_job",
            description="Create a new job posting",
            category=ToolCategory.JOB,
            requires_jwt=True,
            cacheable=False,
        )
        self._register_tool(
            name="update_job",
            description="Update an existing job posting",
            category=ToolCategory.JOB,
            requires_jwt=True,
            cacheable=False,
        )
        
        # Worker Management Tools
        self._register_tool(
            name="find_workers",
            description="Find workers/agents based on skills and location",
            category=ToolCategory.WORKER,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=120,
        )
        self._register_tool(
            name="get_worker_profile",
            description="Get detailed worker/agent profile",
            category=ToolCategory.WORKER,
            requires_jwt=False,
            cacheable=True,
            cache_ttl_seconds=300,
        )
        self._register_tool(
            name="get_worker_stats",
            description="Get worker performance statistics",
            category=ToolCategory.WORKER,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=60,
        )
        
        # Task Management Tools
        self._register_tool(
            name="get_tasks",
            description="Get tasks for a user or organisation",
            category=ToolCategory.TASK,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=30,
        )
        self._register_tool(
            name="get_task_details",
            description="Get detailed information about a specific task",
            category=ToolCategory.TASK,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=60,
        )
        self._register_tool(
            name="create_task",
            description="Create a new task",
            category=ToolCategory.TASK,
            requires_jwt=True,
            cacheable=False,
        )
        self._register_tool(
            name="update_task",
            description="Update an existing task",
            category=ToolCategory.TASK,
            requires_jwt=True,
            cacheable=False,
        )
        
        # Payment Tools
        self._register_tool(
            name="get_wallet_balance",
            description="Get wallet balance for a user",
            category=ToolCategory.PAYMENT,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=10,
        )
        self._register_tool(
            name="get_transactions",
            description="Get transaction history",
            category=ToolCategory.PAYMENT,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=30,
        )
        self._register_tool(
            name="request_withdrawal",
            description="Request a withdrawal from wallet",
            category=ToolCategory.PAYMENT,
            requires_jwt=True,
            cacheable=False,
        )
        
        # Profile Tools
        self._register_tool(
            name="get_user_profile",
            description="Get user profile information",
            category=ToolCategory.PROFILE,
            requires_jwt=False,
            cacheable=True,
            cache_ttl_seconds=300,
        )
        self._register_tool(
            name="update_profile",
            description="Update user profile",
            category=ToolCategory.PROFILE,
            requires_jwt=True,
            cacheable=False,
        )
        
        # Analytics Tools
        self._register_tool(
            name="get_platform_stats",
            description="Get platform-wide statistics",
            category=ToolCategory.ANALYTICS,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=60,
        )
        self._register_tool(
            name="get_organisation_stats",
            description="Get statistics for a specific organisation",
            category=ToolCategory.ANALYTICS,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=60,
        )
        self._register_tool(
            name="get_agent_stats",
            description="Get statistics for a specific agent",
            category=ToolCategory.ANALYTICS,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=30,
        )
        
        # Matching Tools
        self._register_tool(
            name="rank_workers_for_job",
            description="Rank workers based on job requirements",
            category=ToolCategory.MATCHING,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=120,
        )
        self._register_tool(
            name="match_workers_to_job",
            description="Find best matching workers for a job",
            category=ToolCategory.MATCHING,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=120,
        )
        
        # Notification Tools
        self._register_tool(
            name="send_notification",
            description="Send a notification to a user",
            category=ToolCategory.NOTIFICATION,
            requires_jwt=True,
            cacheable=False,
        )
        
        # Location Tools
        self._register_tool(
            name="get_jobs_nearby",
            description="Get jobs near a specific location",
            category=ToolCategory.LOCATION,
            requires_jwt=False,
            cacheable=True,
            cache_ttl_seconds=60,
        )
        self._register_tool(
            name="get_workers_nearby",
            description="Get workers near a specific location",
            category=ToolCategory.LOCATION,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=60,
        )
        self._register_tool(
            name="track_agent_location",
            description="Track an agent's current location",
            category=ToolCategory.LOCATION,
            requires_jwt=True,
            cacheable=True,
            cache_ttl_seconds=10,
        )
        
        # System Tools
        self._register_tool(
            name="get_system_status",
            description="Get system status information",
            category=ToolCategory.SYSTEM,
            requires_jwt=False,
            cacheable=True,
            cache_ttl_seconds=30,
        )
        self._register_tool(
            name="log_issue",
            description="Log an issue or bug report",
            category=ToolCategory.SYSTEM,
            requires_jwt=False,
            cacheable=False,
        )
    
    def _register_tool(
        self,
        name: str,
        description: str,
        category: ToolCategory,
        requires_jwt: bool = False,
        requires_auth: bool = False,
        cacheable: bool = True,
        cache_ttl_seconds: int = 300,
        rate_limit: Optional[int] = None,
    ):
        """Register a tool with its metadata."""
        self._tools[name] = ToolMetadata(
            name=name,
            description=description,
            category=category,
            requires_jwt=requires_jwt,
            requires_auth=requires_auth,
            cacheable=cacheable,
            cache_ttl_seconds=cache_ttl_seconds,
            rate_limit=rate_limit,
        )
    
    def get_tool_metadata(self, tool_name: str) -> Optional[ToolMetadata]:
        """Get metadata for a specific tool."""
        return self._tools.get(tool_name)
    
    def list_tools(self, category: Optional[ToolCategory] = None) -> List[ToolMetadata]:
        """List all registered tools, optionally filtered by category."""
        if category:
            return [t for t in self._tools.values() if t.category == category]
        return list(self._tools.values())
    
    def get_tools_by_category(self) -> Dict[ToolCategory, List[ToolMetadata]]:
        """Get all tools organized by category."""
        result: Dict[ToolCategory, List[ToolMetadata]] = {}
        for tool in self._tools.values():
            if tool.category not in result:
                result[tool.category] = []
            result[tool.category].append(tool)
        return result
    
    async def execute(
        self,
        tool_name: str,
        parameters: Dict[str, Any],
        user_jwt: Optional[str] = None,
        session_id: Optional[str] = None,
        organisation_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute a tool through the registry.
        This is the SINGLE ENTRY POINT for all tool execution.
        """
        start_time = time.time()
        
        # Validate tool exists
        metadata = self._tools.get(tool_name)
        if not metadata:
            return {
                "success": False,
                "error": f"Unknown tool: {tool_name}",
                "available_tools": list(self._tools.keys()),
            }
        
        # Check if tool is deprecated
        if metadata.deprecated:
            logger.warning(f"Tool {tool_name} is deprecated. Replacement: {metadata.replacement_tool}")
        
        # Validate authentication
        if metadata.requires_jwt and not user_jwt:
            return {
                "success": False,
                "error": f"Tool {tool_name} requires authentication",
                "code": "AUTH_REQUIRED",
            }
        
        try:
            # Execute through the dispatcher
            result = await dispatch(
                tool_name=tool_name,
                tool_input=parameters,
                user_jwt=user_jwt,
            )
            
            execution_time_ms = (time.time() - start_time) * 1000
            
            # Wrap result with execution metadata
            return {
                **result,
                "_meta": {
                    "tool_name": tool_name,
                    "execution_time_ms": execution_time_ms,
                    "cached": False,  # TODO: Implement caching
                }
            }
            
        except Exception as e:
            logger.error(f"Tool {tool_name} execution failed: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "tool_name": tool_name,
                "execution_time_ms": (time.time() - start_time) * 1000,
            }
    
    async def execute_batch(
        self,
        requests: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Execute multiple tools in parallel.
        Used for fetching independent data.
        """
        import asyncio
        
        tasks = [
            self.execute(
                tool_name=r.get("tool_name"),
                parameters=r.get("parameters", {}),
                user_jwt=r.get("user_jwt"),
                session_id=r.get("session_id"),
                organisation_id=r.get("organisation_id"),
            )
            for r in requests
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Convert exceptions to error results
        return [
            r if not isinstance(r, Exception) else {"success": False, "error": str(r)}
            for r in results
        ]


# ============================================================================
# SINGLETON INSTANCE
# ============================================================================

_registry: Optional[ToolRegistry] = None


def get_tool_registry() -> ToolRegistry:
    """Get or create the tool registry singleton."""
    global _registry
    if _registry is None:
        _registry = ToolRegistry()
    return _registry

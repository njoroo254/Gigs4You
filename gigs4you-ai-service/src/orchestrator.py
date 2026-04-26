"""
AI Orchestration Engine
Deterministic orchestration layer for all AI operations.

Architecture:
User Input → Intent Detection → Tool Routing → Tool Execution → Context Resolution → Response Builder
"""
import asyncio
import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from .schemas import (
    IntentType,
    ExecutionStatus,
    ToolResult,
    OrchestrationContext,
    OrchestrationResponse,
    ToolExecutionRequest,
    PipelineStep,
)
from .claude_client import chat_with_tools
from .tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


class OrchestrationEngine:
    """
    Central orchestration engine that controls all AI operations.
    
    This is the SINGLE SOURCE OF TRUTH for all AI execution.
    No direct LLM calls should bypass this engine.
    """
    
    def __init__(self, tool_registry: ToolRegistry):
        self.tool_registry = tool_registry
        self._intent_detector = None  # Lazy loaded
    
    # ========================================================================
    # MAIN ENTRY POINT
    # ========================================================================
    
    async def execute(
        self,
        message: str,
        context: OrchestrationContext,
        system_prompt: Optional[str] = None,
    ) -> OrchestrationResponse:
        """
        Main entry point for all AI orchestration.
        
        This method guarantees:
        1. All LLM calls go through this path
        2. Tool execution is centralized
        3. Response format is consistent
        """
        start_time = time.time()
        pipeline_id = str(uuid.uuid4())
        
        try:
            # Step 1: Intent Detection
            intent_result = await self._detect_intent(message, context)
            logger.info(f"[{pipeline_id}] Detected intent: {intent_result.intent} ({intent_result.confidence})")
            
            # Step 2: Build Execution Plan
            execution_plan = self._build_execution_plan(intent_result, context)
            
            # Step 3: Execute Plan (may involve multiple tool calls)
            execution_result = await self._execute_plan(
                execution_plan,
                message,
                context,
                system_prompt,
            )
            
            # Step 4: Build Response
            response = self._build_response(
                pipeline_id=pipeline_id,
                intent_result=intent_result,
                execution_result=execution_result,
                start_time=start_time,
            )
            
            return response
            
        except Exception as e:
            logger.error(f"[{pipeline_id}] Orchestration failed: {e}", exc_info=True)
            return OrchestrationResponse(
                success=False,
                status=ExecutionStatus.FAILURE,
                message="Orchestration failed",
                error=str(e),
                execution_time_ms=(time.time() - start_time) * 1000,
            )
    
    # ========================================================================
    # STEP 1: INTENT DETECTION
    # ========================================================================
    
    async def _detect_intent(
        self,
        message: str,
        context: OrchestrationContext,
    ) -> Any:
        """
        Detect user intent from message.
        Uses heuristic rules + LLM fallback for complex cases.
        """
        message_lower = message.lower()
        
        # Heuristic intent detection (fast path)
        intent, confidence, entities = self._heuristic_intent_detection(message_lower, message)
        
        if confidence >= 0.8:
            return type('IntentResult', (), {
                'intent': intent,
                'confidence': confidence,
                'confidence_level': 'high',
                'suggested_tools': self._get_tools_for_intent(intent),
                'reasoning': 'Heuristic match',
                'entities': entities,
            })()
        
        # LLM-assisted intent detection for ambiguous cases
        return await self._llm_intent_detection(message, context, intent, confidence)
    
    def _heuristic_intent_detection(
        self,
        message_lower: str,
        message: str,
    ) -> Tuple[IntentType, float, Dict[str, Any]]:
        """
        Fast heuristic-based intent detection.
        Returns: (intent, confidence, extracted_entities)
        """
        entities = {}
        scores: Dict[IntentType, float] = {intent: 0.0 for intent in IntentType}
        
        # Job Search patterns
        job_keywords = ['find job', 'search job', 'looking for work', 'job near', 'jobs in', 
                       'find work', 'hire', 'job search', 'work available']
        for kw in job_keywords:
            if kw in message_lower:
                scores[IntentType.JOB_SEARCH] += 0.3
                if 'search' in kw or 'find' in kw:
                    entities['action'] = 'search'
        
        # Job Post patterns
        post_keywords = ['post job', 'create job', 'post a job', 'hire someone', 
                        'looking for worker', 'need worker', 'advertise job']
        for kw in post_keywords:
            if kw in message_lower:
                scores[IntentType.JOB_POST] += 0.3
        
        # Worker Search patterns
        worker_keywords = ['find worker', 'search worker', 'worker profile', 'agent nearby',
                          'available worker', 'worker in', 'field agent']
        for kw in worker_keywords:
            if kw in message_lower:
                scores[IntentType.WORKER_SEARCH] += 0.3
        
        # Task patterns
        task_keywords = ['task', 'assignment', 'complete task', 'task status', 
                        'my tasks', 'pending task', 'assign task']
        for kw in task_keywords:
            if kw in message_lower:
                scores[IntentType.TASK_MANAGEMENT] += 0.25
        
        # Payment patterns
        payment_keywords = ['payment', 'withdraw', 'balance', 'wallet', 'pay', 
                           'mpesa', 'salary', 'earnings', 'payout']
        for kw in payment_keywords:
            if kw in message_lower:
                scores[IntentType.PAYMENT] += 0.3
        
        # Profile patterns
        profile_keywords = ['profile', 'my profile', 'update profile', 'edit profile',
                          'account', 'settings']
        for kw in profile_keywords:
            if kw in message_lower:
                scores[IntentType.PROFILE] += 0.25
        
        # Analytics patterns
        analytics_keywords = ['analytics', 'report', 'stats', 'performance', 
                               'metrics', 'dashboard', 'overview']
        for kw in analytics_keywords:
            if kw in message_lower:
                scores[IntentType.ANALYTICS] += 0.3
        
        # Matching patterns
        matching_keywords = ['match', 'recommend', 'suggested', 'best fit', 
                           'compatible', 'suitable']
        for kw in matching_keywords:
            if kw in message_lower:
                scores[IntentType.MATCHING] += 0.25
        
        # Verification patterns
        verify_keywords = ['verify', 'check', 'confirm', 'validate', 'approved']
        for kw in verify_keywords:
            if kw in message_lower:
                scores[IntentType.VERIFICATION] += 0.25
        
        # Support patterns
        support_keywords = ['help', 'support', 'issue', 'problem', 'broken',
                           'not working', 'error', 'contact']
        for kw in support_keywords:
            if kw in message_lower:
                scores[IntentType.SUPPORT] += 0.25
        
        # Find highest scoring intent
        best_intent = max(scores, key=scores.get)
        best_confidence = scores[best_intent]
        
        # Normalize confidence
        if best_confidence == 0:
            return IntentType.UNKNOWN, 0.5, {}
        
        return best_intent, min(best_confidence, 1.0), entities
    
    async def _llm_intent_detection(
        self,
        message: str,
        context: OrchestrationContext,
        fallback_intent: IntentType,
        fallback_confidence: float,
    ) -> Any:
        """
        LLM-assisted intent detection for complex cases.
        Only called when heuristic confidence is low.
        """
        intent_prompt = (
            f'Classify this message intent. User: "{message}"\n\n'
            f'Choose exactly one intent from: job_search, job_post, worker_search, '
            f'task_management, payment, profile, analytics, matching, verification, '
            f'support, general_chat, unknown\n\n'
            f'Reply with ONLY this JSON (no markdown, no explanation):\n'
            f'{{"intent":"<chosen>","confidence":0.0,"reasoning":"<1 sentence>"}}'
        )

        try:
            response = await chat_with_tools(
                message=intent_prompt,
                system_prompt=(
                    "You are an intent classifier. "
                    "Respond with ONLY a raw JSON object — no markdown fences, no prose."
                ),
                history=[],
                tool_handler=None,
            )

            import json as _json
            # Strip any accidental markdown fences before parsing
            cleaned = response.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            result = _json.loads(cleaned)
            
            return type('IntentResult', (), {
                'intent': IntentType(result.get('intent', 'unknown')),
                'confidence': float(result.get('confidence', fallback_confidence)),
                'confidence_level': 'high' if result.get('confidence', 0) > 0.7 else 'medium',
                'suggested_tools': self._get_tools_for_intent(IntentType(result.get('intent', 'unknown'))),
                'reasoning': result.get('reasoning', 'LLM-detected'),
                'entities': {},
            })()
            
        except Exception as e:
            logger.warning(f"LLM intent detection failed, using fallback: {e}")
            return type('IntentResult', (), {
                'intent': fallback_intent,
                'confidence': fallback_confidence * 0.8,  # Reduce confidence on failure
                'confidence_level': 'medium',
                'suggested_tools': self._get_tools_for_intent(fallback_intent),
                'reasoning': f'Fallback due to error: {str(e)}',
                'entities': {},
            })()
    
    def _get_tools_for_intent(self, intent: IntentType) -> List[str]:
        """Map intent to suggested tools."""
        intent_tool_map = {
            IntentType.JOB_SEARCH: ['search_jobs', 'get_jobs_nearby', 'get_job_details'],
            IntentType.JOB_POST: ['create_job', 'post_job'],
            IntentType.WORKER_SEARCH: ['find_workers', 'search_workers', 'get_worker_profile'],
            IntentType.TASK_MANAGEMENT: ['get_tasks', 'create_task', 'update_task', 'get_task_details'],
            IntentType.PAYMENT: ['get_wallet_balance', 'get_transactions', 'request_withdrawal'],
            IntentType.PROFILE: ['get_user_profile', 'update_profile'],
            IntentType.ANALYTICS: ['get_organisation_stats', 'get_platform_stats', 'get_agent_stats'],
            IntentType.MATCHING: ['rank_workers_for_job', 'match_workers_to_job'],
            IntentType.VERIFICATION: ['get_pending_verifications', 'review_verification'],
            IntentType.SUPPORT: ['get_support_info', 'create_support_ticket'],
            IntentType.GENERAL_CHAT: [],
            IntentType.UNKNOWN: [],
        }
        return intent_tool_map.get(intent, [])
    
    # ========================================================================
    # STEP 2: BUILD EXECUTION PLAN
    # ========================================================================
    
    def _build_execution_plan(self, intent_result: Any, context: OrchestrationContext) -> List[PipelineStep]:
        """
        Build a deterministic execution plan based on detected intent.
        
        This ensures AI doesn't control flow - code controls execution.
        """
        plan = []
        
        # Intent-specific execution plans
        if intent_result.intent == IntentType.JOB_SEARCH:
            plan.append(PipelineStep(
                step_id="search_jobs",
                tool_name="search_jobs",
                parameters={"query": intent_result.entities.get("query", "")},
                required=True,
            ))
            
        elif intent_result.intent == IntentType.JOB_POST:
            # Write operations must go through Claude's tool loop so that
            # Claude can collect all required fields from the user's message.
            # Do NOT call create_job directly here with empty parameters.
            pass
            
        elif intent_result.intent == IntentType.WORKER_SEARCH:
            plan.append(PipelineStep(
                step_id="find_workers",
                tool_name="find_workers",
                parameters={},
                required=True,
            ))
            
        elif intent_result.intent == IntentType.TASK_MANAGEMENT:
            plan.append(PipelineStep(
                step_id="get_tasks",
                tool_name="get_tasks",
                parameters={"user_id": context.user_id},
                required=True,
            ))
            
        elif intent_result.intent == IntentType.PAYMENT:
            plan.append(PipelineStep(
                step_id="get_wallet_balance",
                tool_name="get_wallet_balance",
                parameters={"user_id": context.user_id},
                required=True,
            ))
            plan.append(PipelineStep(
                step_id="get_transactions",
                tool_name="get_transactions",
                parameters={"user_id": context.user_id},
                required=False,
            ))
            
        elif intent_result.intent == IntentType.ANALYTICS:
            plan.append(PipelineStep(
                step_id="get_stats",
                tool_name="get_organisation_stats" if context.organisation_id else "get_platform_stats",
                parameters={"organisation_id": context.organisation_id},
                required=True,
            ))
            
        elif intent_result.intent == IntentType.MATCHING:
            plan.append(PipelineStep(
                step_id="match_workers",
                tool_name="rank_workers_for_job",
                parameters={},
                required=True,
            ))
        
        elif intent_result.intent in [IntentType.GENERAL_CHAT, IntentType.UNKNOWN]:
            # No tools needed, respond directly
            pass
        
        else:
            # Default: try to extract entities and respond
            pass
        
        return plan
    
    # ========================================================================
    # STEP 3: EXECUTE PLAN
    # ========================================================================
    
    async def _execute_plan(
        self,
        plan: List[PipelineStep],
        original_message: str,
        context: OrchestrationContext,
        system_prompt: Optional[str],
    ) -> Tuple[List[ToolResult], Dict[str, Any]]:
        """
        Execute the planned steps with parallel execution where possible.
        """
        if not plan:
            # No tools needed - return empty result
            return [], {}
        
        # Identify parallel groups
        parallel_groups = self._group_parallel_steps(plan)
        
        all_results = []
        context_updates = {}
        
        # Execute each group (sequential groups, parallel within groups)
        for group in parallel_groups:
            if len(group) == 1:
                # Single step - execute directly
                result = await self._execute_step(group[0], context)
                all_results.append(result)
                if result.data:
                    context_updates[result.tool_name] = result.data
            else:
                # Multiple steps in parallel
                results = await self._execute_parallel(group, context)
                all_results.extend(results)
                for result in results:
                    if result.data:
                        context_updates[result.tool_name] = result.data
        
        return all_results, context_updates
    
    def _group_parallel_steps(self, plan: List[PipelineStep]) -> List[List[PipelineStep]]:
        """Group steps that can be executed in parallel."""
        groups = []
        remaining = list(plan)
        
        while remaining:
            current_group = [remaining[0]]
            remaining = remaining[1:]
            
            # Find all steps that have no unmet dependencies
            still_checking = True
            while still_checking:
                still_checking = False
                for step in remaining[:]:
                    deps_met = all(dep in [s.step_id for s in current_group] for dep in step.depends_on)
                    if deps_met and not step.depends_on:
                        current_group.append(step)
                        remaining.remove(step)
                        still_checking = True
            
            groups.append(current_group)
        
        return groups
    
    async def _execute_parallel(
        self,
        steps: List[PipelineStep],
        context: OrchestrationContext,
    ) -> List[ToolResult]:
        """Execute multiple steps in parallel."""
        tasks = [self._execute_step(step, context) for step in steps]
        return await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _execute_step(
        self,
        step: PipelineStep,
        context: OrchestrationContext,
    ) -> ToolResult:
        """Execute a single step."""
        start_time = time.time()
        
        try:
            result = await self.tool_registry.execute(
                tool_name=step.tool_name,
                parameters=step.parameters,
                user_jwt=context.metadata.get("user_jwt"),
                session_id=context.session_id,
                organisation_id=context.organisation_id,
            )
            
            return ToolResult(
                tool_name=step.tool_name,
                status=ExecutionStatus.SUCCESS if result.get("success") else ExecutionStatus.FAILURE,
                data=result,
                execution_time_ms=(time.time() - start_time) * 1000,
            )
            
        except Exception as e:
            logger.error(f"Step {step.step_id} failed: {e}")
            return ToolResult(
                tool_name=step.tool_name,
                status=ExecutionStatus.FAILURE,
                error=str(e),
                execution_time_ms=(time.time() - start_time) * 1000,
            )
    
    # ========================================================================
    # STEP 4: BUILD RESPONSE
    # ========================================================================
    
    def _build_response(
        self,
        pipeline_id: str,
        intent_result: Any,
        execution_result: Tuple[List[ToolResult], Dict[str, Any]],
        start_time: float,
    ) -> OrchestrationResponse:
        """Build standardized response from execution results."""
        tool_results, context_updates = execution_result
        
        # Determine overall status
        if not tool_results:
            status = ExecutionStatus.SUCCESS
        elif all(r.status == ExecutionStatus.SUCCESS for r in tool_results):
            status = ExecutionStatus.SUCCESS
        elif any(r.status == ExecutionStatus.FAILURE for r in tool_results):
            status = ExecutionStatus.PARTIAL
        else:
            status = ExecutionStatus.PARTIAL
        
        # Collect used tools
        tools_used = [r.tool_name for r in tool_results if r.tool_name]
        
        # Build message based on results
        message = self._generate_message(intent_result, tool_results)
        
        return OrchestrationResponse(
            success=status in [ExecutionStatus.SUCCESS, ExecutionStatus.PARTIAL],
            status=status,
            intent=intent_result.intent,
            message=message,
            data=context_updates if context_updates else None,
            confidence=intent_result.confidence,
            tools_used=tools_used,
            execution_time_ms=(time.time() - start_time) * 1000,
            metadata={
                "pipeline_id": pipeline_id,
                "intent_reasoning": intent_result.reasoning,
            },
        )
    
    def _generate_message(self, intent_result: Any, tool_results: List[ToolResult]) -> str:
        """Generate human-readable message from results."""
        if not tool_results:
            return "I understand. How can I help you further?"
        
        success_count = sum(1 for r in tool_results if r.status == ExecutionStatus.SUCCESS)
        total_count = len(tool_results)
        
        if success_count == total_count:
            return f"Successfully processed {total_count} request(s)."
        elif success_count > 0:
            return f"Processed {success_count}/{total_count} requests. Some items need attention."
        else:
            return "Unable to process your request. Please try again."


# ============================================================================
# SINGLETON INSTANCE
# ============================================================================

_orchestrator: Optional[OrchestrationEngine] = None


def get_orchestrator(tool_registry: ToolRegistry) -> OrchestrationEngine:
    """Get or create the orchestration engine singleton."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = OrchestrationEngine(tool_registry)
    return _orchestrator

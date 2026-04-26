"""
AI reasoning helpers for Gigs4You tool handlers.
This module contains the business logic for intelligence tools and
centralises heuristics used by the handler layer.
"""

from typing import Any, Dict, List, Optional

from .reads import (
    get_job_details,
    get_available_workers_for_job,
    get_worker_full_profile,
    search_open_jobs,
    search_available_workers,
    get_user_context,
    get_wallet_transactions_db,
    get_worker_history,
    get_platform_stats,
)


def _normalize_skills(skills: Any) -> List[str]:
    if not skills:
        return []
    if isinstance(skills, str):
        return [s.strip() for s in skills.split(",") if s.strip()]
    if isinstance(skills, list):
        return [str(s).strip() for s in skills if s]
    return []


async def rank_workers_for_job(job_id: str, limit: int = 10) -> Dict[str, Any]:
    job = await get_job_details(job_id)
    if not job:
        return {"success": False, "error": "Job not found"}

    candidates = await get_available_workers_for_job(job_id, limit=limit)
    ranked_workers = sorted(
        candidates,
        key=lambda w: (
            float(w.get("average_rating", 0)) * 2
            + (10 if w.get("county") == job.get("location") else 0)
            + min(10, len(_normalize_skills(w.get("skills", []))) * 2)
        ),
        reverse=True,
    )[:limit]

    return {"success": True, "ranked_workers": ranked_workers, "count": len(ranked_workers)}


async def recommend_workers(job_id: str, required_skills: Optional[str] = None, county: Optional[str] = None, limit: int = 10) -> Dict[str, Any]:
    job = await get_job_details(job_id)
    if not job:
        return {"success": False, "error": "Job not found"}

    skills = _normalize_skills(required_skills or job.get("required_skills", []))
    candidate_location = county or job.get("location") or job.get("county")

    workers = await search_available_workers(
        skills=skills[0] if skills else None,
        location=candidate_location,
        limit=limit,
    )

    recommendations = []
    for worker in workers:
        score = 0.5
        if worker.get("county") == candidate_location:
            score += 0.2
        worker_skills = _normalize_skills(worker.get("skills", []))
        if any(skill.lower() in [ws.lower() for ws in worker_skills] for skill in skills):
            score += 0.3
        if float(worker.get("average_rating", 0)) >= 4.5:
            score += 0.1
        recommendations.append({
            "worker": worker,
            "match_score": min(score, 1.0),
        })
    return {"success": True, "recommendations": recommendations}


async def recommend_jobs(user_id: str, limit: int = 10) -> Dict[str, Any]:
    profile = await get_worker_full_profile(user_id)
    if not profile:
        return {"success": False, "error": "Worker profile not found"}

    worker_location = profile.get("county") or profile.get("location", "")
    worker_skills = _normalize_skills(profile.get("skills", []))
    jobs = await search_open_jobs(
        query=worker_skills[0] if worker_skills else None,
        location=worker_location or None,
        limit=limit,
    )

    recommendations = []
    for job in jobs:
        score = 0.5
        if job.get("location") == worker_location:
            score += 0.2
        job_skills = _normalize_skills(job.get("required_skills", []))
        if any(skill.lower() in [js.lower() for js in job_skills] for skill in worker_skills):
            score += 0.3
        recommendations.append({"job": job, "match_score": min(score, 1.0)})
    return {"success": True, "recommendations": recommendations}


async def predict_job_success(job_id: str) -> Dict[str, Any]:
    job = await get_job_details(job_id)
    if not job:
        return {"success": False, "error": "Job not found"}

    probability = 0.5
    if job.get("budget_max", 0) > 10000:
        probability += 0.2
    elif job.get("budget_max", 0) < 2000:
        probability -= 0.1

    if len(job.get("description", "")) > 50:
        probability += 0.1
    if job.get("required_skills"):
        probability += 0.1

    return {"success": True, "probability": min(max(probability, 0.0), 1.0), "job_id": job_id}


async def predict_worker_performance(user_id: str, job_category: Optional[str] = None) -> Dict[str, Any]:
    profile = await get_worker_full_profile(user_id)
    if not profile:
        return {"success": False, "error": "Worker profile not found"}

    score = 0.5
    rating = float(profile.get("average_rating", 0))
    if rating >= 4.5:
        score += 0.3
    elif rating >= 4.0:
        score += 0.1
    elif rating < 3.0:
        score -= 0.2

    completed_jobs = int(profile.get("completed_jobs", 0))
    if completed_jobs > 20:
        score += 0.2
    elif completed_jobs > 10:
        score += 0.1

    # If a category is specified, check whether worker has matching skills
    if job_category:
        worker_skills = [s.lower() for s in _normalize_skills(profile.get("skills", []))]
        if any(job_category.lower() in ws or ws in job_category.lower() for ws in worker_skills):
            score += 0.1

    return {
        "success": True,
        "score": min(max(score, 0.0), 1.0),
        "user_id": user_id,
        "job_category": job_category,
    }


async def detect_fraud_risk(user_id: str, job_id: Optional[str] = None) -> Dict[str, Any]:
    transactions = await get_wallet_transactions_db(user_id, limit=50)
    failed_count = len([t for t in transactions if t.get("status") == "failed"])
    amounts = [t.get("amount", 0) for t in transactions]
    risk_score = 0.0
    reasons = []

    if failed_count > 5:
        risk_score += 0.3
        reasons.append(f"{failed_count} failed transactions")
    if amounts and max(amounts) > 100000:
        risk_score += 0.2
        reasons.append("unusually large transaction detected")

    # Job-level check: unrealistic budget is a fraud signal
    if job_id:
        job = await get_job_details(job_id)
        if job and float(job.get("budget_max", 0)) > 500_000:
            risk_score += 0.2
            reasons.append("job budget exceeds platform norms")

    return {
        "success": True,
        "risk_score": min(risk_score, 1.0),
        "risk_level": "high" if risk_score >= 0.5 else "medium" if risk_score >= 0.2 else "low",
        "reasons": reasons,
        "user_id": user_id,
        "job_id": job_id,
    }


async def detect_fake_jobs(job_id: str) -> Dict[str, Any]:
    job = await get_job_details(job_id)
    if not job:
        return {"success": False, "error": "Job not found"}

    reasons = []
    if job.get("budget_max", 0) > 500000:
        reasons.append("unrealistic_budget")
    if not job.get("description") or len(job.get("description", "")) < 10:
        reasons.append("insufficient_description")
    if not job.get("required_skills"):
        reasons.append("no_skills_specified")

    return {"success": True, "is_fake": bool(reasons), "reasons": reasons, "job_id": job_id}


async def detect_inactive_users(days: int = 30) -> Dict[str, Any]:
    from datetime import datetime, timezone, timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # Pull all workers and filter by last activity in Python (no dedicated DB query needed)
    workers = await search_available_workers(limit=200)
    inactive = []
    for w in workers:
        last_active_str = w.get("last_active") or w.get("updated_at") or w.get("created_at")
        if not last_active_str:
            inactive.append({"user_id": w.get("id"), "name": w.get("name"), "last_active": None})
            continue
        try:
            if isinstance(last_active_str, str):
                last_active = datetime.fromisoformat(last_active_str.replace("Z", "+00:00"))
            else:
                last_active = last_active_str
            if last_active.tzinfo is None:
                last_active = last_active.replace(tzinfo=timezone.utc)
            if last_active < cutoff:
                inactive.append({"user_id": w.get("id"), "name": w.get("name"), "last_active": last_active_str})
        except (ValueError, TypeError):
            inactive.append({"user_id": w.get("id"), "name": w.get("name"), "last_active": last_active_str})

    return {"success": True, "inactive_users": inactive, "days_threshold": days, "count": len(inactive)}


async def detect_churn_risk(org_id: Optional[str] = None, limit: int = 10) -> Dict[str, Any]:
    workers = await search_available_workers(limit=limit * 3)
    at_risk = []
    for w in workers:
        risk_score = 0.0
        reasons = []

        rating = float(w.get("average_rating", 0))
        completed = int(w.get("completed_jobs", 0))

        if rating < 3.0 and rating > 0:
            risk_score += 0.3
            reasons.append("low rating")
        if completed == 0:
            risk_score += 0.3
            reasons.append("no completed jobs")
        elif completed < 3:
            risk_score += 0.1
            reasons.append("very few completed jobs")

        if risk_score >= 0.2:
            at_risk.append({
                "user_id": w.get("id"),
                "name": w.get("name"),
                "risk_score": round(min(risk_score, 1.0), 2),
                "reasons": reasons,
            })

    at_risk.sort(key=lambda x: x["risk_score"], reverse=True)
    return {"success": True, "at_risk": at_risk[:limit], "org_id": org_id, "limit": limit}


async def optimize_pricing(category: str = "", county: str = "", budget_type: str = "") -> Dict[str, Any]:
    base_price = 5000
    if county in {"Nairobi", "Mombasa"}:
        base_price *= 1.2
    if budget_type.lower() == "hourly":
        base_price *= 0.6
    elif budget_type.lower() == "daily":
        base_price *= 1.0
    if "urgent" in category.lower() or "urgent" in budget_type.lower():
        base_price *= 1.2

    return {"success": True, "suggested_price": int(base_price), "category": category, "county": county}


async def suggest_skills_to_learn(user_id: str) -> Dict[str, Any]:
    profile = await get_worker_full_profile(user_id)
    if not profile:
        return {"success": False, "error": "Worker profile not found"}
    current_skills = _normalize_skills(profile.get("skills", []))
    in_demand = [
        "Digital Marketing",
        "Data Analysis",
        "Mobile Development",
        "Cloud Computing",
        "Project Management",
        "UI/UX Design",
    ]
    suggestions = [skill for skill in in_demand if skill not in current_skills][:5]
    return {"success": True, "skills": suggestions}


async def suggest_job_improvements(job_id: str) -> Dict[str, Any]:
    job = await get_job_details(job_id)
    if not job:
        return {"success": False, "error": "Job not found"}

    improvements: List[str] = []
    if not job.get("description") or len(job.get("description", "")) < 20:
        improvements.append("Add a detailed description describing the role and deliverables.")
    if not job.get("required_skills"):
        improvements.append("List the required skills so the right workers can apply.")
    if job.get("budget_max", 0) <= 0:
        improvements.append("Set a competitive budget to attract quality candidates.")
    if not job.get("location"):
        improvements.append("Specify the work location or whether remote work is allowed.")
    return {"success": True, "improvements": improvements, "job_id": job_id}


async def analyze_user_behavior(user_id: str) -> Dict[str, Any]:
    profile = await get_user_context(user_id)
    history = await get_worker_history(user_id, limit=20)
    transactions = await get_wallet_transactions_db(user_id, limit=10)

    insights = {
        "total_jobs_completed": len([h for h in history if h.get("status") == "completed"]),
        "average_rating": float(profile.get("average_rating", 0)) if profile else 0,
        "transaction_frequency": len(transactions),
        "activity_level": "active" if len(history) > 5 else "moderate" if len(history) > 0 else "low",
    }
    return {"success": True, "insights": insights, "user_id": user_id}


async def get_match_score(worker_id: str, job_id: str) -> Dict[str, Any]:
    worker = await get_worker_full_profile(worker_id)
    job = await get_job_details(job_id)
    if not worker or not job:
        return {"success": False, "error": "Worker or job not found"}

    score = 0.5
    if worker.get("county") == job.get("location"):
        score += 0.2
    if any(skill in _normalize_skills(worker.get("skills", [])) for skill in _normalize_skills(job.get("required_skills", []))):
        score += 0.2
    if float(worker.get("average_rating", 0)) >= 4.5:
        score += 0.1
    return {"success": True, "score": min(score, 1.0), "worker_id": worker_id, "job_id": job_id}


__all__ = [
    "rank_workers_for_job",
    "recommend_workers",
    "recommend_jobs",
    "predict_job_success",
    "predict_worker_performance",
    "detect_fraud_risk",
    "detect_fake_jobs",
    "detect_inactive_users",
    "detect_churn_risk",
    "optimize_pricing",
    "suggest_skills_to_learn",
    "suggest_job_improvements",
    "analyze_user_behavior",
    "get_match_score",
]

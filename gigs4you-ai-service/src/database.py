"""
Async PostgreSQL client for Gigs4You AI Service.
Provides read-only query helpers for platform data.

Column naming: NestJS TypeORM uses camelCase column names in PostgreSQL.
All camelCase columns must be double-quoted in SQL (e.g., "isActive", "userId").
"""

import os
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    logger.warning("asyncpg not installed — database queries disabled")
    ASYNCPG_AVAILABLE = False

_pool: Optional[Any] = None


def _resolve_host(configured_host: str) -> str:
    """
    When running inside WSL2, 'localhost' resolves to the WSL loopback, not the
    Windows host where PostgreSQL and NestJS actually run.  We detect WSL by
    checking /proc/version, then read the Windows host IP from /etc/resolv.conf.
    If detection fails we leave the configured value unchanged.
    """
    if configured_host not in ("localhost", "127.0.0.1"):
        return configured_host  # explicitly set — trust it

    try:
        with open("/proc/version") as f:
            if "microsoft" not in f.read().lower():
                return configured_host  # not WSL
    except OSError:
        return configured_host  # not Linux / not WSL

    # We are in WSL — find the Windows host IP via the DNS nameserver entry
    try:
        with open("/etc/resolv.conf") as f:
            for line in f:
                if line.startswith("nameserver"):
                    windows_ip = line.split()[1].strip()
                    logger.info(
                        f"WSL detected: remapping DB_HOST from '{configured_host}' "
                        f"to Windows host '{windows_ip}'"
                    )
                    return windows_ip
    except OSError:
        pass

    return configured_host  # fallback — best effort


async def get_pool() -> Optional[Any]:
    """Get or create the asyncpg connection pool."""
    global _pool
    if not ASYNCPG_AVAILABLE:
        return None
    if _pool is not None:
        return _pool

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        host = _resolve_host(os.getenv("DB_HOST", "localhost"))
        port = os.getenv("DB_PORT", "5432")
        name = os.getenv("DB_NAME", "gigs4you")
        user = os.getenv("DB_USER", "admin")
        password = os.getenv("DB_PASSWORD", "")
        db_url = f"postgresql://{user}:{password}@{host}:{port}/{name}"

    pool_min  = int(os.getenv("DB_POOL_MIN",  "2"))
    pool_max  = int(os.getenv("DB_POOL_MAX",  "10"))
    cmd_timeout = float(os.getenv("DB_COMMAND_TIMEOUT", "30"))

    try:
        _pool = await asyncpg.create_pool(
            db_url,
            min_size=pool_min,
            max_size=pool_max,
            command_timeout=cmd_timeout,
            max_inactive_connection_lifetime=300,   # recycle idle connections after 5 min
            server_settings={
                "application_name":   "gigs4you-ai",
                "statement_timeout":  "30000",       # 30 s — mirrors command_timeout
            },
        )
        logger.info(
            "Database pool created (min=%d max=%d timeout=%.0fs)",
            pool_min, pool_max, cmd_timeout,
        )
    except Exception as e:
        logger.warning(f"Database connection failed (AI will work without live data): {e}")
        _pool = None
    return _pool


async def get_platform_stats() -> Dict[str, Any]:
    """Live platform counts: users, jobs, agents, tasks — single round-trip."""
    pool = await get_pool()
    if not pool:
        return {"total_users": 0, "open_jobs": 0, "active_agents": 0, "pending_tasks": 0}

    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    (SELECT COUNT(*) FROM users  WHERE "isActive" = true)                           AS total_users,
                    (SELECT COUNT(*) FROM jobs   WHERE status = 'open')                             AS open_jobs,
                    (SELECT COUNT(*) FROM agents WHERE "isConfirmed" = true)                        AS active_agents,
                    (SELECT COUNT(*) FROM tasks  WHERE status NOT IN ('completed','cancelled'))      AS pending_tasks
                """
            )
            return {
                "total_users":    int(row["total_users"]    or 0),
                "open_jobs":      int(row["open_jobs"]      or 0),
                "active_agents":  int(row["active_agents"]  or 0),
                "pending_tasks":  int(row["pending_tasks"]  or 0),
            }
    except Exception as e:
        logger.error(f"get_platform_stats error: {e}")
        return {"total_users": 0, "open_jobs": 0, "active_agents": 0, "pending_tasks": 0}


async def get_user_context(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch enriched user profile (role, skills, wallet, worker profile)."""
    pool = await get_pool()
    if not pool or not user_id:
        return None

    try:
        async with pool.acquire() as conn:
            user = await conn.fetchrow(
                """
                SELECT id, name, phone, email, role, county,
                       "companyName" AS company_name,
                       "organisationId" AS organisation_id
                FROM users
                WHERE id = $1 AND "isActive" = true
                """,
                user_id,
            )
            if not user:
                return None

            ctx: Dict[str, Any] = dict(user)

            # Worker profile + skills
            if ctx.get("role") in ("worker", "agent", "supervisor"):
                profile = await conn.fetchrow(
                    """
                    SELECT bio, county, location,
                           "averageRating" AS average_rating,
                           "completedJobs" AS completed_jobs,
                           "isAvailable" AS is_available,
                           "dailyRate" AS daily_rate,
                           "hourlyRate" AS hourly_rate
                    FROM worker_profiles
                    WHERE "userId" = $1
                    """,
                    user_id,
                )
                if profile:
                    ctx["worker_profile"] = dict(profile)

                # worker_skills junction: columns "workerProfilesId" and "skillsId"
                skills = await conn.fetch(
                    """
                    SELECT s.name
                    FROM skills s
                    WHERE s.id IN (
                        SELECT ws."skillsId"
                        FROM worker_skills ws
                        INNER JOIN worker_profiles wp ON ws."workerProfilesId" = wp.id
                        WHERE wp."userId" = $1
                        UNION
                        SELECT wps."skillId"
                        FROM worker_profile_skills wps
                        INNER JOIN worker_profiles wp ON wps."workerProfileId" = wp.id
                        WHERE wp."userId" = $1
                    )
                    """,
                    user_id,
                )
                ctx["skills"] = [r["name"] for r in skills]

            # Wallet balance (agents have wallets via agentId)
            try:
                wallet = await conn.fetchrow(
                    """
                    SELECT w.balance,
                           "pendingBalance" AS pending_balance,
                           "totalEarned" AS total_earned,
                           "totalWithdrawn" AS total_withdrawn
                    FROM wallets w
                    INNER JOIN agents a ON w."agentId" = a.id
                    WHERE a."userId" = $1
                    """,
                    user_id,
                )
                if wallet:
                    ctx["wallet"] = dict(wallet)
            except Exception:
                pass  # wallet table may not exist for all users

            return ctx
    except Exception as e:
        logger.error(f"get_user_context error: {e}")
        return None


async def search_open_jobs(
    query: Optional[str] = None,
    location: Optional[str] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """Search open jobs with optional keyword and location filters."""
    pool = await get_pool()
    if not pool:
        return []

    try:
        async with pool.acquire() as conn:
            conditions = ["j.status = 'open'"]
            params: List[Any] = []
            idx = 1

            if query:
                conditions.append(
                    f"(j.title ILIKE ${idx} OR j.description ILIKE ${idx} OR j.category ILIKE ${idx})"
                )
                params.append(f"%{query}%")
                idx += 1

            if location:
                conditions.append(
                    f'(j.county ILIKE ${idx} OR j.location ILIKE ${idx})'
                )
                params.append(f"%{location}%")
                idx += 1

            params.append(limit)
            sql = f"""
                SELECT j.id, j.title, j.description, j.category, j.location, j.county,
                       j."budgetMin" AS budget_min, j."budgetMax" AS budget_max,
                       j."budgetType" AS budget_type, j."isUrgent" AS is_urgent,
                       j."positionsAvailable" AS positions_available, j.deadline,
                       j."companyName" AS company_name,
                       u.name AS posted_by_name
                FROM jobs j
                LEFT JOIN users u ON j."postedById" = u.id::text
                WHERE {' AND '.join(conditions)}
                ORDER BY j."isUrgent" DESC, j."createdAt" DESC
                LIMIT ${idx}
            """
            rows = await conn.fetch(sql, *params)
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"search_open_jobs error: {e}")
        return []


async def search_available_workers(
    skills: Optional[str] = None,
    location: Optional[str] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """Search available workers by comma-separated skill keywords and/or county."""
    pool = await get_pool()
    if not pool:
        return []

    try:
        async with pool.acquire() as conn:
            conditions = ['wp."isAvailable" = true']
            params: List[Any] = []
            idx = 1

            if location:
                conditions.append(
                    f"(wp.county ILIKE ${idx} OR wp.location ILIKE ${idx})"
                )
                params.append(f"%{location}%")
                idx += 1

            params.append(limit * 3)  # over-fetch so we can filter by skill below
            rows = await conn.fetch(
                f"""
                SELECT wp.id AS profile_id, wp."userId" AS user_id, wp."agentId" AS agent_id,
                       u.name, wp.county, wp.location,
                       wp."averageRating" AS average_rating, wp."completedJobs" AS completed_jobs,
                       wp."dailyRate" AS daily_rate, wp."hourlyRate" AS hourly_rate, wp.bio
                FROM worker_profiles wp
                INNER JOIN users u ON wp."userId" = u.id::text
                WHERE {' AND '.join(conditions)}
                ORDER BY wp."averageRating" DESC
                LIMIT ${idx}
                """,
                *params,
            )

            skill_keywords = (
                [s.strip().lower() for s in skills.split(",") if s.strip()]
                if skills
                else []
            )

            result = []
            for w in rows:
                wd = _row_to_dict(w)
                if wd.get("profile_id"):
                    skill_rows = await conn.fetch(
                        """
                        SELECT s.name
                        FROM skills s
                        WHERE s.id IN (
                            SELECT ws."skillsId" FROM worker_skills ws WHERE ws."workerProfilesId" = $1
                            UNION
                            SELECT wps."skillId" FROM worker_profile_skills wps WHERE wps."workerProfileId" = $1
                        )
                        """,
                        wd["profile_id"],
                    )
                    wd["skills"] = [r["name"] for r in skill_rows]
                else:
                    wd["skills"] = []

                # Apply skill filter when requested
                if skill_keywords:
                    worker_skill_names = [s.lower() for s in wd["skills"]]
                    match = any(
                        any(kw in ws or ws in kw for ws in worker_skill_names)
                        for kw in skill_keywords
                    )
                    if not match:
                        continue

                wd["id"] = wd.get("agent_id") or wd.get("profile_id")
                result.append(wd)
                if len(result) >= limit:
                    break

            return result
    except Exception as e:
        logger.error(f"search_available_workers error: {e}")
        return []


async def get_job_details(job_id: str) -> Optional[Dict[str, Any]]:
    """Fetch full job details including required skills."""
    pool = await get_pool()
    if not pool or not job_id:
        return None

    try:
        async with pool.acquire() as conn:
            job = await conn.fetchrow(
                """
                SELECT j.id, j.title, j.description, j.category, j.location, j.county,
                       j."budgetMin" AS budget_min, j."budgetMax" AS budget_max,
                       j."budgetType" AS budget_type, j."isUrgent" AS is_urgent,
                       j."positionsAvailable" AS positions_available, j.deadline,
                       j."companyName" AS company_name, j.status,
                       u.name AS posted_by_name
                FROM jobs j
                LEFT JOIN users u ON j."postedById" = u.id::text
                WHERE j.id = $1
                """,
                job_id,
            )
            if not job:
                return None

            job_dict = _row_to_dict(job)

            # job_required_skills junction has columns "jobsId" and "skillsId"
            skills = await conn.fetch(
                """
                SELECT s.name FROM skills s
                INNER JOIN job_required_skills jrs ON s.id = jrs."skillsId"
                WHERE jrs."jobsId" = $1
                """,
                job_id,
            )
            job_dict["required_skills"] = [r["name"] for r in skills]
            return job_dict
    except Exception as e:
        logger.error(f"get_job_details error: {e}")
        return None


async def get_available_workers_for_job(job_id: str, limit: int = 30) -> List[Dict[str, Any]]:
    """Fetch available workers, ranked by location match with the job."""
    pool = await get_pool()
    if not pool:
        return []

    try:
        async with pool.acquire() as conn:
            job_row = await conn.fetchrow(
                "SELECT county FROM jobs WHERE id = $1", job_id
            )
            county = job_row["county"] if job_row else ""

            workers = await conn.fetch(
                """
                SELECT wp.id AS profile_id, wp."userId" AS user_id, wp."agentId" AS agent_id,
                       u.name, wp.county, wp.location,
                       wp."averageRating" AS average_rating, wp."completedJobs" AS completed_jobs,
                       wp."dailyRate" AS daily_rate, wp."hourlyRate" AS hourly_rate, wp.bio
                FROM worker_profiles wp
                INNER JOIN users u ON wp."userId" = u.id::text
                WHERE wp."isAvailable" = true
                ORDER BY
                    CASE WHEN wp.county = $1 THEN 0 ELSE 1 END,
                    wp."averageRating" DESC
                LIMIT $2
                """,
                county,
                limit,
            )

            result = []
            for w in workers:
                wd = _row_to_dict(w)
                if wd.get("profile_id"):
                    skill_rows = await conn.fetch(
                        """
                        SELECT s.name
                        FROM skills s
                        WHERE s.id IN (
                            SELECT ws."skillsId" FROM worker_skills ws WHERE ws."workerProfilesId" = $1
                            UNION
                            SELECT wps."skillId" FROM worker_profile_skills wps WHERE wps."workerProfileId" = $1
                        )
                        """,
                        wd["profile_id"],
                    )
                    wd["skills"] = [r["name"] for r in skill_rows]
                else:
                    wd["skills"] = []
                # Expose a unified 'id' field for matching
                wd["id"] = wd.get("agent_id") or wd.get("profile_id")
                result.append(wd)

            return result
    except Exception as e:
        logger.error(f"get_available_workers_for_job error: {e}")
        return []


async def get_real_analytics() -> Dict[str, Any]:
    """Pull aggregated analytics from the live database."""
    pool = await get_pool()
    if not pool:
        return {}

    try:
        async with pool.acquire() as conn:
            stats: Dict[str, Any] = {}

            role_rows = await conn.fetch(
                'SELECT role, COUNT(*) AS cnt FROM users WHERE "isActive" = true GROUP BY role'
            )
            stats["users_by_role"] = {r["role"]: int(r["cnt"]) for r in role_rows}

            status_rows = await conn.fetch(
                "SELECT status, COUNT(*) AS cnt FROM jobs GROUP BY status"
            )
            stats["jobs_by_status"] = {r["status"]: int(r["cnt"]) for r in status_rows}

            cat_rows = await conn.fetch(
                """
                SELECT category, COUNT(*) AS cnt FROM jobs
                WHERE status = 'open'
                GROUP BY category ORDER BY cnt DESC LIMIT 5
                """
            )
            stats["top_categories"] = [
                {"category": r["category"], "count": int(r["cnt"])} for r in cat_rows
            ]

            county_rows = await conn.fetch(
                """
                SELECT county, COUNT(*) AS cnt FROM jobs
                WHERE status = 'open' AND county IS NOT NULL
                GROUP BY county ORDER BY cnt DESC LIMIT 5
                """
            )
            stats["top_counties"] = [
                {"county": r["county"], "count": int(r["cnt"])} for r in county_rows
            ]

            new_users = await conn.fetchval(
                'SELECT COUNT(*) FROM users WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''
            )
            new_jobs = await conn.fetchval(
                'SELECT COUNT(*) FROM jobs WHERE "createdAt" >= NOW() - INTERVAL \'7 days\''
            )
            stats["last_7_days"] = {
                "new_users": int(new_users or 0),
                "new_jobs": int(new_jobs or 0),
            }

            avg_rating = await conn.fetchval(
                'SELECT ROUND(AVG("averageRating")::numeric, 2) FROM worker_profiles WHERE "completedJobs" > 0'
            )
            stats["platform_avg_worker_rating"] = float(avg_rating or 0)

            return stats
    except Exception as e:
        logger.error(f"get_real_analytics error: {e}")
        return {}


# ── Jobs (extended) ──────────────────────────────────────────────────────────

async def get_jobs(
    status: Optional[str] = None,
    employer_id: Optional[str] = None,
    location: Optional[str] = None,
    category: Optional[str] = None,
    urgent: Optional[bool] = None,
    min_budget: Optional[float] = None,
    skills: Optional[List[str]] = None,
    order_by: str = "createdAt",
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Flexible jobs query supporting any combination of filters."""
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            conds, params = [], []
            i = 1

            def add(cond: str, val: Any) -> None:
                nonlocal i
                conds.append(cond.replace("?", f"${i}"))
                params.append(val)
                i += 1

            if status:
                add("j.status = ?", status)
            if employer_id:
                add('j."postedById" = ?', employer_id)
            if location:
                params.append(f"%{location}%")
                conds.append(f'(j.county ILIKE ${i} OR j.location ILIKE ${i})')
                i += 1
            if category:
                add("j.category = ?", category)
            if urgent is True:
                conds.append('j."isUrgent" = true')
            if min_budget is not None:
                add('j."budgetMax" >= ?', min_budget)

            where = ("WHERE " + " AND ".join(conds)) if conds else ""
            safe_order = {
                "createdAt": '"createdAt"',
                "created_at": '"createdAt"',
                "budgetMax": '"budgetMax"',
                "budget_max": '"budgetMax"',
                "deadline": 'deadline',
            }.get(order_by, '"createdAt"')
            params.append(limit)

            rows = await conn.fetch(
                f"""
                SELECT j.id, j.title, j.category, j.location, j.county, j.status,
                       j."budgetMin" AS budget_min, j."budgetMax" AS budget_max,
                       j."budgetType" AS budget_type, j."isUrgent" AS is_urgent,
                       j.deadline, j."companyName" AS company_name,
                       j."applicantCount" AS applicant_count,
                       j."positionsAvailable" AS positions_available, j."createdAt" AS created_at,
                       u.name AS posted_by_name
                FROM jobs j
                LEFT JOIN users u ON j."postedById" = u.id::text
                {where}
                ORDER BY j.{safe_order} DESC
                LIMIT ${i}
                """,
                *params,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_jobs error: {e}")
        return []


async def get_job_statistics() -> Dict[str, Any]:
    """Aggregate counts/averages across the jobs table."""
    pool = await get_pool()
    if not pool:
        return {}
    try:
        async with pool.acquire() as conn:
            by_status = await conn.fetch("SELECT status, COUNT(*) cnt FROM jobs GROUP BY status")
            by_cat = await conn.fetch(
                "SELECT category, COUNT(*) cnt FROM jobs WHERE status='open' GROUP BY category ORDER BY cnt DESC LIMIT 8"
            )
            avg_budget = await conn.fetchval(
                'SELECT ROUND(AVG("budgetMax")::numeric,2) FROM jobs WHERE status=\'open\' AND "budgetMax" > 0'
            )
            urgent_count = await conn.fetchval(
                "SELECT COUNT(*) FROM jobs WHERE \"isUrgent\"=true AND status='open'"
            )
            return {
                "by_status": {r["status"]: int(r["cnt"]) for r in by_status},
                "top_categories": [{"category": r["category"], "count": int(r["cnt"])} for r in by_cat],
                "avg_open_budget_kes": float(avg_budget or 0),
                "urgent_open_jobs": int(urgent_count or 0),
            }
    except Exception as e:
        logger.error(f"get_job_statistics error: {e}")
        return {}


# ── Workers (extended) ───────────────────────────────────────────────────────

async def get_worker_full_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """Full worker profile including skills, education, certifications."""
    pool = await get_pool()
    if not pool:
        return None
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT u.id, u.name, u.phone, u.email, u.county,
                       wp.bio, wp.location, wp.county AS wp_county,
                       wp."averageRating" AS average_rating,
                       wp."completedJobs" AS completed_jobs,
                       wp."dailyRate" AS daily_rate, wp."hourlyRate" AS hourly_rate,
                       wp."isAvailable" AS is_available,
                       wp."workExperience" AS work_experience,
                       wp.education, wp.certifications, wp.languages,
                       wp."linkedinUrl" AS linkedin_url
                FROM users u
                INNER JOIN worker_profiles wp ON wp."userId" = u.id::text
                WHERE u.id = $1
                """,
                user_id,
            )
            if not row:
                return None
            d = _row_to_dict(row)
            skills = await conn.fetch(
                """
                SELECT s.name, s.category
                FROM skills s
                WHERE s.id IN (
                    SELECT ws."skillsId"
                    FROM worker_skills ws
                    INNER JOIN worker_profiles wp ON ws."workerProfilesId" = wp.id
                    WHERE wp."userId" = $1
                    UNION
                    SELECT wps."skillId"
                    FROM worker_profile_skills wps
                    INNER JOIN worker_profiles wp ON wps."workerProfileId" = wp.id
                    WHERE wp."userId" = $1
                )
                """,
                user_id,
            )
            d["skills"] = [{"name": r["name"], "category": r["category"]} for r in skills]
            return d
    except Exception as e:
        logger.error(f"get_worker_full_profile error: {e}")
        return None


async def get_top_workers(limit: int = 10) -> List[Dict[str, Any]]:
    """Workers ranked by rating × completed jobs."""
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT u.name, u.county,
                       wp."averageRating" AS average_rating,
                       wp."completedJobs" AS completed_jobs,
                       wp."dailyRate" AS daily_rate,
                       wp."isAvailable" AS is_available,
                       wp."userId" AS user_id
                FROM worker_profiles wp
                INNER JOIN users u ON wp."userId" = u.id::text
                WHERE wp."completedJobs" > 0
                ORDER BY (wp."averageRating" * wp."completedJobs") DESC
                LIMIT $1
                """,
                limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_top_workers error: {e}")
        return []


async def get_worker_history(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Past job applications for a worker (matched via applicantId)."""
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT ja.id, ja.status, ja."appliedAt" AS applied_at,
                       j.title, j.category, j.county,
                       j."budgetMin" AS budget_min, j."budgetMax" AS budget_max
                FROM job_applications ja
                INNER JOIN jobs j ON ja."jobId" = j.id
                WHERE ja."applicantId" = $1
                ORDER BY ja."appliedAt" DESC
                LIMIT $2
                """,
                user_id,
                limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_worker_history error: {e}")
        return []


# ── Agents (extended) ────────────────────────────────────────────────────────

async def get_agents(
    org_id: Optional[str] = None,
    status: Optional[str] = None,
    name: Optional[str] = None,
    confirmed_only: bool = True,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """List agents, optionally filtered by org, status, or name search."""
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            conds = []
            params: List[Any] = []
            i = 1

            if confirmed_only:
                conds.append('"a"."isConfirmed" = true')
            if org_id:
                conds.append(f'a."organisationId" = ${i}')
                params.append(org_id)
                i += 1
            if status:
                conds.append(f"a.status = ${i}")
                params.append(status)
                i += 1
            if name:
                conds.append(f'u.name ILIKE ${i}')
                params.append(f'%{name}%')
                i += 1

            where = ("WHERE " + " AND ".join(conds)) if conds else ""
            params.append(limit)

            rows = await conn.fetch(
                f"""
                SELECT a.id, a.status, a.level, a."totalXp" AS total_xp,
                       a."currentStreak" AS current_streak,
                       a."averageRating" AS average_rating,
                       a."completedJobs" AS completed_jobs,
                       a."isAvailable" AS is_available,
                       a."lastSeenAt" AS last_seen_at,
                       u.name, u.phone, u.county
                FROM agents a
                INNER JOIN users u ON a."userId" = u.id
                {where}
                ORDER BY a."averageRating" DESC
                LIMIT ${i}
                """,
                *params,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_agents error: {e}")
        return []


async def get_agent_tasks(
    agent_id: str,
    status: Optional[str] = None,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Tasks assigned to a specific agent."""
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            if status:
                rows = await conn.fetch(
                    'SELECT id, title, status, priority, "locationName" AS location_name, '
                    '"dueAt" AS due_at, "xpReward" AS xp_reward '
                    'FROM tasks WHERE "agentId"=$1 AND status=$2 ORDER BY "dueAt" ASC LIMIT $3',
                    agent_id, status, limit,
                )
            else:
                rows = await conn.fetch(
                    'SELECT id, title, status, priority, "locationName" AS location_name, '
                    '"dueAt" AS due_at, "xpReward" AS xp_reward '
                    'FROM tasks WHERE "agentId"=$1 ORDER BY "dueAt" ASC LIMIT $2',
                    agent_id, limit,
                )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_agent_tasks error: {e}")
        return []


async def get_agent_last_location(agent_id: str) -> Optional[Dict[str, Any]]:
    """Most recent GPS log for an agent."""
    pool = await get_pool()
    if not pool:
        return None
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                'SELECT latitude, longitude, speed, accuracy, "createdAt" AS timestamp '
                'FROM gps_logs WHERE "agentId"=$1 ORDER BY "createdAt" DESC LIMIT 1',
                agent_id,
            )
            return _row_to_dict(row) if row else None
    except Exception as e:
        logger.error(f"get_agent_last_location error: {e}")
        return None


# ── Tasks (extended) ─────────────────────────────────────────────────────────

async def get_tasks(
    agent_id: Optional[str] = None,
    org_id: Optional[str] = None,
    status: Optional[str] = None,
    overdue: bool = False,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Fetch tasks with flexible filters."""
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            conds, params = [], []
            i = 1

            if agent_id:
                conds.append(f't."agentId" = ${i}'); params.append(agent_id); i += 1
            if org_id:
                conds.append(f't."organisationId" = ${i}'); params.append(org_id); i += 1
            if status:
                conds.append(f"t.status = ${i}"); params.append(status); i += 1
            if overdue:
                conds.append("t.\"dueAt\" < NOW() AND t.status NOT IN ('completed','cancelled')")

            where = ("WHERE " + " AND ".join(conds)) if conds else ""
            params.append(limit)
            rows = await conn.fetch(
                f"""
                SELECT t.id, t.title, t.status, t.priority,
                       t."locationName" AS location_name,
                       t."dueAt" AS due_at, t."completedAt" AS completed_at,
                       t."xpReward" AS xp_reward, t."agentId" AS agent_id,
                       u.name AS agent_name
                FROM tasks t
                LEFT JOIN agents a ON t."agentId" = a.id
                LEFT JOIN users u ON a."userId" = u.id
                {where}
                ORDER BY t."dueAt" ASC
                LIMIT ${i}
                """,
                *params,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_tasks error: {e}")
        return []


async def get_task_details(task_id: str) -> Optional[Dict[str, Any]]:
    """Full task record."""
    pool = await get_pool()
    if not pool:
        return None
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT t.*, u.name AS agent_name
                FROM tasks t
                LEFT JOIN agents a ON t."agentId" = a.id
                LEFT JOIN users u ON a."userId" = u.id
                WHERE t.id = $1
                """,
                task_id,
            )
            return _row_to_dict(row) if row else None
    except Exception as e:
        logger.error(f"get_task_details error: {e}")
        return None


# ── Applications ─────────────────────────────────────────────────────────────

async def get_applications(
    job_id: Optional[str] = None,
    applicant_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Job applications with optional filters."""
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            conds, params = [], []
            i = 1

            if job_id:
                conds.append(f'ja."jobId" = ${i}'); params.append(job_id); i += 1
            if applicant_id:
                conds.append(f'ja."applicantId" = ${i}'); params.append(applicant_id); i += 1
            if status:
                conds.append(f"ja.status = ${i}"); params.append(status); i += 1

            where = ("WHERE " + " AND ".join(conds)) if conds else ""
            params.append(limit)
            rows = await conn.fetch(
                f"""
                SELECT ja.id, ja."jobId" AS job_id, ja."applicantId" AS applicant_id,
                       ja.status, ja."appliedAt" AS applied_at,
                       j.title AS job_title, j.category,
                       COALESCE(applicant_user.name, agent_user.name) AS applicant_name
                FROM job_applications ja
                INNER JOIN jobs j ON ja."jobId" = j.id
                LEFT JOIN users applicant_user ON ja."applicantId" = applicant_user.id::text
                LEFT JOIN agents a ON ja."applicantId" = a.id::text
                LEFT JOIN users agent_user ON a."userId" = agent_user.id
                {where}
                ORDER BY ja."appliedAt" DESC
                LIMIT ${i}
                """,
                *params,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_applications error: {e}")
        return []


# ── Wallet ────────────────────────────────────────────────────────────────────

async def get_wallet_info(user_id: str) -> Optional[Dict[str, Any]]:
    """Wallet record for a user (via agents join)."""
    pool = await get_pool()
    if not pool:
        return None
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT w.balance,
                       w."pendingBalance" AS pending_balance,
                       w."totalEarned" AS total_earned,
                       w."totalWithdrawn" AS total_withdrawn,
                       w.currency, w."mpesaPhone" AS mpesa_phone
                FROM wallets w
                INNER JOIN agents a ON w."agentId" = a.id::text
                WHERE a."userId" = $1
                """,
                user_id,
            )
            return _row_to_dict(row) if row else None
    except Exception as e:
        logger.error(f"get_wallet_info error: {e}")
        return None


async def get_wallet_transactions_db(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Recent wallet transactions for a user."""
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT wt.id, wt.type, wt.amount, wt.description,
                       wt.status, wt.reference, wt."createdAt" AS created_at
                FROM wallet_transactions wt
                INNER JOIN wallets w ON wt."walletId" = w.id
                INNER JOIN agents a ON w."agentId" = a.id::text
                WHERE a."userId" = $1
                ORDER BY wt."createdAt" DESC
                LIMIT $2
                """,
                user_id,
                limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_wallet_transactions_db error: {e}")
        return []


# ── Org Wallet ────────────────────────────────────────────────────────────────

async def get_org_wallet_info(org_id: str) -> Optional[Dict[str, Any]]:
    """Organisation wallet: balance, pending, totals."""
    pool = await get_pool()
    if not pool or not org_id:
        return None
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT balance, "pendingBalance" AS pending_balance,
                       "totalDeposited" AS total_deposited,
                       "totalDisbursed" AS total_disbursed,
                       currency
                FROM org_wallets
                WHERE "organisationId" = $1
                """,
                org_id,
            )
            return _row_to_dict(row) if row else {"balance": 0, "pending_balance": 0,
                                                   "total_deposited": 0, "total_disbursed": 0,
                                                   "currency": "KES"}
    except Exception as e:
        logger.error(f"get_org_wallet_info error: {e}")
        return None


async def get_org_wallet_transactions_db(org_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Recent org wallet transactions (deposits, disbursements, refunds)."""
    pool = await get_pool()
    if not pool or not org_id:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT t.id, t.type, t.amount, t.description,
                       t.reference, t."mpesaRef" AS mpesa_ref,
                       t."agentId" AS agent_id, t.status,
                       t."createdAt" AS created_at
                FROM org_wallet_transactions t
                INNER JOIN org_wallets w ON t."orgWalletId" = w.id
                WHERE w."organisationId" = $1
                ORDER BY t."createdAt" DESC
                LIMIT $2
                """,
                org_id,
                limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_org_wallet_transactions_db error: {e}")
        return []


# ── Chat Groups ───────────────────────────────────────────────────────────────

async def get_chat_groups_db(org_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """List chat groups for an organisation."""
    pool = await get_pool()
    if not pool or not org_id:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT g.id, g.name, g.description,
                       g."createdBy" AS created_by,
                       g."createdAt" AS created_at,
                       u.name AS created_by_name,
                       COUNT(m.id) AS member_count
                FROM chat_groups g
                LEFT JOIN users u ON g."createdBy" = u.id::text
                LEFT JOIN chat_group_members m ON m."groupId" = g.id
                WHERE g."organisationId" = $1
                GROUP BY g.id, g.name, g.description, g."createdBy", g."createdAt", u.name
                ORDER BY g."createdAt" DESC
                LIMIT $2
                """,
                org_id,
                limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_chat_groups_db error: {e}")
        return []


async def get_group_messages_db(group_id: str, limit: int = 30) -> List[Dict[str, Any]]:
    """Recent messages in a chat group."""
    pool = await get_pool()
    if not pool or not group_id:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT msg.id, msg.body, msg."messageType" AS message_type,
                       msg."attachmentUrl" AS attachment_url,
                       msg."senderId" AS sender_id,
                       msg."createdAt" AS created_at,
                       u.name AS sender_name
                FROM chat_group_messages msg
                LEFT JOIN users u ON msg."senderId" = u.id::text
                WHERE msg."groupId" = $1
                ORDER BY msg."createdAt" DESC
                LIMIT $2
                """,
                group_id,
                limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_group_messages_db error: {e}")
        return []


# ── Analytics (extended) ─────────────────────────────────────────────────────

async def get_growth_metrics(days: int = 30) -> Dict[str, Any]:
    """New user/job/task registrations over recent periods."""
    pool = await get_pool()
    if not pool:
        return {}
    try:
        async with pool.acquire() as conn:
            new_users = await conn.fetchval(
                "SELECT COUNT(*) FROM users WHERE \"createdAt\" >= NOW() - ($1 || ' days')::interval",
                str(days),
            )
            new_jobs = await conn.fetchval(
                "SELECT COUNT(*) FROM jobs WHERE \"createdAt\" >= NOW() - ($1 || ' days')::interval",
                str(days),
            )
            completed_jobs = await conn.fetchval(
                "SELECT COUNT(*) FROM jobs WHERE status='completed' AND \"updatedAt\" >= NOW() - ($1 || ' days')::interval",
                str(days),
            )
            return {
                "period_days": days,
                "new_users": int(new_users or 0),
                "new_jobs_posted": int(new_jobs or 0),
                "jobs_completed": int(completed_jobs or 0),
            }
    except Exception as e:
        logger.error(f"get_growth_metrics error: {e}")
        return {}


async def get_location_analytics() -> Dict[str, Any]:
    """Job and worker density by Kenyan county."""
    pool = await get_pool()
    if not pool:
        return {}
    try:
        async with pool.acquire() as conn:
            job_counties = await conn.fetch(
                "SELECT county, COUNT(*) cnt FROM jobs WHERE status='open' AND county IS NOT NULL GROUP BY county ORDER BY cnt DESC LIMIT 10"
            )
            worker_counties = await conn.fetch(
                "SELECT county, COUNT(*) cnt FROM worker_profiles WHERE county IS NOT NULL GROUP BY county ORDER BY cnt DESC LIMIT 10"
            )
            return {
                "job_demand": [{"county": r["county"], "open_jobs": int(r["cnt"])} for r in job_counties],
                "worker_supply": [{"county": r["county"], "workers": int(r["cnt"])} for r in worker_counties],
            }
    except Exception as e:
        logger.error(f"get_location_analytics error: {e}")
        return {}


async def get_conversion_analytics() -> Dict[str, Any]:
    """Application-to-hire and other conversion funnel metrics."""
    pool = await get_pool()
    if not pool:
        return {}
    try:
        async with pool.acquire() as conn:
            total_apps = await conn.fetchval("SELECT COUNT(*) FROM job_applications")
            accepted = await conn.fetchval("SELECT COUNT(*) FROM job_applications WHERE status='accepted'")
            rejected = await conn.fetchval("SELECT COUNT(*) FROM job_applications WHERE status='rejected'")
            pending = await conn.fetchval("SELECT COUNT(*) FROM job_applications WHERE status='pending'")
            total_jobs = await conn.fetchval("SELECT COUNT(*) FROM jobs")
            filled = await conn.fetchval("SELECT COUNT(*) FROM jobs WHERE status NOT IN ('open','expired','cancelled')")
            rate = round(int(accepted or 0) / max(int(total_apps or 1), 1) * 100, 1)
            fill_rate = round(int(filled or 0) / max(int(total_jobs or 1), 1) * 100, 1)
            return {
                "total_applications": int(total_apps or 0),
                "accepted": int(accepted or 0),
                "rejected": int(rejected or 0),
                "pending": int(pending or 0),
                "acceptance_rate_pct": rate,
                "job_fill_rate_pct": fill_rate,
            }
    except Exception as e:
        logger.error(f"get_conversion_analytics error: {e}")
        return {}


# ── Organisations ─────────────────────────────────────────────────────────────

async def get_organisation(org_id: str) -> Optional[Dict[str, Any]]:
    """Full organisation record."""
    pool = await get_pool()
    if not pool:
        return None
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, name, industry, county, description, address,
                       "billingEmail" AS billing_email,
                       "billingPhone" AS billing_phone,
                       "isActive" AS is_active, "createdAt" AS created_at
                FROM organisations WHERE id = $1
                """,
                org_id,
            )
            return _row_to_dict(row) if row else None
    except Exception as e:
        logger.error(f"get_organisation error: {e}")
        return None


async def get_org_stats(org_id: str) -> Dict[str, Any]:
    """Agent count, task completion, and performance for an organisation."""
    pool = await get_pool()
    if not pool:
        return {}
    try:
        async with pool.acquire() as conn:
            agent_count = await conn.fetchval(
                'SELECT COUNT(*) FROM agents WHERE "organisationId"=$1 AND "isConfirmed"=true', org_id
            )
            total_tasks = await conn.fetchval(
                'SELECT COUNT(*) FROM tasks WHERE "organisationId"=$1', org_id
            )
            done_tasks = await conn.fetchval(
                "SELECT COUNT(*) FROM tasks WHERE \"organisationId\"=$1 AND status='completed'", org_id
            )
            avg_rating = await conn.fetchval(
                'SELECT ROUND(AVG(a."averageRating")::numeric,2) FROM agents a WHERE a."organisationId"=$1', org_id
            )
            return {
                "confirmed_agents": int(agent_count or 0),
                "total_tasks": int(total_tasks or 0),
                "completed_tasks": int(done_tasks or 0),
                "completion_rate_pct": round(int(done_tasks or 0) / max(int(total_tasks or 1), 1) * 100, 1),
                "avg_agent_rating": float(avg_rating or 0),
            }
    except Exception as e:
        logger.error(f"get_org_stats error: {e}")
        return {}


# ── Notifications ─────────────────────────────────────────────────────────────

async def get_user_notifications_db(user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Notifications for a user, newest first."""
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                'SELECT id, title, body, type, "isRead" AS is_read, '
                '"isImportant" AS is_important, '
                '"actionType" AS action_type, "actionId" AS action_id, '
                '"createdAt" AS created_at '
                'FROM notifications WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT $2',
                user_id, limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_user_notifications_db error: {e}")
        return []


async def get_org_alerts_db(org_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """Unread important notifications for all users in an organisation — items that need attention."""
    pool = await get_pool()
    if not pool or not org_id:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT n.id, n.title, n.body, n.type,
                       n."isRead" AS is_read, n."isImportant" AS is_important,
                       n."actionType" AS action_type, n."actionId" AS action_id,
                       n."createdAt" AS created_at,
                       u.name AS user_name, u.role AS user_role
                FROM notifications n
                INNER JOIN users u ON n."userId" = u.id
                WHERE u."organisationId" = $1
                  AND n."isRead" = false
                  AND n."isImportant" = true
                ORDER BY n."createdAt" DESC
                LIMIT $2
                """,
                org_id,
                limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_org_alerts_db error: {e}")
        return []


async def get_system_notifications_db(
    org_id: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """
    System-type notifications (AI insights, billing alerts, verification, churn detections).
    Pass org_id for org-wide view (admin/manager) or user_id for individual view.
    """
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            if user_id and not org_id:
                rows = await conn.fetch(
                    """
                    SELECT n.id, n.title, n.body,
                           n."isRead" AS is_read, n."isImportant" AS is_important,
                           n."actionType" AS action_type, n."actionId" AS action_id,
                           n."createdAt" AS created_at, n."userId" AS user_id
                    FROM notifications n
                    WHERE n."userId" = $1 AND n.type = 'system'
                    ORDER BY n."createdAt" DESC
                    LIMIT $2
                    """,
                    user_id, limit,
                )
            elif org_id:
                rows = await conn.fetch(
                    """
                    SELECT n.id, n.title, n.body,
                           n."isRead" AS is_read, n."isImportant" AS is_important,
                           n."actionType" AS action_type, n."actionId" AS action_id,
                           n."createdAt" AS created_at, n."userId" AS user_id,
                           u.name AS user_name, u.role AS user_role
                    FROM notifications n
                    INNER JOIN users u ON n."userId" = u.id
                    WHERE u."organisationId" = $1 AND n.type = 'system'
                    ORDER BY n."createdAt" DESC
                    LIMIT $2
                    """,
                    org_id, limit,
                )
            else:
                return []
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_system_notifications_db error: {e}")
        return []


# ── Audit Logs ────────────────────────────────────────────────────────────────

async def get_audit_logs_db(
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Audit log entries (table may not exist in all deployments)."""
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            conds, params = [], []
            i = 1
            if user_id:
                conds.append(f'"userId" = ${i}'); params.append(user_id); i += 1
            if org_id:
                conds.append(f'"orgId" = ${i}'); params.append(org_id); i += 1

            where = ("WHERE " + " AND ".join(conds)) if conds else ""
            params.append(limit)
            rows = await conn.fetch(
                f'SELECT * FROM audit_logs {where} ORDER BY "createdAt" DESC LIMIT ${i}',
                *params,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_audit_logs_db error: {e}")
        return []


# ── Subscriptions ─────────────────────────────────────────────────────────────

async def get_subscription_info(org_id: str) -> Optional[Dict[str, Any]]:
    """Active subscription plan for an organisation."""
    pool = await get_pool()
    if not pool or not org_id:
        return None
    try:
        async with pool.acquire() as conn:
            # Try with monthlyCuuLimit first; fall back gracefully if migration hasn't run yet
            try:
                row = await conn.fetchrow(
                    """
                    SELECT s.id, s.plan, s.status,
                           s."currentPeriodStart" AS period_start,
                           s."currentPeriodEnd"   AS period_end,
                           s."trialEndsAt"        AS trial_ends_at,
                           s."monthlyCuuLimit"    AS monthly_cuu_limit
                    FROM subscriptions s
                    WHERE s."organisationId" = $1
                      AND s.status IN ('active', 'trial')
                    ORDER BY s."currentPeriodEnd" DESC
                    LIMIT 1
                    """,
                    org_id,
                )
            except Exception:
                # monthlyCuuLimit column not yet created (migration pending) — query without it
                row = await conn.fetchrow(
                    """
                    SELECT s.id, s.plan, s.status,
                           s."currentPeriodStart" AS period_start,
                           s."currentPeriodEnd"   AS period_end,
                           s."trialEndsAt"        AS trial_ends_at
                    FROM subscriptions s
                    WHERE s."organisationId" = $1
                      AND s.status IN ('active', 'trial')
                    ORDER BY s."currentPeriodEnd" DESC
                    LIMIT 1
                    """,
                    org_id,
                )
            if not row:
                return {"plan": "FREE", "status": "active", "monthly_cuu_limit": None}
            result = _row_to_dict(row)
            result.setdefault("monthly_cuu_limit", None)
            return result
    except Exception as e:
        logger.error(f"get_subscription_info error: {e}")
        return None


# ── Verification ──────────────────────────────────────────────────────────────

async def get_verification_status(user_id: str) -> Optional[Dict[str, Any]]:
    """KYC verification status for a user."""
    pool = await get_pool()
    if not pool or not user_id:
        return None
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, status,
                       "documentType"   AS document_type,
                       "faceMatchScore" AS face_match_score,
                       "reviewNote"     AS review_note,
                       "reviewedAt"     AS reviewed_at,
                       "submittedAt"    AS submitted_at,
                       "idNumber"       AS id_number
                FROM verifications
                WHERE "userId" = $1
                ORDER BY "submittedAt" DESC
                LIMIT 1
                """,
                user_id,
            )
            return _row_to_dict(row) if row else {"status": "not_submitted"}
    except Exception as e:
        logger.error(f"get_verification_status error: {e}")
        return None


# ── Disputes ──────────────────────────────────────────────────────────────────

async def get_disputes_db(
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Disputes raised by or against a user / within an org."""
    pool = await get_pool()
    if not pool:
        return []
    try:
        async with pool.acquire() as conn:
            conds, params = [], []
            i = 1

            if user_id:
                conds.append(f'(d."raisedById" = ${i} OR d."againstUserId" = ${i})')
                params.append(user_id); i += 1
            if org_id:
                conds.append(f'd."organisationId" = ${i}')
                params.append(org_id); i += 1
            if status:
                conds.append(f"d.status = ${i}")
                params.append(status); i += 1

            where = ("WHERE " + " AND ".join(conds)) if conds else ""
            params.append(limit)
            rows = await conn.fetch(
                f"""
                SELECT d.id, d.type, d.status, d.resolution,
                       d.description, d."amountKes" AS amount_kes,
                       d."refundAmountKes" AS refund_amount_kes,
                       d."resolutionNote" AS resolution_note,
                       d."responseDeadline" AS response_deadline,
                       d."isEscalated" AS is_escalated,
                       d."createdAt" AS created_at, d."resolvedAt" AS resolved_at,
                       raiser.name AS raised_by_name,
                       against.name AS against_user_name
                FROM disputes d
                LEFT JOIN users raiser ON d."raisedById" = raiser.id::text
                LEFT JOIN users against ON d."againstUserId" = against.id::text
                {where}
                ORDER BY d."createdAt" DESC
                LIMIT ${i}
                """,
                *params,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_disputes_db error: {e}")
        return []


async def get_dispute_stats_db() -> Dict[str, Any]:
    """Platform-wide dispute statistics."""
    pool = await get_pool()
    if not pool:
        return {}
    try:
        async with pool.acquire() as conn:
            by_status = await conn.fetch(
                "SELECT status, COUNT(*) cnt FROM disputes GROUP BY status"
            )
            by_type = await conn.fetch(
                "SELECT type, COUNT(*) cnt FROM disputes GROUP BY type ORDER BY cnt DESC"
            )
            overdue = await conn.fetchval(
                'SELECT COUNT(*) FROM disputes WHERE "responseDeadline" < NOW() AND status NOT IN (\'resolved\',\'closed\')'
            )
            avg_resolution_hours = await conn.fetchval(
                """
                SELECT ROUND(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt"))/3600)::numeric, 1)
                FROM disputes WHERE "resolvedAt" IS NOT NULL
                """
            )
            return {
                "by_status": {r["status"]: int(r["cnt"]) for r in by_status},
                "by_type":   {r["type"]: int(r["cnt"]) for r in by_type},
                "overdue_count": int(overdue or 0),
                "avg_resolution_hours": float(avg_resolution_hours or 0),
            }
    except Exception as e:
        logger.error(f"get_dispute_stats_db error: {e}")
        return {}


# ── Trend Comparison ──────────────────────────────────────────────────────────

async def get_trend_comparison(metric: str, days: int = 7) -> Dict[str, Any]:
    """
    Week-over-week comparison for a given metric.
    metric: 'users' | 'jobs' | 'applications' | 'tasks' | 'disputes'
    Returns current_period count, previous_period count, and change_pct.
    """
    pool = await get_pool()
    if not pool:
        return {}

    table_map = {
        "users":        ("users",            '"createdAt"'),
        "jobs":         ("jobs",             '"createdAt"'),
        "applications": ("job_applications", '"appliedAt"'),
        "tasks":        ("tasks",            '"createdAt"'),
        "disputes":     ("disputes",         '"createdAt"'),
    }
    if metric not in table_map:
        return {"error": f"Unknown metric '{metric}'. Choose from: {', '.join(table_map)}"}

    table, col = table_map[metric]
    try:
        async with pool.acquire() as conn:
            current = await conn.fetchval(
                f'SELECT COUNT(*) FROM {table} WHERE {col} >= NOW() - ($1 || \' days\')::interval',
                str(days),
            )
            previous = await conn.fetchval(
                f'SELECT COUNT(*) FROM {table} WHERE {col} >= NOW() - ($1 || \' days\')::interval '
                f'AND {col} < NOW() - ($2 || \' days\')::interval',
                str(days * 2), str(days),
            )
            cur = int(current or 0)
            prev = int(previous or 0)
            change_pct = round((cur - prev) / max(prev, 1) * 100, 1) if prev else None
            direction = "up" if cur > prev else ("down" if cur < prev else "flat")
            return {
                "metric": metric,
                "period_days": days,
                "current_period": cur,
                "previous_period": prev,
                "change_pct": change_pct,
                "direction": direction,
            }
    except Exception as e:
        logger.error(f"get_trend_comparison error: {e}")
        return {}


# ── Billing ───────────────────────────────────────────────────────────────────

async def get_billing_history(org_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Recent billing invoices for an organisation."""
    pool = await get_pool()
    if not pool or not org_id:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, amount, currency, status, description,
                       "paidAt" AS paid_at, "createdAt" AS created_at
                FROM billing_invoices
                WHERE "organisationId" = $1
                ORDER BY "createdAt" DESC
                LIMIT $2
                """,
                org_id,
                limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as e:
        logger.error(f"get_billing_history error: {e}")
        return []


# ── Cathy Usage Units (CUU) ───────────────────────────────────────────────────

_CUU_TABLES_CREATED = False

_CREATE_CUU_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS cathy_usage_logs (
    id            BIGSERIAL PRIMARY KEY,
    "orgId"       TEXT        NOT NULL,
    "userId"      TEXT,
    operation     TEXT        NOT NULL,
    "cuuCost"     INTEGER     NOT NULL DEFAULT 0,
    "elapsedMs"   INTEGER     NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cathy_logs_org_created
    ON cathy_usage_logs ("orgId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS cathy_usage_summary (
    "orgId"            TEXT        NOT NULL,
    "periodStart"      DATE        NOT NULL,
    "totalCuu"         BIGINT      NOT NULL DEFAULT 0,
    "callCount"        INTEGER     NOT NULL DEFAULT 0,
    "lastUpdatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY ("orgId", "periodStart")
);
"""


async def _ensure_cuu_tables() -> None:
    """Create CUU tables if they don't exist yet (idempotent, runs once per process)."""
    global _CUU_TABLES_CREATED
    if _CUU_TABLES_CREATED:
        return
    pool = await get_pool()
    if not pool:
        return
    try:
        async with pool.acquire() as conn:
            await conn.execute(_CREATE_CUU_TABLES_SQL)
        _CUU_TABLES_CREATED = True
        logger.info("CUU tables verified/created")
    except Exception as exc:
        logger.warning(f"CUU table creation skipped: {exc}")


async def get_org_cuu_usage(org_id: str) -> int:
    """
    Return total CUU consumed by an org in the current calendar month.
    Returns 0 on any DB error (fail open).
    """
    await _ensure_cuu_tables()
    pool = await get_pool()
    if not pool or not org_id:
        return 0
    try:
        async with pool.acquire() as conn:
            val = await conn.fetchval(
                """
                SELECT COALESCE(SUM("cuuCost"), 0)
                FROM cathy_usage_logs
                WHERE "orgId" = $1
                  AND "createdAt" >= DATE_TRUNC('month', NOW())
                """,
                org_id,
            )
            return int(val or 0)
    except Exception as exc:
        logger.debug(f"get_org_cuu_usage error for {org_id}: {exc}")
        return 0


async def get_org_cuu_breakdown(org_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Per-operation CUU breakdown for an org this calendar month, sorted by total cost desc.
    Returns list of { operation, total_cuu, call_count, avg_cuu }.
    """
    await _ensure_cuu_tables()
    pool = await get_pool()
    if not pool or not org_id:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT operation,
                       SUM("cuuCost")  AS total_cuu,
                       COUNT(*)        AS call_count,
                       ROUND(AVG("cuuCost")::numeric, 1) AS avg_cuu
                FROM cathy_usage_logs
                WHERE "orgId" = $1
                  AND "createdAt" >= DATE_TRUNC('month', NOW())
                GROUP BY operation
                ORDER BY total_cuu DESC
                LIMIT $2
                """,
                org_id, limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as exc:
        logger.debug(f"get_org_cuu_breakdown error for {org_id}: {exc}")
        return []


async def get_org_cuu_history(
    org_id: str, days: int = 30, limit: int = 100
) -> List[Dict[str, Any]]:
    """
    Raw usage log entries for an org within the last `days` days.
    Returns list of { id, userId, operation, cuuCost, elapsedMs, createdAt }.
    """
    await _ensure_cuu_tables()
    pool = await get_pool()
    if not pool or not org_id:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id,
                       "userId"     AS user_id,
                       operation,
                       "cuuCost"    AS cuu_cost,
                       "elapsedMs"  AS elapsed_ms,
                       "createdAt"  AS created_at
                FROM cathy_usage_logs
                WHERE "orgId" = $1
                  AND "createdAt" >= NOW() - ($2 || ' days')::interval
                ORDER BY "createdAt" DESC
                LIMIT $3
                """,
                org_id, str(days), limit,
            )
            return [_row_to_dict(r) for r in rows]
    except Exception as exc:
        logger.debug(f"get_org_cuu_history error for {org_id}: {exc}")
        return []


async def log_cuu_usage(
    org_id: str,
    user_id: Optional[str],
    operation: str,
    cuu_cost: int,
    elapsed_ms: int,
) -> None:
    """
    Append one row to cathy_usage_logs and upsert the monthly summary.
    Called via asyncio.create_task() — must never raise (swallows all errors).
    """
    await _ensure_cuu_tables()
    pool = await get_pool()
    if not pool or not org_id:
        return
    try:
        async with pool.acquire() as conn:
            # Append log row
            await conn.execute(
                """
                INSERT INTO cathy_usage_logs
                    ("orgId", "userId", operation, "cuuCost", "elapsedMs", "createdAt")
                VALUES ($1, $2, $3, $4, $5, NOW())
                """,
                org_id, user_id, operation, cuu_cost, elapsed_ms,
            )
            # Upsert monthly summary (period keyed to first day of month)
            await conn.execute(
                """
                INSERT INTO cathy_usage_summary
                    ("orgId", "periodStart", "totalCuu", "callCount", "lastUpdatedAt")
                VALUES ($1, DATE_TRUNC('month', NOW())::date, $2, 1, NOW())
                ON CONFLICT ("orgId", "periodStart") DO UPDATE
                    SET "totalCuu"      = cathy_usage_summary."totalCuu"  + EXCLUDED."totalCuu",
                        "callCount"     = cathy_usage_summary."callCount" + 1,
                        "lastUpdatedAt" = NOW()
                """,
                org_id, cuu_cost,
            )
    except Exception as exc:
        logger.warning(f"log_cuu_usage write failed (non-fatal): {exc}")


# ── Helpers ──────────────────────────────────────────────────────────────────

def _row_to_dict(row) -> Dict[str, Any]:
    """Convert asyncpg Record to plain dict, serialising non-JSON-safe types."""
    import datetime
    import decimal
    import uuid

    result = {}
    for key, val in dict(row).items():
        if isinstance(val, (datetime.datetime, datetime.date)):
            result[key] = val.isoformat()
        elif isinstance(val, decimal.Decimal):
            result[key] = float(val)
        elif isinstance(val, uuid.UUID):
            result[key] = str(val)
        else:
            result[key] = val
    return result

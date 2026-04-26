#!/usr/bin/env python3
"""
Startup script for Gigs4You AI Service.
Checks environment and starts the service.
"""

import os
import sys
import subprocess
from dotenv import load_dotenv

def check_environment():
    """Check if required environment variables and dependencies are available."""
    print("🔍 Checking environment...")

    # Check Python version
    python_version = sys.version_info
    print(f"   Python: {python_version.major}.{python_version.minor}.{python_version.micro}")

    # Check required environment variables
    required_env = ['ANTHROPIC_API_KEY']
    optional_env = ['DATABASE_URL', 'REDIS_HOST', 'REDIS_PORT']

    missing_required = []
    for env_var in required_env:
        if not os.getenv(env_var):
            missing_required.append(env_var)

    if missing_required:
        print(f"❌ Missing required environment variables: {', '.join(missing_required)}")
        print("   Please set these before running the service.")
        return False

    print("✅ Required environment variables found")

    # Check optional environment variables
    for env_var in optional_env:
        if os.getenv(env_var):
            print(f"   {env_var}: {os.getenv(env_var)}")
        else:
            print(f"   {env_var}: not set (using defaults)")

    return True

def check_dependencies():
    """Check if required Python packages are installed."""
    print("🔍 Checking dependencies...")

    required_packages = {
        'fastapi': 'fastapi',
        'uvicorn': 'uvicorn',
        'pydantic': 'pydantic',
        'anthropic': 'anthropic',
        'asyncpg': 'asyncpg',
        'redis': 'redis',
        'httpx': 'httpx',
        'python-dotenv': 'dotenv',
        'PyJWT': 'jwt',
    }

    missing_packages = []
    for package, import_name in required_packages.items():
        try:
            __import__(import_name)
            print(f"   ✓ {package}")
        except ImportError:
            missing_packages.append(package)
            print(f"   ❌ {package}")

    if missing_packages:
        print(f"❌ Missing packages: {', '.join(missing_packages)}")
        print("   Run: pip install -r requirements.txt")
        return False

    print("✅ All dependencies available")
    return True

def test_imports():
    """Test if all modules can be imported."""
    print("🔍 Testing imports...")

    # Add the service root so package-style `src.*` imports resolve correctly.
    service_root = os.path.dirname(__file__)
    if service_root not in sys.path:
        sys.path.insert(0, service_root)

    try:
        from src import main
        print("   ✓ main module")

        from src.database import get_pool
        print("   ✓ database module")

        from src.tools import dispatch, get_tool_registry
        print("   ✓ tools module")

        from src.claude_client import get_client
        print("   ✓ claude_client module")

        from src.prompts import get_system_prompt
        print("   ✓ prompts module")

        # New orchestration modules
        from src.schemas import IntentType, ExecutionStatus, OrchestrationContext
        print("   ✓ schemas module")

        from src.orchestrator import OrchestrationEngine, get_orchestrator
        print("   ✓ orchestrator module")

        from src.response_builder import ResponseBuilder
        print("   ✓ response_builder module")

        from src.tools.registry import ToolRegistry, get_tool_registry
        print("   ✓ tool registry module")

        print("✅ All imports successful")
        return True

    except Exception as e:
        print(f"❌ Import error: {e}")
        import traceback
        traceback.print_exc()
        return False

def start_service():
    """Start the FastAPI service."""
    print("🚀 Starting Gigs4You AI Service...")

    try:
        import uvicorn
        from src.main import app

        print("   Service will be available at: http://localhost:8001")
        print("   Health check: http://localhost:8001/health")
        print("   Press Ctrl+C to stop")

        uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)

    except Exception as e:
        print(f"❌ Failed to start service: {e}")
        return False

def main():
    print("🤖 Gigs4You AI Service Startup")
    print("=" * 40)

    # Change to script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    # Load the service-local .env explicitly so startup works regardless of cwd
    load_dotenv(os.path.join(script_dir, '.env'))

    # Run checks
    env_ok = check_environment()
    deps_ok = check_dependencies()
    imports_ok = test_imports()

    if not (env_ok and deps_ok and imports_ok):
        print("\n❌ Startup checks failed. Please fix the issues above.")
        sys.exit(1)

    print("\n✅ All checks passed. Starting service...")
    start_service()

if __name__ == "__main__":
    main()

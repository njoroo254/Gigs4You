#!/usr/bin/env python3
"""
Simple test script to check if the AI service can import its modules.
"""

import os
import sys

# Add the service root so package-style `src.*` imports resolve correctly.
service_root = os.path.dirname(__file__)
if service_root not in sys.path:
    sys.path.insert(0, service_root)

print("Testing imports...")

try:
    print("1. Importing main...")
    from src import main
    print("   ✓ main imported successfully")

    print("2. Importing database...")
    from src.database import get_pool
    print("   ✓ database imported successfully")

    print("3. Importing tools...")
    from src.tools import dispatch, CHAT_TOOLS
    print("   ✓ tools imported successfully")

    print("4. Importing claude_client...")
    from src.claude_client import get_client
    print("   ✓ claude_client imported successfully")

    print("5. Importing prompts...")
    from src.prompts import get_system_prompt
    print("   ✓ prompts imported successfully")

    print("\n🎉 All imports successful! The AI service should be able to run.")

except ImportError as e:
    print(f"\n❌ Import error: {e}")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ Other error: {e}")
    sys.exit(1)

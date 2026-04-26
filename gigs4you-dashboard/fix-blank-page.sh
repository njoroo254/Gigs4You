#!/usr/bin/env bash
# fix-blank-page.sh
# Run this from the gigs4you-dashboard folder if the dashboard is blank.
# Cause: shell brace expansion fails silently, creating literal dirs like
# src/{api,components} that crash Vite's module resolver.

echo "Scanning for rogue directories in src/..."
find src -type d | grep "{"

echo ""
echo "Removing them..."
find src -type d -name "*{*" -exec rm -rf {} + 2>/dev/null
find src -type d -name "*{*" -exec rm -rf {} + 2>/dev/null

echo ""
echo "Done. Run: npm run dev"

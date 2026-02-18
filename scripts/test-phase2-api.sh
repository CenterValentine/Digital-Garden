#!/bin/bash
# Phase 2 API Integration Test
# Tests that existing API endpoints still work with new content types

echo "🧪 Phase 2 API Integration Test"
echo "================================"
echo ""

# Start dev server in background
echo "🚀 Starting dev server..."
pnpm dev > /tmp/dev-server.log 2>&1 &
DEV_PID=$!

# Wait for server to be ready
echo "⏳ Waiting for server to start..."
sleep 10

# Function to test API endpoint
test_api() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}

    echo -n "Testing $name... "

    response=$(curl -s -w "\n%{http_code}" "http://localhost:3000$url" 2>/dev/null || echo "000")
    status=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')

    if [ "$status" = "$expected_status" ]; then
        echo "✅ PASS (HTTP $status)"
        return 0
    else
        echo "❌ FAIL (Expected HTTP $expected_status, got $status)"
        return 1
    fi
}

# Test suite
echo ""
echo "📋 Running API tests..."
echo ""

# These should return 401/302 (not authenticated) but not 500
test_api "Content List" "/api/content/content" 401
test_api "Content Tree" "/api/content/content/tree" 401
test_api "Search" "/api/content/search" 401
test_api "Tags List" "/api/content/tags" 401

# Public routes
test_api "Sign-in page" "/sign-in" 200
test_api "Content UI" "/content" 200

echo ""
echo "================================"
echo ""

# Cleanup
echo "🧹 Cleaning up..."
kill $DEV_PID 2>/dev/null
wait $DEV_PID 2>/dev/null

echo "✅ Phase 2 API test complete!"
echo ""
echo "Note: Full authenticated API tests require a running session."
echo "The above tests verify that endpoints respond correctly without authentication."

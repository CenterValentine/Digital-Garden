#!/bin/bash
# Documentation Validation Script
# Ensures consistency across CLAUDE.md, CURRENT-STATE.md, IMPLEMENTATION-STATUS.md, and 00-index.md

set -e

echo "🔍 Validating documentation consistency..."
echo ""

DOCS_DIR="apps/web/docs/notes-feature"
ERRORS=0
WARNINGS=0

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Check 1: Milestone Status Consistency
echo "📋 Checking milestone status consistency..."

# Extract M6 status from IMPLEMENTATION-STATUS.md
M6_STATUS_FILE=$(grep -E "^### .* M6:" "$DOCS_DIR/IMPLEMENTATION-STATUS.md" 2>/dev/null || echo "")

if echo "$M6_STATUS_FILE" | grep -q "✅.*M6"; then
  M6_COMPLETE=true
  echo "  ✓ IMPLEMENTATION-STATUS.md: M6 marked as complete"
else
  M6_COMPLETE=false
  echo "  ℹ️  IMPLEMENTATION-STATUS.md: M6 marked as in-progress"
fi

# Check CLAUDE.md consistency
CLAUDE_M6=$(grep "M6" CLAUDE.md 2>/dev/null || echo "")
if [ "$M6_COMPLETE" = true ]; then
  if echo "$CLAUDE_M6" | grep -q "complete"; then
    echo "  ✓ CLAUDE.md: M6 status consistent"
  else
    echo -e "  ${RED}✗ CLAUDE.md: M6 status inconsistent${NC}"
    ERRORS=$((ERRORS + 1))
  fi
fi

# Check CURRENT-STATE.md consistency
if [ -f "$DOCS_DIR/CURRENT-STATE.md" ]; then
  CURRENT_M6=$(grep "M6" "$DOCS_DIR/CURRENT-STATE.md" 2>/dev/null || echo "")
  if [ "$M6_COMPLETE" = true ]; then
    if echo "$CURRENT_M6" | grep -qi "complete\|finished\|done"; then
      echo "  ✓ CURRENT-STATE.md: M6 status consistent"
    else
      echo -e "  ${YELLOW}⚠ CURRENT-STATE.md: M6 status may be stale${NC}"
      WARNINGS=$((WARNINGS + 1))
    fi
  fi
fi

echo ""

# Check 2: Status Emoji Contradictions
echo "🚦 Checking for contradictory status emojis..."

CONTRADICTIONS=$(grep -n "M6" "$DOCS_DIR"/*.md 2>/dev/null | grep -E "(🚧|✅|⏳|📋)" | grep -v "archive" || true)

if [ "$M6_COMPLETE" = true ]; then
  # M6 is complete, check for 🚧 (in-progress) emoji
  INPROGRESS_EMOJI=$(echo "$CONTRADICTIONS" | grep "🚧.*M6" || true)
  if [ -n "$INPROGRESS_EMOJI" ]; then
    echo -e "  ${RED}✗ Found in-progress emoji (🚧) for completed M6:${NC}"
    echo "$INPROGRESS_EMOJI"
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✓ No contradictory emojis found"
  fi
fi

echo ""

# Check 3: API Endpoint Count
echo "🔌 Checking API endpoint counts..."

# Extract API count from CLAUDE.md (macOS compatible)
CLAUDE_API=$(grep -o '[0-9]\+ [Ee]ndpoints' CLAUDE.md 2>/dev/null | grep -o '[0-9]\+' | head -1 || echo "0")
echo "  CLAUDE.md: $CLAUDE_API endpoints"

# Extract API count from IMPLEMENTATION-STATUS.md (M6 section)
STATUS_API=$(grep -A 100 "^### .*M6:" "$DOCS_DIR/IMPLEMENTATION-STATUS.md" 2>/dev/null | grep 'API Routes:' | grep -o '[0-9]\+' | head -1 || echo "0")
echo "  IMPLEMENTATION-STATUS.md (M6): $STATUS_API endpoints"

if [ "$CLAUDE_API" != "$STATUS_API" ] && [ "$STATUS_API" != "0" ]; then
  echo -e "  ${YELLOW}⚠ API endpoint counts don't match (may need update)${NC}"
  WARNINGS=$((WARNINGS + 1))
else
  echo "  ✓ API counts consistent"
fi

echo ""

# Check 4: Current Phase/Active Milestone
echo "🎯 Checking active milestone consistency..."

# Check IMPLEMENTATION-STATUS.md
IMPL_PHASE=$(grep "^**Current Phase:" "$DOCS_DIR/IMPLEMENTATION-STATUS.md" 2>/dev/null || echo "")
echo "  IMPLEMENTATION-STATUS.md: $IMPL_PHASE"

# Check CURRENT-STATE.md
if [ -f "$DOCS_DIR/CURRENT-STATE.md" ]; then
  CURR_MILESTONE=$(grep "^**Active Milestone:" "$DOCS_DIR/CURRENT-STATE.md" 2>/dev/null || echo "")
  echo "  CURRENT-STATE.md: $CURR_MILESTONE"

  # Extract milestone numbers (macOS compatible)
  IMPL_NUM=$(echo "$IMPL_PHASE" | grep -o 'M[0-9]\+' | head -1 || echo "")
  CURR_NUM=$(echo "$CURR_MILESTONE" | grep -o 'M[0-9]\+' | head -1 || echo "")

  if [ -n "$IMPL_NUM" ] && [ -n "$CURR_NUM" ] && [ "$IMPL_NUM" != "$CURR_NUM" ]; then
    echo -e "  ${RED}✗ Active milestone mismatch: IMPL=$IMPL_NUM, CURRENT=$CURR_NUM${NC}"
    ERRORS=$((ERRORS + 1))
  else
    echo "  ✓ Active milestone consistent"
  fi
fi

echo ""

# Check 5: Duplicate Information
echo "📝 Checking for duplicate information..."

# Look for milestone status duplicated in CLAUDE.md (should reference instead)
CLAUDE_MILESTONE_DETAIL=$(grep -A 5 "Current Status" CLAUDE.md | grep -c "M[0-9].*:" || true)

if [ "$CLAUDE_MILESTONE_DETAIL" -gt 3 ]; then
  echo -e "  ${YELLOW}⚠ CLAUDE.md may have duplicate milestone details (should reference IMPLEMENTATION-STATUS.md)${NC}"
  WARNINGS=$((WARNINGS + 1))
else
  echo "  ✓ No excessive duplication detected"
fi

echo ""

# Check 6: Last Updated Dates
echo "📅 Checking last updated dates..."

TODAY=$(date +%Y-%m-%d)

if [ -f "$DOCS_DIR/CURRENT-STATE.md" ]; then
  CURRENT_DATE=$(grep "^**Last Updated:" "$DOCS_DIR/CURRENT-STATE.md" | grep -o '[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}' | head -1 || echo "1970-01-01")

  # macOS compatible date calculation
  if [ "$(uname)" = "Darwin" ]; then
    DAYS_OLD=$(( ( $(date +%s) - $(date -j -f "%Y-%m-%d" "$CURRENT_DATE" +%s 2>/dev/null || date +%s) ) / 86400 ))
  else
    DAYS_OLD=$(( ( $(date +%s) - $(date -d "$CURRENT_DATE" +%s 2>/dev/null || date +%s) ) / 86400 ))
  fi

  if [ "$DAYS_OLD" -gt 7 ]; then
    echo -e "  ${YELLOW}⚠ CURRENT-STATE.md last updated $DAYS_OLD days ago (weekly cleanup recommended)${NC}"
    WARNINGS=$((WARNINGS + 1))
  else
    echo "  ✓ CURRENT-STATE.md is up to date ($DAYS_OLD days old)"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Summary
if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed! Documentation is consistent.${NC}"
  exit 0
elif [ "$ERRORS" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  $WARNINGS warning(s) found (non-critical)${NC}"
  echo ""
  echo "Consider updating affected files for better consistency."
  exit 0
else
  echo -e "${RED}❌ $ERRORS error(s) and $WARNINGS warning(s) found${NC}"
  echo ""
  echo "Please fix errors before committing documentation changes."
  echo "See apps/web/docs/notes-feature/DOCUMENTATION-MAINTENANCE-PROTOCOL.md for guidance."
  exit 1
fi

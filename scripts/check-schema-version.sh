#!/bin/bash

# Pre-commit hook to ensure schema version is updated when extensions change
# Install: ln -s ../../scripts/check-schema-version.sh .git/hooks/pre-commit

set -e

echo "🔍 Checking TipTap schema changes..."

# Check if TipTap extensions were modified
EXTENSIONS_CHANGED=$(git diff --cached --name-only | grep -c "lib/domain/editor/extensions" || true)

if [ "$EXTENSIONS_CHANGED" -gt 0 ]; then
  echo "⚠️  TipTap extensions modified. Verifying schema version..."

  # Check if schema-version.ts was also updated
  SCHEMA_VERSION_UPDATED=$(git diff --cached --name-only | grep -c "lib/domain/editor/schema-version.ts" || true)

  if [ "$SCHEMA_VERSION_UPDATED" -eq 0 ]; then
    echo ""
    echo "❌ ERROR: You modified TipTap extensions but didn't update schema-version.ts"
    echo ""
    echo "Please:"
    echo "  1. Update TIPTAP_SCHEMA_VERSION in lib/domain/editor/schema-version.ts"
    echo "  2. Add entry to SCHEMA_HISTORY documenting your changes"
    echo "  3. Run: pnpm test lib/domain/export/__tests__/schema-compatibility.test.ts"
    echo ""
    echo "Version bump guidelines:"
    echo "  - MAJOR (1.0.0 → 2.0.0): Breaking changes (renamed nodes, removed attributes)"
    echo "  - MINOR (1.0.0 → 1.1.0): New features (new extensions, new optional attributes)"
    echo "  - PATCH (1.0.0 → 1.0.1): Bug fixes (no schema changes)"
    echo ""
    exit 1
  fi

  echo "✅ Schema version updated"
fi

# Check if converters were modified
CONVERTERS_CHANGED=$(git diff --cached --name-only | grep -c "lib/domain/export/converters" || true)

if [ "$CONVERTERS_CHANGED" -gt 0 ] || [ "$EXTENSIONS_CHANGED" -gt 0 ]; then
  echo "🧪 Running export compatibility tests..."

  # Run tests (with --run flag for CI environments)
  if ! pnpm test lib/domain/export/__tests__/schema-compatibility.test.ts --run --silent 2>&1 | grep -q "PASS"; then
    echo ""
    echo "❌ Export compatibility tests failed!"
    echo "Your changes may have broken export converters."
    echo ""
    echo "Run: pnpm test lib/domain/export --watch"
    echo "to see detailed error messages."
    echo ""
    exit 1
  fi

  echo "✅ All compatibility tests passed"
fi

echo "✅ Schema check complete"
exit 0

#!/bin/bash
#
# Clean macOS Finder Duplicate Files
#
# macOS Finder creates backup files with " 2", " 3" suffixes during file operations.
# This script removes them from the repository.
#

echo "🔍 Searching for macOS Finder duplicate files..."

# Count duplicates before removal
count=$(find . -type f -name "* [0-9].*" ! -path "./node_modules/*" ! -path "./.git/*" 2>/dev/null | wc -l | tr -d ' ')

if [ "$count" -eq 0 ]; then
  echo "✓ No duplicate files found"
  exit 0
fi

echo "📦 Found $count duplicate files"

# Show what will be deleted
echo ""
echo "Files to be removed:"
find . -type f -name "* [0-9].*" ! -path "./node_modules/*" ! -path "./.git/*" 2>/dev/null | head -20
if [ "$count" -gt 20 ]; then
  echo "... and $((count - 20)) more"
fi

echo ""
read -p "Delete these files? (y/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
  find . -type f -name "* [0-9].*" ! -path "./node_modules/*" ! -path "./.git/*" -delete 2>/dev/null
  echo "✓ Deleted $count duplicate files"
else
  echo "⚠️  Cancelled"
  exit 1
fi

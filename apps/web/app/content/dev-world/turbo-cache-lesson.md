# Turbo Cache Debug Lesson:

When turbo fails to build, check for cache issues.

1. ** Understand `cache hit, replaying logs` vs `cache miss, executing`**
   - If cache hit but files missing → outputs config issue

2. **Verify output paths:**
   - Are paths relative to package directory? (e.g., `.next/**` not `apps/*/.next/**`)
   - Do paths match actual build output locations?
   - Are cache directories excluded? (e.g., `!.next/cache/**`)

3. **Test cache behavior:**
   - Clear cache and rebuild (should work)
   - Rebuild with cache (should restore files)
   - If only fresh builds work → cache restoration issue

4. **Check turbo.json:**
   - `outputs` array should list all build artifacts
   - Paths must be relative to where task runs
   - Use globs correctly (`**` for recursive, `*` for single level)

## Common Mistakes (AI Generated)

- ❌ Using monorepo-relative paths in outputs (`apps/*/.next/**`)
- ✅ Using package-relative paths (`.next/**`)
- ❌ Forgetting to exclude cache/temp directories
- ✅ Excluding with `!` prefix (`!.next/cache/**`)
- ❌ Assuming cache hit = files exist
- ✅ Always verify files exist after cache hit

## Quick Fixes (AI Generated)

- **Invalidate cache:** Delete `.turbo` directory or use `turbo run build --force`
- **Update outputs:** Fix paths in `turbo.json` and clear cache
- **Test locally:** Run `turbo run build` twice to test cache behavior

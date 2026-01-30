# Export System Error Handling Guide

**Version:** 1.0
**Date:** 2026-01-27

---

## Overview

Robust error handling system that detects discrepancies, logs issues, and provides actionable insights for quick resolution.

---

## Architecture

```
Export Request
      ↓
[1] Pre-Export Validation
      ↓
[2] Schema Compatibility Check
      ↓
[3] Conversion with Error Tracking
      ↓
[4] Post-Export Validation
      ↓
[5] Error Monitoring & Aggregation
      ↓
[6] Health Dashboard
```

---

## Components

### 1. Validation System (`validation.ts`)

**Validates:**
- TipTap JSON structure
- Node types and marks
- Required attributes
- Circular references
- Document size
- Metadata consistency

**Example:**
```typescript
import { validateBeforeExport } from '@/lib/domain/export/validation';

const result = validateBeforeExport(tiptapJson, metadata);

if (!result.valid) {
  console.error('Validation failed:', formatValidationResult(result));
}
```

### 2. Error Monitoring (`error-monitoring.ts`)

**Tracks:**
- Export errors by type/code
- Schema discrepancies
- Unknown node occurrences
- Recurring issues

**Example:**
```typescript
import { errorMonitor, logExportError } from '@/lib/domain/export/error-monitoring';

// Log an error
logExportError(error, {
  contentId,
  format: 'markdown',
  userId,
  schemaVersion: '1.0.0',
});

// Get statistics
const stats = errorMonitor.getStatistics();
console.log(`Total errors: ${stats.totalErrors}`);
```

### 3. Health Dashboard (`/api/content/export/health`)

**Provides:**
- Real-time error statistics
- Critical discrepancy reports
- Actionable recommendations
- System health status

**Access:**
```bash
curl http://localhost:3000/api/content/export/health \
  -H "Authorization: Bearer <token>"
```

---

## Error Categories

### Critical Errors

**Stop export immediately:**
- `INVALID_STRUCTURE` - TipTap JSON malformed
- `CIRCULAR_REFERENCE` - Infinite loop detected
- `MISSING_REQUIRED_ATTRIBUTE` - Extension misconfigured

### High-Severity Errors

**Log and continue with fallback:**
- `UNKNOWN_NODE_TYPE` - Schema outdated
- `UNKNOWN_MARK_TYPE` - New extension not in schema
- `INVALID_JSON` - Metadata sidecar corrupted

### Warnings

**Log but don't block:**
- `SCHEMA_VERSION_MISMATCH` - Migration may be needed
- `LARGE_DOCUMENT` - Performance concern
- `UNCLOSED_CODE_BLOCK` - Syntax issue

---

## Discrepancy Detection

### Automatic Detection

The system automatically detects:

1. **Schema Mismatches**
   ```
   Detected: Node type 'customNode' not in schema
   Suggestion: Add to schema-version.ts
   ```

2. **Unknown Nodes**
   ```
   Detected: Unknown node 'highlight' used 15 times
   Suggestion: Implement converter serialization
   ```

3. **Missing Attributes**
   ```
   Detected: wikiLink missing 'targetTitle' attribute
   Suggestion: Check extension implementation
   ```

4. **Invalid Structure**
   ```
   Detected: Root node is 'paragraph' instead of 'doc'
   Suggestion: Fix TipTap editor initialization
   ```

### Discrepancy Reports

Aggregates similar issues:
```json
{
  "type": "unknown_node",
  "severity": "high",
  "occurrences": 127,
  "firstSeen": "2026-01-27T10:00:00Z",
  "lastSeen": "2026-01-27T12:30:00Z",
  "details": {
    "suggestion": "Add this node type to schema-version.ts"
  }
}
```

---

## Health Monitoring

### System Status

```typescript
const health = checkExportHealth();

if (!health.healthy) {
  console.error('Export system unhealthy:', health.issues);
}
```

**Output:**
```javascript
{
  healthy: false,
  issues: [
    "High error count: 150 errors logged",
    "27 unknown node type errors (schema may be outdated)",
    "3 critical discrepancies detected"
  ],
  stats: { /* ... */ }
}
```

### Dashboard Access

Navigate to: **Admin Panel → Export Health** (future)

Or call API:
```bash
GET /api/content/export/health
```

**Response:**
```json
{
  "status": "unhealthy",
  "issues": [...],
  "statistics": {
    "totalErrors": 150,
    "errorsByType": {
      "unknown_node": 27,
      "validation": 8,
      "conversion": 2
    }
  },
  "discrepancies": {
    "critical": [...],
    "high": [...],
    "top10": [...]
  },
  "recommendations": [
    "Update schema-version.ts and add converter support",
    "Review error logs for recurring patterns"
  ]
}
```

---

## Usage Examples

### Example 1: Validate Before Export

```typescript
import { validateBeforeExport, formatValidationResult } from '@/lib/domain/export/validation';

async function exportWithValidation(contentId: string) {
  const content = await fetchContent(contentId);
  const tiptapJson = content.notePayload.tiptapJson;

  // Validate
  const result = validateBeforeExport(tiptapJson);

  if (!result.valid) {
    console.error('Validation failed:', formatValidationResult(result));

    // Still export, but log issues
  }

  // Proceed with export
  return await convertDocument(tiptapJson, options);
}
```

### Example 2: Monitor Errors

```typescript
import { errorMonitor } from '@/lib/domain/export/error-monitoring';

// Get statistics
const stats = errorMonitor.getStatistics();

console.log('Error Statistics:');
console.log(`- Total: ${stats.totalErrors}`);
console.log(`- By type:`, stats.errorsByType);
console.log(`- Recent:`, stats.recentErrors.slice(-3));

// Get discrepancies
const discrepancies = errorMonitor.getDiscrepancies({
  severity: 'critical',
});

if (discrepancies.length > 0) {
  console.error('Critical discrepancies:', discrepancies);
}
```

### Example 3: Health Check

```typescript
import { checkExportHealth } from '@/lib/domain/export/error-monitoring';

function monitorExportHealth() {
  const health = checkExportHealth();

  if (!health.healthy) {
    // Send alert
    sendAlert({
      severity: 'high',
      message: 'Export system unhealthy',
      issues: health.issues,
    });
  }
}

// Run every hour
setInterval(monitorExportHealth, 60 * 60 * 1000);
```

---

## Integration with Export Flow

### Bulk Export with Validation

```typescript
// lib/domain/export/bulk-export.ts

export async function exportVault(options: BulkExportOptions) {
  for (const note of notes) {
    // [1] Validate
    const validationResult = validateBeforeExport(note.tiptapJson);

    if (!validationResult.valid) {
      // [2] Log validation errors
      errorMonitor.logValidation(note.id, options.format, options.userId, validationResult);
    }

    try {
      // [3] Convert
      const result = await convertDocument(note.tiptapJson, options);

      if (!result.success) {
        // [4] Log conversion failure
        logExportError(new Error('Conversion failed'), {
          contentId: note.id,
          format: options.format,
          userId: options.userId,
          schemaVersion: getCurrentSchemaVersion(),
        });
      }
    } catch (error) {
      // [5] Log system error
      logExportError(error, { /* ... */ });
    }
  }
}
```

---

## Proactive Monitoring

### Set Up Alerts

```typescript
// lib/infrastructure/monitoring/export-alerts.ts

export function setupExportMonitoring() {
  // Check health every hour
  setInterval(() => {
    const health = checkExportHealth();

    if (!health.healthy) {
      sendSlackAlert({
        channel: '#engineering',
        text: `Export system unhealthy: ${health.issues.join(', ')}`,
      });
    }
  }, 60 * 60 * 1000);

  // Check for recurring issues daily
  setInterval(() => {
    const stats = errorMonitor.getStatistics();

    if (stats.topDiscrepancies[0]?.occurrences > 100) {
      sendEmailAlert({
        to: 'dev-team@example.com',
        subject: 'Recurring export issue detected',
        body: `Issue: ${stats.topDiscrepancies[0].type}\nOccurrences: ${stats.topDiscrepancies[0].occurrences}`,
      });
    }
  }, 24 * 60 * 60 * 1000);
}
```

---

## Troubleshooting

### High Error Rate

**Symptom:** Many exports failing

**Check:**
```typescript
const stats = errorMonitor.getStatistics();
console.log('Error breakdown:', stats.errorsByCode);
```

**Fix:**
- Review most common error code
- Check if recent TipTap changes broke converters
- Update schema version if needed

### Unknown Node Errors

**Symptom:** `UNKNOWN_NODE_TYPE` warnings

**Check:**
```typescript
const discrepancies = errorMonitor.getDiscrepancies({ type: 'unknown_node' });
console.log('Unknown nodes:', discrepancies);
```

**Fix:**
1. Add node type to `schema-version.ts`
2. Implement serialization in converters
3. Run tests: `pnpm test lib/domain/export`

### Validation Failures

**Symptom:** `MISSING_REQUIRED_ATTRIBUTE` errors

**Check:**
```typescript
const result = validateTipTapJSON(tiptapJson);
console.log(formatValidationResult(result));
```

**Fix:**
- Check extension implementation
- Ensure all required attributes populated
- Update `getRequiredAttributes()` if needed

---

## Best Practices

### 1. Always Validate

```typescript
// ✅ Good
const result = validateBeforeExport(tiptapJson);
if (!result.valid) {
  errorMonitor.logValidation(/* ... */);
}

// ❌ Bad
// Skipping validation
```

### 2. Log All Errors

```typescript
// ✅ Good
try {
  await convertDocument(/* ... */);
} catch (error) {
  logExportError(error, { /* context */ });
  throw error;
}

// ❌ Bad
try {
  await convertDocument(/* ... */);
} catch (error) {
  // Silent failure
}
```

### 3. Monitor Regularly

```typescript
// ✅ Good
setInterval(() => checkExportHealth(), 60 * 60 * 1000);

// ❌ Bad
// Only checking when exports fail
```

### 4. Act on Discrepancies

```typescript
// ✅ Good
const discrepancies = errorMonitor.getDiscrepancies({ severity: 'critical' });
if (discrepancies.length > 0) {
  // Fix immediately
}

// ❌ Bad
// Ignoring discrepancy reports
```

---

## Summary

You now have:

✅ **Comprehensive validation** before every export
✅ **Error tracking** with categorization
✅ **Discrepancy detection** with suggestions
✅ **Health monitoring** dashboard
✅ **Actionable recommendations** for quick fixes
✅ **Graceful degradation** - exports continue despite issues
✅ **Proactive alerts** for critical problems

**Your export system will never fail silently!**

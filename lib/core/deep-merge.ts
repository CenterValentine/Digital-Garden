/**
 * Deep merge utility
 *
 * Recursively merges source object into target object.
 * - Arrays are replaced, not merged
 * - Undefined values in source are ignored
 * - Null values in source overwrite target values
 *
 * @param target - The base object
 * @param source - The object to merge into target
 * @returns A new merged object
 *
 * @example
 * ```typescript
 * const target = { a: 1, b: { c: 2, d: 3 } };
 * const source = { b: { c: 4 }, e: 5 };
 * const result = deepMerge(target, source);
 * // result = { a: 1, b: { c: 4, d: 3 }, e: 5 }
 * ```
 */
export function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue,
        sourceValue
      ) as T[Extract<keyof T, string>];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[Extract<keyof T, string>];
    }
  }

  return result;
}

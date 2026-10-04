/**
 * Is this string shaped like a UUID?
 *
 * `ContentNode.id` is `@db.Uuid`, so handing Prisma any other string in an
 * id filter THROWS ("invalid input syntax for type uuid") instead of simply
 * matching nothing. Client-supplied id lists can legitimately contain ids
 * that are not content at all — an extension's virtual tab (`reader:library`,
 * `reader:scripture/<corpus>`) lives in a workspace's tab strip but has no
 * ContentNode. Filter with `onlyUuids` before any `{ id: { in: … } }` query
 * fed by the client; a non-UUID id can never be owned content, so dropping it
 * is exactly what "no such row" would have done.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function onlyUuids(values: readonly string[]): string[] {
  return values.filter(isUuid);
}

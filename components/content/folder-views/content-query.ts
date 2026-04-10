export interface ContentQueryOptions {
  parentId?: string | null;
  personId?: string | null;
  peopleGroupId?: string | null;
  type?: string | null;
}

export function buildContentListUrl(query: ContentQueryOptions): string {
  const params = new URLSearchParams();

  if (query.parentId !== undefined) {
    params.set("parentId", query.parentId === null ? "null" : query.parentId);
  }

  if (query.personId) {
    params.set("personId", query.personId);
  }

  if (query.peopleGroupId) {
    params.set("peopleGroupId", query.peopleGroupId);
  }

  if (query.type) {
    params.set("type", query.type);
  }

  const queryString = params.toString();
  return queryString ? `/api/content/content?${queryString}` : "/api/content/content";
}

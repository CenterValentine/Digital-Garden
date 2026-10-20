/**
 * Fielded query syntax for the research box (client-safe, pure).
 *
 * The box is the single source of truth: free words plus tokens such as
 * `author:haenlein venue:"small ruminant" after:2015 cites>100 type:article`.
 * The quick-pane's controls edit the same text by rewriting tokens
 * (`applyFields`), so a filter set in the pane shows in the box and a token
 * typed in the box shows in the pane. Unknown `word:` pairs are left as
 * search words (a title can contain a colon).
 */

import type { ResearchQuery, WorkType } from "./types";

export interface QueryFields {
  author?: string;
  venue?: string;
  types?: WorkType[];
  field?: string;
  yearFrom?: number;
  yearTo?: number;
  openAccess?: boolean;
  minCitations?: number;
  sort?: ResearchQuery["sort"];
}

export interface ParsedQuery {
  /** The free words, tokens removed, whitespace collapsed. */
  text: string;
  fields: QueryFields;
}

const SORTS = new Set(["relevance", "recent", "cited"]);
const OA_TRUE = new Set(["yes", "true", "only", "1", "open"]);

/** `key:value`, `key:"quoted value"`, `cites>100`, `cites>=100`. */
const TOKEN = /(^|\s)(author|venue|type|field|after|before|year|oa|sort|cites)(:|>=?|=)("([^"]*)"|\S+)/gi;

function year(value: string): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1000 && n <= 3000 ? n : undefined;
}

export function parseFieldedQuery(raw: string): ParsedQuery {
  const fields: QueryFields = {};
  const text = raw
    .replace(TOKEN, (_match, lead: string, key: string, op: string, value: string, quoted?: string) => {
      const v = (quoted ?? value).trim();
      switch (key.toLowerCase()) {
        case "author":
          fields.author = v;
          break;
        case "venue":
          fields.venue = v;
          break;
        case "type":
          fields.types = v.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
          break;
        case "field":
          fields.field = v.toLowerCase();
          break;
        case "after":
          fields.yearFrom = year(v);
          break;
        case "before":
          fields.yearTo = year(v);
          break;
        case "year": {
          const [from, to] = v.split("-");
          if (to === undefined) {
            fields.yearFrom = year(from);
            fields.yearTo = year(from);
          } else {
            fields.yearFrom = from ? year(from) : undefined;
            fields.yearTo = to ? year(to) : undefined;
          }
          break;
        }
        case "oa":
          fields.openAccess = OA_TRUE.has(v.toLowerCase());
          break;
        case "sort":
          if (SORTS.has(v.toLowerCase())) fields.sort = v.toLowerCase() as ResearchQuery["sort"];
          break;
        case "cites": {
          const n = Number(v.replace(/^[>=]+/, ""));
          if (Number.isInteger(n) && n >= 0 && op !== "=" ) fields.minCitations = n;
          else if (Number.isInteger(n) && n >= 0 && op === "=") fields.minCitations = n;
          break;
        }
      }
      return lead;
    })
    .replace(/\s+/g, " ")
    .trim();
  return { text, fields };
}

function quote(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, "")}"` : value;
}

/** Fields → tokens, in a stable order so the box reads the same each time. */
export function fieldsToTokens(fields: QueryFields): string[] {
  const tokens: string[] = [];
  if (fields.author) tokens.push(`author:${quote(fields.author)}`);
  if (fields.venue) tokens.push(`venue:${quote(fields.venue)}`);
  if (fields.types?.length) tokens.push(`type:${fields.types.join(",")}`);
  if (fields.field) tokens.push(`field:${fields.field}`);
  if (fields.yearFrom !== undefined && fields.yearTo !== undefined) {
    tokens.push(fields.yearFrom === fields.yearTo ? `year:${fields.yearFrom}` : `year:${fields.yearFrom}-${fields.yearTo}`);
  } else if (fields.yearFrom !== undefined) tokens.push(`after:${fields.yearFrom}`);
  else if (fields.yearTo !== undefined) tokens.push(`before:${fields.yearTo}`);
  if (fields.openAccess) tokens.push("oa:yes");
  if (fields.minCitations !== undefined && fields.minCitations > 0) tokens.push(`cites>=${fields.minCitations}`);
  if (fields.sort && fields.sort !== "relevance") tokens.push(`sort:${fields.sort}`);
  return tokens;
}

/**
 * Rewrite the box: keep the free words, replace every token with the given
 * fields. A pane edit therefore shows up in the box, and clearing a filter
 * removes its token.
 */
export function applyFields(raw: string, patch: Partial<QueryFields>): string {
  const parsed = parseFieldedQuery(raw);
  const merged: QueryFields = { ...parsed.fields, ...patch };
  for (const key of Object.keys(merged) as Array<keyof QueryFields>) {
    const value = merged[key];
    if (value === undefined || value === null || value === "" || value === false || (Array.isArray(value) && value.length === 0)) {
      delete merged[key];
    }
  }
  return [parsed.text, ...fieldsToTokens(merged)].filter(Boolean).join(" ");
}

/** How many filters are set — the badge on the quick-pane button. */
export function activeFieldCount(fields: QueryFields): number {
  let count = 0;
  if (fields.author) count++;
  if (fields.venue) count++;
  if (fields.types?.length) count++;
  if (fields.field) count++;
  if (fields.yearFrom !== undefined || fields.yearTo !== undefined) count++;
  if (fields.openAccess) count++;
  if (fields.minCitations) count++;
  if (fields.sort && fields.sort !== "relevance") count++;
  return count;
}

/** The query the adapters get: free words plus the parsed fields. */
export function toResearchQuery(raw: string): ResearchQuery {
  const { text, fields } = parseFieldedQuery(raw);
  return {
    text,
    author: fields.author,
    venue: fields.venue,
    types: fields.types,
    field: fields.field,
    yearFrom: fields.yearFrom,
    yearTo: fields.yearTo,
    openAccess: fields.openAccess || undefined,
    minCitations: fields.minCitations,
    sort: fields.sort ?? "relevance",
  };
}

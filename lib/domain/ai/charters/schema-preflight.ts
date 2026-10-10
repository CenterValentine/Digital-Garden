/**
 * The schema preflight every charter run carries (owner rule, 2026-10-09).
 *
 * A charter names databases, columns (`[[Jobs#Status]]`) and the relations
 * between them; a run that finds one missing used to improvise — the
 * "Apply for a job" runs grew a `Quest · <job>` column per job on a table
 * whose link already existed. The reference manifest marks what is missing
 * (route `resolveCharterReferenceContext`, lib/domain/data/server/column-links.ts);
 * this line tells the model what to do about it, on every charter path.
 */
export const CHARTER_SCHEMA_PREFLIGHT =
  "**Before acting on this charter:** make sure the databases, columns and relations it names exist — the linked-extensions list above marks any that are missing. If one is missing, STOP and offer to create or link it before relying on it. Never invent a substitute or bookkeeping column, and never link tables through a new column when a relation between them already exists. If the user says something exists, believe them and find it (it may be named differently).";

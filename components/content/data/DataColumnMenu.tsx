"use client";

/**
 * Column editing: the add-column popover and the per-column header menu.
 *
 * Both panels are PORTALED to <body> and positioned with
 * `calculateMenuPosition` — the repo's canonical menu pattern (CLAUDE.md
 * "Menu Positioning"; same approach as ContextMenu and ContentTreePicker).
 * The first version rendered them `position: absolute` inside the header
 * cell, where the grid's overflow container clipped them and the left
 * sidebar painted over them. Portal + viewport-aware placement is the fix
 * that cannot regress per-panel.
 *
 * Type is chosen at creation and never afterwards (plan O4) — the edit menu
 * shows the type but offers no way to change it. Coercing every existing cell
 * is lossy in ways a preview cannot honestly convey, and "add a column and
 * migrate" is both cheaper to build and clearer about what happens to data.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/core/utils";
import { PanelPortal } from "./PanelPortal";
import {
  formatNumberCell,
  generateColumnKey,
  IMPLEMENTED_COLUMN_TYPES,
  ROLLUP_FNS,
  type DataColumn,
  type DataColumnConfig,
  type DataColumnType,
  type RollupFn,
  type SelectOption,
  type StatusGroup,
} from "@/lib/domain/data";

export const TYPE_LABEL: Partial<Record<DataColumnType, string>> = {
  text: "Text",
  longText: "Long text",
  number: "Number",
  checkbox: "Checkbox",
  date: "Date",
  select: "Select",
  multiSelect: "Multi-select",
  status: "Status",
  url: "URL",
  email: "Email",
  relation: "Relation",
  lookup: "Lookup",
  rollup: "Rollup",
  contentLink: "Content link",
  person: "Person",
  file: "File",
};

const ROLLUP_LABEL: Record<RollupFn, string> = {
  count: "Count",
  sum: "Sum",
  min: "Min",
  max: "Max",
  join: "Join values",
};

/**
 * Offered currency codes — a closed list rather than free text because a
 * bad ISO code makes Intl.NumberFormat throw (the formatter degrades to
 * raw, but the user would see their choice silently ignored).
 */
const CURRENCY_CODES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "USD", label: "USD — US Dollar ($)" },
  { code: "EUR", label: "EUR — Euro (€)" },
  { code: "GBP", label: "GBP — British Pound (£)" },
  { code: "JPY", label: "JPY — Japanese Yen (¥)" },
  { code: "CAD", label: "CAD — Canadian Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "CHF", label: "CHF — Swiss Franc" },
  { code: "CNY", label: "CNY — Chinese Yuan (¥)" },
  { code: "INR", label: "INR — Indian Rupee (₹)" },
  { code: "KRW", label: "KRW — South Korean Won (₩)" },
  { code: "MXN", label: "MXN — Mexican Peso" },
  { code: "BRL", label: "BRL — Brazilian Real" },
  { code: "SEK", label: "SEK — Swedish Krona" },
  { code: "NOK", label: "NOK — Norwegian Krone" },
  { code: "DKK", label: "DKK — Danish Krone" },
  { code: "PLN", label: "PLN — Polish Złoty" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
  { code: "HKD", label: "HKD — Hong Kong Dollar" },
  { code: "NZD", label: "NZD — New Zealand Dollar" },
  { code: "ZAR", label: "ZAR — South African Rand" },
];

const fieldClass = cn(
  "w-full rounded-md border border-border bg-background px-2 py-1.5",
  "text-xs outline-none focus:ring-2 focus:ring-primary"
);

// ── Add ──────────────────────────────────────────────────────────────────

interface AddColumnButtonProps {
  /** The table this column joins — excluded from relation targets (self-
   * relations are a later decision, not an accident waiting to happen). */
  tableId: string;
  /** Existing columns — lookup/rollup pick a relation to read through. */
  columns: DataColumn[];
  onAdd: (input: {
    name: string;
    type: DataColumnType;
    config?: DataColumnConfig;
    createBacklink?: boolean;
  }) => Promise<void>;
}

export function AddColumnButton({ tableId, columns, onAdd }: AddColumnButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<DataColumnType>("text");
  const [busy, setBusy] = useState(false);
  const [targetDbId, setTargetDbId] = useState("");
  const [withBacklink, setWithBacklink] = useState(true);
  const [databases, setDatabases] = useState<Array<{ id: string; title: string }>>([]);
  // Lookup/rollup wiring: the relation to traverse, the target-table column
  // to read, and (rollup) the aggregation.
  const [throughRelationId, setThroughRelationId] = useState("");
  const [targetColumnId, setTargetColumnId] = useState("");
  const [rollupFn, setRollupFn] = useState<RollupFn>("count");
  const [personSource, setPersonSource] = useState<"person" | "user">("person");
  const [targetColumns, setTargetColumns] = useState<DataColumn[] | null>(null);

  const relationColumns = columns.filter(
    (c) => c.type === "relation" && !c.deletedAt
  );
  const isDerived = type === "lookup" || type === "rollup";
  const needsTargetColumn =
    type === "lookup" || (type === "rollup" && rollupFn !== "count");
  const throughRelation = relationColumns.find(
    (c) => c.id === throughRelationId
  );
  const throughTargetTableId = throughRelation?.config.relationTableId ?? "";

  // Load the chosen relation's target-table schema for the column picker.
  useEffect(() => {
    if (!isDerived || !throughTargetTableId) return;
    let cancelled = false;
    setTargetColumns(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/content/data/${throughTargetTableId}`,
          { credentials: "include" }
        );
        const json = await res.json();
        if (!cancelled && json?.success) {
          setTargetColumns(json.data.table.columns as DataColumn[]);
        }
      } catch {
        if (!cancelled) setTargetColumns([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDerived, throughTargetTableId]);

  // Relation targets load lazily, first time the type is picked.
  useEffect(() => {
    if (type !== "relation" || databases.length > 0 || !open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/content/data", { credentials: "include" });
        const json = await res.json();
        if (!cancelled && json?.success) {
          setDatabases(
            (json.data.databases as Array<{ id: string; title: string }>).filter(
              (db) => db.id !== tableId
            )
          );
        }
      } catch {
        // The select stays empty; submit stays disabled — recoverable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, open, databases.length, tableId]);

  const close = useCallback(() => {
    setOpen(false);
    setName("");
    setType("text");
    setTargetDbId("");
    setThroughRelationId("");
    setTargetColumnId("");
    setRollupFn("count");
    setPersonSource("person");
    setTargetColumns(null);
  }, []);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (type === "relation" && !targetDbId) return;
    if (isDerived && !throughRelationId) return;
    if (needsTargetColumn && !targetColumnId) return;
    setBusy(true);
    try {
      let config: DataColumnConfig | undefined;
      if (type === "relation") config = { relationTableId: targetDbId };
      else if (type === "lookup")
        config = {
          relationColumnId: throughRelationId,
          lookupColumnId: targetColumnId,
        };
      else if (type === "rollup")
        config = {
          relationColumnId: throughRelationId,
          rollupFn,
          ...(rollupFn !== "count" ? { rollupColumnId: targetColumnId } : {}),
        };
      else if (type === "person") config = { personSource };
      await onAdd({
        name: trimmed,
        type,
        config,
        createBacklink: type === "relation" ? withBacklink : undefined,
      });
      close();
    } finally {
      setBusy(false);
    }
  }, [
    name,
    type,
    targetDbId,
    withBacklink,
    isDerived,
    needsTargetColumn,
    throughRelationId,
    targetColumnId,
    rollupFn,
    personSource,
    busy,
    onAdd,
    close,
  ]);

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Add column"
        className="flex h-full w-10 items-center justify-center text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <PanelPortal open={open} onDismiss={close}>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          placeholder="Column name"
          className={fieldClass}
        />

        <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Type
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as DataColumnType)}
          className={fieldClass}
        >
          {IMPLEMENTED_COLUMN_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Type is set once. To change it later, add a new column and move the
          values across.
        </p>

        {type === "relation" && (
          <>
            <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Links to
            </label>
            <select
              value={targetDbId}
              onChange={(e) => setTargetDbId(e.target.value)}
              className={fieldClass}
            >
              <option value="">Choose a database…</option>
              {databases.map((db) => (
                <option key={db.id} value={db.id}>
                  {db.title}
                </option>
              ))}
            </select>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={withBacklink}
                onChange={(e) => setWithBacklink(e.target.checked)}
                className="h-3.5 w-3.5 accent-current"
              />
              Also add the linked column over there
            </label>
          </>
        )}

        {type === "person" && (
          <>
            <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Who it points at
            </label>
            <select
              value={personSource}
              onChange={(e) =>
                setPersonSource(e.target.value as "person" | "user")
              }
              className={fieldClass}
            >
              <option value="person">People (your contacts)</option>
              <option value="user">App users</option>
            </select>
            <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
              People is usually right — it draws from your People extension.
            </p>
          </>
        )}

        {isDerived && (
          <>
            <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Through relation
            </label>
            {relationColumns.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Add a Relation column first — {TYPE_LABEL[type]} reads its
                values through one.
              </p>
            ) : (
              <select
                value={throughRelationId}
                onChange={(e) => {
                  setThroughRelationId(e.target.value);
                  setTargetColumnId("");
                }}
                className={fieldClass}
              >
                <option value="">Choose a relation…</option>
                {relationColumns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            {type === "rollup" && (
              <>
                <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Calculate
                </label>
                <select
                  value={rollupFn}
                  onChange={(e) => setRollupFn(e.target.value as RollupFn)}
                  className={fieldClass}
                >
                  {ROLLUP_FNS.map((fn) => (
                    <option key={fn} value={fn}>
                      {ROLLUP_LABEL[fn]}
                    </option>
                  ))}
                </select>
              </>
            )}

            {needsTargetColumn && throughRelationId && (
              <>
                <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {type === "lookup" ? "Show column" : "Over column"}
                </label>
                <select
                  value={targetColumnId}
                  onChange={(e) => setTargetColumnId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">
                    {targetColumns === null ? "Loading…" : "Choose a column…"}
                  </option>
                  {(targetColumns ?? [])
                    .filter((c) =>
                      type === "rollup" && rollupFn !== "join"
                        ? c.type === "number"
                        : c.type !== "relation" &&
                          c.type !== "lookup" &&
                          c.type !== "rollup"
                    )
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </>
            )}
          </>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={
              !name.trim() ||
              busy ||
              (type === "relation" && !targetDbId) ||
              (isDerived && !throughRelationId) ||
              (needsTargetColumn && !targetColumnId)
            }
            className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </PanelPortal>
    </div>
  );
}

// ── Edit ─────────────────────────────────────────────────────────────────

interface ColumnEditFormProps {
  column: DataColumn;
  onSave: (patch: {
    name: string;
    description: string | null;
    config?: DataColumnConfig;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Called after a successful save — dismiss the popover / collapse the row. */
  onClose: () => void;
  /** The popover autofocuses; the rail's inline form must not steal focus. */
  autoFocus?: boolean;
  /**
   * Checkbox columns only: check/uncheck every loaded row in one batch
   * (one undo entry). Provided by the grid, which owns the rows — the
   * context rail omits it and the buttons simply don't render.
   */
  onBulkSet?: (value: boolean) => void;
}

/** The header-menu popover: PanelPortal chrome around the shared form. */
export function ColumnMenu({
  column,
  onSave,
  onDelete,
  onClose,
  onBulkSet,
}: ColumnEditFormProps) {
  return (
    <PanelPortal open onDismiss={onClose}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {TYPE_LABEL[column.type] ?? column.type}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <ColumnEditForm
        column={column}
        onSave={onSave}
        onDelete={onDelete}
        onClose={onClose}
        onBulkSet={onBulkSet}
      />
    </PanelPortal>
  );
}

/**
 * Shared column editor — name, description, and per-type config (options
 * for select-likes, formatting for numbers). Rendered by BOTH the header
 * popover above and the context rail (DataSchemaRail), so the two editing
 * surfaces cannot drift.
 */
export function ColumnEditForm({
  column,
  onSave,
  onDelete,
  onClose,
  autoFocus = true,
  onBulkSet,
}: ColumnEditFormProps) {
  const [name, setName] = useState(column.name);
  const [description, setDescription] = useState(column.description ?? "");
  const [busy, setBusy] = useState(false);

  // Options editor (select / multiSelect / status). Cells store option IDS
  // (plan D3), so editing a label here renames it everywhere at once, and
  // removing an option orphans its id in cells — values are kept, display
  // goes blank — which is what makes re-adding or undoing non-destructive.
  const isSelectLike =
    column.type === "select" ||
    column.type === "multiSelect" ||
    column.type === "status";
  const [options, setOptions] = useState<SelectOption[]>(
    () => column.config.options ?? []
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  // Number formatting (display-only — cells keep raw numbers; precision
  // additionally rounds future edits at encode time, as it always has).
  const isNumber = column.type === "number";
  const [numberFormat, setNumberFormat] = useState<
    "plain" | "currency" | "percent"
  >(column.config.numberFormat ?? "plain");
  const [precisionText, setPrecisionText] = useState(
    column.config.precision !== undefined ? String(column.config.precision) : ""
  );
  const [currencyCode, setCurrencyCode] = useState(
    column.config.currencyCode ?? "USD"
  );
  const [useGrouping, setUseGrouping] = useState(
    column.config.useGrouping === true
  );

  const parsedPrecision = (() => {
    const trimmed = precisionText.trim();
    if (trimmed === "") return undefined;
    const n = Math.floor(Number(trimmed));
    return Number.isFinite(n) ? Math.max(0, Math.min(8, n)) : undefined;
  })();

  // Text: character limit (encoder rejects past it — never truncates).
  const isTextLike = column.type === "text" || column.type === "longText";
  const [maxLengthText, setMaxLengthText] = useState(
    column.config.maxLength !== undefined ? String(column.config.maxLength) : ""
  );

  // Date: whether the time component is meaningful (config.includeTime).
  const isDate = column.type === "date";
  const [includeTime, setIncludeTime] = useState(
    column.config.includeTime === true
  );

  // Checkbox: display variant, color, and new-row default. Display is
  // cosmetic — cells store booleans in every mode.
  const isCheckbox = column.type === "checkbox";
  const [checkDisplay, setCheckDisplay] = useState<
    NonNullable<DataColumnConfig["checkDisplay"]>
  >(column.config.checkDisplay ?? "checkbox");
  const [checkColor, setCheckColor] = useState<
    NonNullable<DataColumnConfig["checkColor"]>
  >(column.config.checkColor ?? "default");
  const [defaultChecked, setDefaultChecked] = useState(
    column.config.defaultChecked === true
  );

  const buildTextConfig = useCallback((): DataColumnConfig => {
    const next: DataColumnConfig = { ...column.config };
    delete next.maxLength;
    const trimmed = maxLengthText.trim();
    if (trimmed !== "") {
      const n = Math.floor(Number(trimmed));
      if (Number.isFinite(n) && n > 0) next.maxLength = Math.min(n, 100000);
    }
    return next;
  }, [column.config, maxLengthText]);

  const buildDateConfig = useCallback((): DataColumnConfig => {
    const next: DataColumnConfig = { ...column.config };
    delete next.includeTime;
    if (includeTime) next.includeTime = true;
    return next;
  }, [column.config, includeTime]);

  const buildCheckboxConfig = useCallback((): DataColumnConfig => {
    const next: DataColumnConfig = { ...column.config };
    delete next.checkDisplay;
    delete next.checkColor;
    delete next.defaultChecked;
    if (checkDisplay !== "checkbox") next.checkDisplay = checkDisplay;
    if (checkColor !== "default") next.checkColor = checkColor;
    if (defaultChecked) next.defaultChecked = true;
    return next;
  }, [column.config, checkDisplay, checkColor, defaultChecked]);

  const buildNumberConfig = useCallback((): DataColumnConfig => {
    const next: DataColumnConfig = { ...column.config };
    delete next.numberFormat;
    delete next.currencyCode;
    delete next.useGrouping;
    delete next.precision;
    if (numberFormat !== "plain") next.numberFormat = numberFormat;
    if (numberFormat === "currency") next.currencyCode = currencyCode;
    else if (useGrouping) next.useGrouping = true;
    if (parsedPrecision !== undefined) next.precision = parsedPrecision;
    return next;
  }, [column.config, numberFormat, currencyCode, useGrouping, parsedPrecision]);

  const addBulk = useCallback(() => {
    // One label per line; commas work too. Dedupe case-insensitively
    // against existing options AND within the pasted list itself.
    const seen = new Set(options.map((o) => o.label.trim().toLowerCase()));
    const fresh: SelectOption[] = [];
    for (const raw of bulkText.split(/[\n,]/)) {
      const label = raw.trim();
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      fresh.push({
        id: generateColumnKey(),
        label,
        ...(column.type === "status" ? { group: "todo" as StatusGroup } : {}),
      });
    }
    if (fresh.length > 0) setOptions((o) => [...o, ...fresh]);
    setBulkText("");
    setBulkOpen(false);
  }, [bulkText, options, column.type]);

  const save = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const cleaned = options
        .map((o) => ({ ...o, label: o.label.trim() }))
        .filter((o) => o.label);
      await onSave({
        name: trimmed,
        description: description.trim() || null,
        ...(isSelectLike
          ? { config: { ...column.config, options: cleaned } }
          : {}),
        ...(isNumber ? { config: buildNumberConfig() } : {}),
        ...(isTextLike ? { config: buildTextConfig() } : {}),
        ...(isDate ? { config: buildDateConfig() } : {}),
        ...(isCheckbox ? { config: buildCheckboxConfig() } : {}),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }, [
    name,
    description,
    options,
    isSelectLike,
    isNumber,
    buildNumberConfig,
    isTextLike,
    buildTextConfig,
    isDate,
    buildDateConfig,
    isCheckbox,
    buildCheckboxConfig,
    column.config,
    busy,
    onSave,
    onClose,
  ]);

  return (
    <>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Name
      </label>
      <input
        autoFocus={autoFocus}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
        className={fieldClass}
      />

      <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Description
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value.slice(0, 280))}
        rows={3}
        placeholder="What this column is for"
        className={cn(fieldClass, "resize-none")}
      />
      <div className="mt-1 flex items-baseline justify-between">
        <p className="text-[10px] leading-snug text-muted-foreground">
          Shown on hover, and given to the AI as context.
        </p>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {description.length}/280
        </span>
      </div>

      {column.type === "relation" && (
        <p className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
          This relation&apos;s database is set once. To link somewhere else, add a
          new column — deleting this one keeps its links and can be undone.
        </p>
      )}

      {isNumber && (
        <>
          <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Format
          </label>
          <select
            value={numberFormat}
            onChange={(e) =>
              setNumberFormat(e.target.value as "plain" | "currency" | "percent")
            }
            className={fieldClass}
          >
            <option value="plain">Plain number</option>
            <option value="currency">Currency</option>
            <option value="percent">Percent</option>
          </select>

          {numberFormat === "currency" && (
            <>
              <label className="mb-1 mt-2 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Currency
              </label>
              <select
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                className={fieldClass}
              >
                {CURRENCY_CODES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </>
          )}

          <label className="mb-1 mt-2 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Decimal places
          </label>
          <input
            inputMode="numeric"
            value={precisionText}
            onChange={(e) =>
              setPrecisionText(e.target.value.replace(/[^\d]/g, "").slice(0, 1))
            }
            placeholder={numberFormat === "currency" ? "Currency default" : "As typed"}
            className={fieldClass}
          />

          {numberFormat !== "currency" && (
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={useGrouping}
                onChange={(e) => setUseGrouping(e.target.checked)}
                className="h-3.5 w-3.5 accent-current"
              />
              Thousands separators
            </label>
          )}

          <p className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
            Preview:{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatNumberCell(
                { ...column, config: buildNumberConfig() },
                1234.5
              )}
            </span>
            {" · "}Cells keep the raw number — formatting is how it shows.
            {parsedPrecision !== undefined &&
              " Decimal places also round future edits."}
          </p>
        </>
      )}

      {isTextLike && (
        <>
          <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Character limit
          </label>
          <input
            inputMode="numeric"
            value={maxLengthText}
            onChange={(e) =>
              setMaxLengthText(e.target.value.replace(/[^\d]/g, "").slice(0, 6))
            }
            placeholder="No limit"
            className={fieldClass}
          />
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            New edits past the limit are rejected, never cut short. Existing
            longer values stay until touched.
          </p>
        </>
      )}

      {isDate && (
        <>
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={includeTime}
              onChange={(e) => setIncludeTime(e.target.checked)}
              className="h-3.5 w-3.5 accent-current"
            />
            Include time
          </label>
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            Cells open a date picker — with time, a date-and-time picker.
            Existing values keep what they stored.
          </p>
        </>
      )}

      {isCheckbox && (
        <>
          <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Display as
          </label>
          <select
            value={checkDisplay}
            onChange={(e) =>
              setCheckDisplay(
                e.target.value as NonNullable<DataColumnConfig["checkDisplay"]>
              )
            }
            className={fieldClass}
          >
            <option value="checkbox">Checkbox</option>
            <option value="check">✓ Check</option>
            <option value="star">★ Star</option>
            <option value="heart">♥ Heart</option>
            <option value="flag">⚑ Flag</option>
            <option value="thumbsUp">👍 Thumbs up</option>
            <option value="text">true / false text</option>
          </select>

          <label className="mb-1 mt-2 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Color
          </label>
          <select
            value={checkColor}
            onChange={(e) =>
              setCheckColor(
                e.target.value as NonNullable<DataColumnConfig["checkColor"]>
              )
            }
            className={fieldClass}
          >
            <option value="default">Default</option>
            <option value="blue">Blue</option>
            <option value="green">Green</option>
            <option value="amber">Amber</option>
            <option value="red">Red</option>
            <option value="purple">Purple</option>
          </select>

          <label className="mt-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={defaultChecked}
              onChange={(e) => setDefaultChecked(e.target.checked)}
              className="h-3.5 w-3.5 accent-current"
            />
            New rows start checked
          </label>
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            Display is cosmetic — cells store true/false in every mode, so
            filters keep working unchanged.
          </p>

          {onBulkSet && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onBulkSet(true);
                  onClose();
                }}
                className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Check all rows
              </button>
              <button
                type="button"
                onClick={() => {
                  onBulkSet(false);
                  onClose();
                }}
                className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Uncheck all
              </button>
            </div>
          )}
        </>
      )}

      {isSelectLike && (
        <>
          <label className="mb-1 mt-3 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Options
          </label>
          <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
            {options.map((o, i) => (
              <div key={o.id} className="flex items-center gap-1">
                <input
                  value={o.label}
                  onChange={(e) =>
                    setOptions((cur) =>
                      cur.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x
                      )
                    )
                  }
                  placeholder="Option label"
                  className={fieldClass}
                />
                {column.type === "status" && (
                  <select
                    value={o.group ?? "todo"}
                    onChange={(e) =>
                      setOptions((cur) =>
                        cur.map((x, j) =>
                          j === i
                            ? { ...x, group: e.target.value as StatusGroup }
                            : x
                        )
                      )
                    }
                    title="Board group"
                    className={cn(fieldClass, "w-24 shrink-0")}
                  >
                    <option value="todo">To do</option>
                    <option value="active">Active</option>
                    <option value="done">Done</option>
                  </select>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setOptions((cur) => cur.filter((_, j) => j !== i))
                  }
                  aria-label={`Remove option ${o.label || i + 1}`}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {options.length === 0 && (
              <p className="text-[10px] italic text-muted-foreground">
                No options yet — cells stay empty until some exist.
              </p>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setOptions((cur) => [
                  ...cur,
                  {
                    id: generateColumnKey(),
                    label: "",
                    ...(column.type === "status"
                      ? { group: "todo" as StatusGroup }
                      : {}),
                  },
                ])
              }
              className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              Add option
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen((b) => !b)}
              className="rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Bulk add…
            </button>
          </div>
          {bulkOpen && (
            <div className="mt-1.5">
              <textarea
                autoFocus
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={4}
                placeholder={"One option per line (commas work too)"}
                className={cn(fieldClass, "resize-none")}
              />
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBulkText("");
                    setBulkOpen(false);
                  }}
                  className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addBulk}
                  disabled={!bulkText.trim()}
                  className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-40"
                >
                  Add all
                </button>
              </div>
            </div>
          )}
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            Remember to Save. Renaming an option renames it everywhere;
            removing one blanks it in cells without erasing their data.
          </p>
        </>
      )}

      <div className="mt-3 flex items-center justify-between">
        {column.isPrimary ? (
          <span
            className="text-[10px] text-muted-foreground"
            title="Rows are titled from this column"
          >
            Primary column
          </span>
        ) : (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!name.trim() || busy}
          className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
        >
          <Check className="h-3 w-3" />
          Save
        </button>
      </div>
    </>
  );
}

"use client";

/**
 * A labelled toggle, matching the switch already used in DataSchemaRail so
 * the database feature reads as one surface.
 *
 * Checkboxes were the first cut and were wrong for these: every one of them
 * flips a behaviour that takes effect immediately, which is what a switch
 * says and a checkbox does not (a checkbox reads as staged, pending a Save
 * — the repo's own fieldset grammar). Owner call, 2026-09-16.
 */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  hint,
  indented = false,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** One short line. If it needs two, the setting needs a better name. */
  hint?: string;
  /** Sub-setting of the toggle above it. */
  indented?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={indented ? "mt-2 pl-6" : "mt-2"}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-foreground">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative h-4 w-7 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            checked ? "bg-emerald-500" : "bg-muted-foreground/30"
          }`}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
              checked ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      {hint && (
        <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

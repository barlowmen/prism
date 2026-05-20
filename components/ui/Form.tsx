"use client";

/**
 * Two form primitives that share the same label / help / input chrome:
 *
 *   - <Field>  for single-line inputs (URL, name, key).
 *   - <Area>   for multi-line textareas (matching hints, tailoring rules,
 *              question answers, etc.).
 *
 * Both take a `value` + `onChange(string)` pair rather than the native
 * ChangeEvent so callers don't have to think about input types — just
 * useState a string and pass the setter. Both turn off spellcheck
 * because most of what we type here is keys / slugs / markdown that
 * Chrome's spell-checker mangles.
 *
 * `mono` flips the input to the monospace token, used wherever the
 * content is structured (paths, IDs, markdown).
 *
 * For free-form code-shaped editors with line numbers etc., see
 * CodeArea — separate component, different surface treatment.
 */
import type { ChangeEvent, ReactNode } from "react";

type FieldProps = {
  label: ReactNode;
  help?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: "text" | "url";
  disabled?: boolean;
};

export function Field({ label, help, value, onChange, placeholder, mono, type = "text", disabled }: FieldProps) {
  return (
    <label className="block">
      <div className="text-xs font-medium mb-1">{label}</div>
      {help && (
        <div className="text-xs mb-1.5" style={{ color: "var(--color-fg-muted)" }}>
          {help}
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        className="w-full px-3 py-2 rounded-md border text-sm disabled:opacity-50"
        style={{
          background: "var(--color-surface-1)",
          borderColor: "var(--color-border)",
          fontFamily: mono ? "var(--font-mono)" : undefined,
        }}
      />
    </label>
  );
}

type AreaProps = {
  label: ReactNode;
  help?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  disabled?: boolean;
};

export function Area({ label, help, value, onChange, placeholder, rows = 8, mono, disabled }: AreaProps) {
  return (
    <label className="block">
      <div className="text-xs font-medium mb-1">{label}</div>
      {help && (
        <div className="text-xs mb-1.5" style={{ color: "var(--color-fg-muted)" }}>
          {help}
        </div>
      )}
      <textarea
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        spellCheck={false}
        className="w-full px-3 py-2 rounded-md border text-sm disabled:opacity-50"
        style={{
          background: "var(--color-surface-1)",
          borderColor: "var(--color-border)",
          fontFamily: mono ? "var(--font-mono)" : undefined,
          lineHeight: 1.5,
          resize: "vertical",
        }}
      />
    </label>
  );
}

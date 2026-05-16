"use client";

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

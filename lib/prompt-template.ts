import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

const PROMPTS_DIR = path.join(process.cwd(), "prompts");

/**
 * Lightweight mustache-ish substitution. Supports:
 *  - {{VAR}}             — replace with value (HTML-unescaped)
 *  - {{#VAR}}…{{/VAR}}   — keep block iff VAR is truthy (non-empty after trim)
 *  - {{^VAR}}…{{/VAR}}   — keep block iff VAR is falsy / missing / empty
 */
export async function loadPrompt(
  name: string,
  vars: Record<string, string | null | undefined>,
): Promise<string> {
  const raw = await fs.readFile(path.join(PROMPTS_DIR, name), "utf8");
  return applyVars(raw, vars);
}

export function applyVars(
  template: string,
  vars: Record<string, string | null | undefined>,
): string {
  const isTruthy = (name: string) => {
    const v = vars[name];
    return typeof v === "string" && v.trim().length > 0;
  };
  // Truthy blocks.
  let out = template.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, name, body) => (isTruthy(name) ? body : ""),
  );
  // Falsy / inverted blocks.
  out = out.replace(
    /\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, name, body) => (isTruthy(name) ? "" : body),
  );
  // Plain substitutions.
  out = out.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const v = vars[name];
    return v == null ? "" : String(v);
  });
  return out;
}

import "server-only";
import fs from "node:fs/promises";
import mammoth from "mammoth";

/**
 * Render a .docx file to HTML for in-browser preview. Read-only — the
 * user edits in Word, not the browser. Returns null if the file is
 * missing.
 */
export async function renderDocxToHtml(absPath: string): Promise<{
  html: string;
  messages: string[];
} | null> {
  try {
    const buffer = await fs.readFile(absPath);
    const result = await mammoth.convertToHtml({ buffer });
    return {
      html: result.value,
      messages: result.messages.map((m) => `${m.type}: ${m.message}`),
    };
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

export async function readDocxBytes(absPath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(absPath);
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

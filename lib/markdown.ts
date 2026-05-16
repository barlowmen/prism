import "server-only";
/**
 * Markdown → HTML on the server. Used by every page that shows
 * agent-written markdown (job detail tabs, prep panes, etc.). GFM on,
 * autolinking off (line breaks come from real <br> only).
 */
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
});

export async function renderMarkdown(text: string): Promise<string> {
  return marked.parse(text);
}

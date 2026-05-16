import "server-only";
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
});

export async function renderMarkdown(text: string): Promise<string> {
  return marked.parse(text);
}

export type ChatMessage = {
  /** Message id (UUID). Stable across reloads. */
  id: string;
  role: "user" | "assistant" | "system";
  /** Plain text content for the user-facing thread view. For assistant
   *  messages, this is the final assistant text. For system, ignored. */
  text: string;
  /** ISO timestamp. */
  at: string;
  /** For assistant messages, link back to the agent run that produced it. */
  runId?: string;
  /** For assistant messages, status of the underlying run. */
  status?: "running" | "completed" | "failed" | "cancelled";
  /** For user messages, the context snapshot the UI sent with the message. */
  context?: ChatContextSnapshot | null;
};

export type ChatContextSnapshot = {
  pathname: string;
  /** Page-supplied summary, ~2000 chars max. */
  summary?: string | null;
  /** Job id if viewing a job, or null. */
  jobId?: string | null;
  /** Free-form structured hints. */
  extras?: Record<string, string | number | null | undefined>;
};

export type ChatThread = {
  /** Internal thread id (UUID). Used in URLs and on disk. */
  id: string;
  /** Captured from Claude Code's `system:init.session_id` on the first
   *  message; passed back via `--resume` on subsequent messages. */
  claudeSessionId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

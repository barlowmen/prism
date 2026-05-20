/**
 * Detect whether a dispatcher_question.md / questions.md file has an
 * "open" question — i.e. the agent asked something but no user answer
 * has been written yet.
 *
 * The naive regex `/^##\s+Answer/im` used to work, but the dispatcher
 * agent now writes an empty placeholder section ("## Answer\n\n<!-- Add
 * your responses here -->") at the bottom of the question file as a
 * UX hint for users reading the markdown directly. The naive check
 * sees the placeholder heading and concludes "already answered" — so
 * the dashboard hides the answer textarea and the user is stuck.
 *
 * Real fix: look at the content UNDER each `## Answer` heading. If
 * everything below it is just whitespace and HTML comments (the
 * placeholder shape), it's still open. Real answers — either
 * timestamped ones written by /api/jobs/[id]/answer-question, or
 * hand-typed ones the user added directly — have substantive text
 * underneath.
 */
export function isQuestionAnswered(content: string | null | undefined): boolean {
  if (!content) return false;
  const matches = [...content.matchAll(/^##\s+Answer[^\n]*$/gim)];
  if (matches.length === 0) return false;
  for (const m of matches) {
    const startIdx = (m.index ?? 0) + m[0].length;
    const after = content.slice(startIdx);
    // Stop at the next `##` heading (any next section terminates this Answer).
    const nextHeading = after.search(/^##\s/m);
    const section = nextHeading >= 0 ? after.slice(0, nextHeading) : after;
    // Strip HTML comments; if anything substantive remains, the
    // answer is real.
    const cleaned = section.replace(/<!--[\s\S]*?-->/g, "").trim();
    if (cleaned.length > 0) return true;
  }
  return false;
}

/** True if `content` contains a question file that's still open (asked
 *  but not answered). Empty or missing content counts as "no question." */
export function hasOpenQuestion(content: string | null | undefined): boolean {
  if (!content || content.trim().length === 0) return false;
  return !isQuestionAnswered(content);
}

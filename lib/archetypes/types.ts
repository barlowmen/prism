/**
 * An **Archetype** is a *base resume* plus the metadata describing when the
 * dispatcher should pick it for a job posting. Examples for one user:
 *
 *  - { key: "ai", label: "AI / Frontier", baseResumePath: "_resumes/Foo_AI.docx", ... }
 *  - { key: "cloud", label: "Cloud Director", baseResumePath: "_resumes/Foo_Cloud.docx", ... }
 *
 * Career archetypes (per-role positioning targets) live in
 * `_meta/about_user.md` under "Tailoring playbook by archetype". Those are
 * many-to-one with base resumes — multiple career archetypes can map to
 * the same base. Base archetypes are what the dispatcher picks; career
 * archetypes are what the drafting agent reads to fine-tune.
 */
export type BaseStatus =
  | "none"
  | "generating"
  | "reviewing"
  | "ready"
  | "stalled"
  | "errored";

export type Archetype = {
  /** Filesystem-safe slug, lowercase, used as the file basename. */
  key: string;
  /** Human-readable label shown in the UI and used in dispatcher output. */
  label: string;
  /** What this archetype is for — who it serves, what kinds of roles. */
  description: string;
  /** Markdown describing the JD signals that should route a posting here.
   *  The dispatcher reads this verbatim when picking an archetype. */
  matchingHints: string;
  /** Workspace-relative path (workspace-relative) of the base
   *  resume DOCX. Empty if not yet uploaded. */
  baseResumePath: string;
  /** Optional per-archetype tailoring rules (markdown). Augments
   *  about_user.md's tailoring playbook section. */
  tailoringRules: string;
  createdAt: string;
  updatedAt: string;
  /** State of the base-resume generation loop. Defaults to 'none'. */
  baseStatus: BaseStatus;
  /** Current pass count in the generate↔review loop. 0 when idle. */
  baseReviewPass: number;
  /** Run ID of the most recent base-generation or base-review run. */
  baseLatestRunId: string | null;
  /** Last HM feedback verbatim — used by 'Accept anyway' UX + debugging. */
  baseLastFeedback: string;
  /** ISO timestamp the base DOCX was last produced by the generator. */
  baseGeneratedAt: string | null;
};

export type ArchetypeSummary = {
  key: string;
  label: string;
  description: string;
  baseResumePath: string;
  baseResumeExists: boolean;
  baseResumeSize: number | null;
  baseResumeMtimeMs: number | null;
  createdAt: string;
  updatedAt: string;
  baseStatus: BaseStatus;
  baseReviewPass: number;
  baseLatestRunId: string | null;
};

import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { APPS_DIR, PREP_DIR } from "../paths";
import { findPrimaryRoleFolder } from "./store";
import { PREP_TEMPLATES, type TemplateContext } from "./templates";

export type BootstrapFinding = {
  relPath: string;
  status: "created" | "already_exists";
};

export type BootstrapResult = {
  company: string;
  prepDir: string;
  findings: BootstrapFinding[];
};

/**
 * Create the prep/<Company>/ folder if needed and write the standard
 * template set. Idempotent — existing files are never overwritten; the
 * status field reports which files were freshly created.
 *
 * If apps/<Company>/<Role>/research/company_research.md exists, it gets
 * inlined into 00-overview.md so the user has the dispatcher's research
 * notes right there as starting context.
 */
export async function bootstrapPrep(company: string): Promise<BootstrapResult> {
  const prepDir = path.join(PREP_DIR, company);
  await fs.mkdir(prepDir, { recursive: true });

  const ctx = await buildContext(company);

  const findings: BootstrapFinding[] = [];
  for (const tpl of PREP_TEMPLATES) {
    const abs = path.join(prepDir, tpl.relPath);
    let exists = false;
    try {
      await fs.stat(abs);
      exists = true;
    } catch {}
    if (exists) {
      findings.push({ relPath: tpl.relPath, status: "already_exists" });
      continue;
    }
    const body = tpl.render(ctx);
    await fs.writeFile(abs, body, "utf8");
    findings.push({ relPath: tpl.relPath, status: "created" });
  }

  return { company, prepDir, findings };
}

async function buildContext(company: string): Promise<TemplateContext> {
  const ctx: TemplateContext = { company, role: "" };
  const primary = await findPrimaryRoleFolder(company);
  if (primary) {
    ctx.role = primary.role.replace(/_/g, " ");
    const researchPath = path.join(primary.absPath, "research", "company_research.md");
    try {
      ctx.companyResearch = await fs.readFile(researchPath, "utf8");
    } catch {}
  }
  return ctx;
}

/**
 * Verify the company has an apps/<Company>/ folder. The UI uses this to
 * surface a "Bootstrap prep" affordance only when there's a real
 * application to anchor the prep work against.
 */
export async function companyHasApps(company: string): Promise<boolean> {
  try {
    await fs.stat(path.join(APPS_DIR, company));
    return true;
  } catch {
    return false;
  }
}

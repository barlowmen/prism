// Template for the draft agent — DO NOT run this directly.
//
// The draft agent (§4 of workflow.md) reads this file as a structural
// reference, then writes its own tailored `build_resume.js` into
// apps/<Company>/<Role>/ per the JD + about_user.md + the chosen
// archetype's base resume.
//
// Style baseline conforms to _meta/resume_style_guide_2026.md:
//   Calibri 11, US Letter, 0.5"–0.75" margins, single column,
//   reverse-chronological, no tables in role headers (tab stops only),
//   bold company/title, right-aligned dates.
//
// The helpers below are the canonical block constructors. The agent
// should reuse them by inlining their definitions into the per-job
// script (the per-job script runs in the per-app folder and shouldn't
// depend on the workspace `_meta/` path).

const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  TabStopType,
  TabStopPosition,
  BorderStyle,
} = require("docx");

// ---------- helpers (reusable building blocks) ----------

const FONT = "Calibri";
const BODY = 22;   // 11pt — see style guide §1 fonts rule
const SMALL = 19;  // 9.5pt — contact line, small captions

/** Name line — large, centered, bold. */
function nameLine(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text, font: FONT, size: 34, bold: true })],
  });
}

/** Contact line — small, centered, single line. Pipe separators. */
function contactLine(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text, font: FONT, size: SMALL })],
  });
}

/** Section heading — uppercase, bold, bottom border, modest top space. */
function sectionHeading(text) {
  return new Paragraph({
    spacing: { before: 120, after: 40 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 },
    },
    children: [
      new TextRun({ text: text.toUpperCase(), font: FONT, size: 22, bold: true }),
    ],
  });
}

/** Role header — two lines: bold title with right-aligned dates,
 *  then italic company + location. NO TABLES. Tab stops only. */
function roleHeader({ title, companyLoc, dates }) {
  return [
    new Paragraph({
      spacing: { before: 100, after: 0 },
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      children: [
        new TextRun({ text: title, font: FONT, size: BODY, bold: true }),
        new TextRun({ text: "\t" + dates, font: FONT, size: BODY, bold: true }),
      ],
    }),
    new Paragraph({
      spacing: { after: 20 },
      children: [
        new TextRun({ text: companyLoc, font: FONT, size: BODY, italics: true }),
      ],
    }),
  ];
}

/** Bullet — supports either a plain string or an array of {text, bold}
 *  spans for inline emphasis (e.g., bolding a budget figure). */
function bullet(text) {
  const children =
    typeof text === "string"
      ? [new TextRun({ text, font: FONT, size: BODY })]
      : text.map(
          (r) =>
            new TextRun({ text: r.text, font: FONT, size: BODY, bold: !!r.bold }),
        );
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 20 },
    children,
  });
}

/** A non-bulleted body line (rare — most content is bullets or skills lines). */
function plainLine(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 20 },
    children: [new TextRun({ text, font: FONT, size: BODY, ...opts })],
  });
}

/** Skills line — "Label: value …" with the label in bold. */
function skillsLine(label, value) {
  return new Paragraph({
    spacing: { after: 20 },
    children: [
      new TextRun({ text: label + " ", font: FONT, size: BODY, bold: true }),
      new TextRun({ text: value, font: FONT, size: BODY }),
    ],
  });
}

/** Education line — bold degree, plain school, right-aligned date/focus. */
function eduLine({ degree, school, dateOrFocus }) {
  return new Paragraph({
    spacing: { after: 20 },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      new TextRun({ text: degree, font: FONT, size: BODY, bold: true }),
      new TextRun({ text: " — " + school, font: FONT, size: BODY }),
      new TextRun({ text: "\t" + (dateOrFocus || ""), font: FONT, size: BODY }),
    ],
  });
}

// ---------- content (illustrative skeleton; the agent rewrites this entirely) ----------

const children = [];

// Name + contact — pulled from `about_user.md` "Education & credentials" or top of file.
children.push(nameLine("FIRST LAST"));
children.push(contactLine("email  |  phone  |  linkedin.com/in/handle  |  Location (Remote)"));

// SUMMARY — 3–4 lines, mirror role language, front-load scope. See style guide §3.
children.push(sectionHeading("Summary"));
children.push(
  plainLine(
    "Scope-leading line drawn from about_user.md (named programs, budget, headcount). Forward-looking research/thesis hook. Role target last. No adjectives. No 'results-driven'.",
  ),
);

// EXPERIENCE — reverse-chronological, role header + bullets per role.
children.push(sectionHeading("Experience"));
children.push(
  ...roleHeader({
    title: "Current Title (scope clarifier per style guide §4)",
    companyLoc: "Company, City, ST",
    dates: "Month YYYY – present",
  }),
);
children.push(bullet("Mechanism + quantification + outcome bullet. See style guide §3."));
children.push(bullet("Every skill in the Skills section must appear in a bullet (style guide §2)."));

// SKILLS — inline, comma-separated. No matrices. No proficiency bars.
children.push(sectionHeading("Skills"));
children.push(skillsLine("Cloud:", "AWS, Azure, GCP, OCI"));
children.push(skillsLine("AI/ML:", "MLOps pipelines, LLM gateway, RAG, evaluation programs"));

// EDUCATION — degree, school, term. In-progress credentials use exact about_user.md wording.
children.push(sectionHeading("Education"));
children.push(
  eduLine({
    degree: "Degree, Field",
    school: "Institution",
    dateOrFocus: "YYYY – YYYY",
  }),
);

// ---------- document assembly ----------

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: "bullet",
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360, hanging: 200 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // US Letter
          margin: { top: 720, right: 720, bottom: 720, left: 720 }, // 0.5"
        },
      },
      children,
    },
  ],
});

// The per-job script writes the DOCX to its own apps/<Company>/<Role>/ folder.
// This template does not — it's structural reference only.
const outPath = process.argv[2];
if (!outPath) {
  console.error("Usage: node build_resume.js <output.docx>");
  console.error("This file is a TEMPLATE — the draft agent writes its own per-job build script.");
  process.exit(2);
}

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log("Wrote", outPath, buf.length, "bytes");
});

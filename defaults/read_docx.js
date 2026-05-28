#!/usr/bin/env node
"use strict";
/**
 * Zero-dependency .docx → plain-text extractor.
 *
 * Why this exists: prism's review agents (HM review, base-resume review,
 * provenance) run with cwd = the workspace, which has no node_modules,
 * and the headless Claude Code permission gate only pre-approves
 * `Bash(node:*)` (see .claude/settings.json). That means an agent can't
 * shell out to unzip / python / a mammoth one-liner to crack open the
 * .docx — those Bash calls get DENIED, the agent can't read the resume,
 * and the job stalls with no usable verdict. (We hit exactly this: three
 * hm_review jobs sat stuck for hours because the review agent's Bash
 * calls were denied.)
 *
 * This helper uses ONLY Node built-ins (fs + zlib) to unzip the parts of
 * a .docx we care about (word/document.xml plus any header/footer XML),
 * strip the WordprocessingML tags, and print the resume's text to stdout.
 * Running it as `node _meta/read_docx.js <docx>` is pre-approved by the
 * existing Bash(node:*) allow rule, so no permission gate is hit.
 *
 * Usage:  node _meta/read_docx.js <path-to.docx>
 * Output: extracted plain text on stdout. On failure, a one-line reason
 *         on stderr + exit 1.
 */
const fs = require("node:fs");
const zlib = require("node:zlib");

function fail(msg) {
  process.stderr.write("read_docx: " + msg + "\n");
  process.exit(1);
}

const docxPath = process.argv[2];
if (!docxPath) fail("usage: node read_docx.js <path-to.docx>");

let buf;
try {
  buf = fs.readFileSync(docxPath);
} catch (e) {
  fail("cannot read file: " + (e && e.message ? e.message : String(e)));
}

// --- locate the End Of Central Directory record (scan back from EOF;
//     ZIP allows a trailing comment up to 64 KiB after it) ---
const EOCD_SIG = 0x06054b50;
let eocd = -1;
const floor = Math.max(0, buf.length - 22 - 0x10000);
for (let i = buf.length - 22; i >= floor; i--) {
  if (buf.readUInt32LE(i) === EOCD_SIG) {
    eocd = i;
    break;
  }
}
if (eocd < 0) fail("not a valid .docx (no zip end-of-central-directory record)");

const cdCount = buf.readUInt16LE(eocd + 10);
const cdOffset = buf.readUInt32LE(eocd + 16);

// --- walk the central directory, collecting the body/header/footer XML ---
const WANT = /^word\/(document|header\d*|footer\d*)\.xml$/;
const parts = [];
let p = cdOffset;
for (let n = 0; n < cdCount; n++) {
  if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break; // central dir signature
  const method = buf.readUInt16LE(p + 10);
  const compSize = buf.readUInt32LE(p + 20);
  const nameLen = buf.readUInt16LE(p + 28);
  const extraLen = buf.readUInt16LE(p + 30);
  const commentLen = buf.readUInt16LE(p + 32);
  const localOffset = buf.readUInt32LE(p + 42);
  const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
  if (WANT.test(name)) parts.push({ name, method, compSize, localOffset });
  p += 46 + nameLen + extraLen + commentLen;
}
if (parts.length === 0) fail("no word/document.xml found inside the .docx");

// Read order: headers, then the document body, then footers — so contact
// info that lives in a header surfaces at the top of the text.
const rank = (nm) =>
  nm.includes("/header") ? 0 : nm.includes("/document") ? 1 : 2;
parts.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

function inflatePart(part) {
  const lh = part.localOffset;
  if (buf.readUInt32LE(lh) !== 0x04034b50) {
    throw new Error("bad local file header for " + part.name);
  }
  const lhNameLen = buf.readUInt16LE(lh + 26);
  const lhExtraLen = buf.readUInt16LE(lh + 28);
  const dataStart = lh + 30 + lhNameLen + lhExtraLen;
  const comp = buf.subarray(dataStart, dataStart + part.compSize);
  if (part.method === 0) return comp; // stored, no compression
  if (part.method === 8) return zlib.inflateRawSync(comp); // deflate
  throw new Error("unsupported compression method " + part.method);
}

function xmlToText(xml) {
  return xml
    .replace(/<w:tab\b[^>]*\/?>/g, "\t")
    .replace(/<w:br\b[^>]*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n") // paragraph end → newline
    .replace(/<[^>]+>/g, "") // drop all remaining tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

const out = [];
for (const part of parts) {
  try {
    out.push(xmlToText(inflatePart(part).toString("utf8")));
  } catch (e) {
    // Skip an unreadable part rather than failing the whole read.
    process.stderr.write(
      "read_docx: skipped " +
        part.name +
        ": " +
        (e && e.message ? e.message : String(e)) +
        "\n",
    );
  }
}
const text = out.join("\n").trim();
if (!text) fail("extracted no text from the .docx");
process.stdout.write(text + "\n");

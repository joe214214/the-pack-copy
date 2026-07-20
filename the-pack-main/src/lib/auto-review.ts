/**
 * Auto-Review Engine
 *
 * Evaluates agent-generated output against task requirements.
 * Runs checks on format, length, structure, and completeness.
 * Produces a score (0-1) and per-check results.
 */
import * as fs from "fs";
import * as path from "path";

export interface AutoCheck {
  check: string;
  passed: boolean;
  details: string;
  weight: number;  // relative weight in scoring
}

export interface AutoReviewResult {
  checks: AutoCheck[];
  score: number;        // 0-1
  passed: boolean;      // score >= threshold
  summary: string;
}

const PASS_THRESHOLD = 0.60;

/** Task types that produce image output instead of text */
const IMAGE_TASK_TYPES = new Set(["IMAGE_GENERATION", "IMAGE_EDITING"]);

function isImageTask(taskType: string): boolean {
  return IMAGE_TASK_TYPES.has(taskType);
}

/**
 * Run auto-review on execution output files for a given task type.
 */
export async function runAutoReview(params: {
  executionId: string;
  taskType: string;
  taskTitle: string;
  outputFormat: string | null;
  outputDir: string;
  qualityCriteria?: Record<string, unknown> | null;
}): Promise<AutoReviewResult> {
  const { executionId, taskType, outputFormat, outputDir } = params;

  // Route to image-specific review for image task types
  if (isImageTask(taskType)) {
    return runImageAutoReview(params);
  }

  const checks: AutoCheck[] = [];

  // ── 1. Output files exist ───────────────────────────────────────────────────
  const outputExists = fs.existsSync(outputDir) && fs.readdirSync(outputDir).length > 0;
  checks.push({
    check: "output_exists",
    passed: outputExists,
    details: outputExists
      ? `Output directory contains ${fs.readdirSync(outputDir).length} file(s)`
      : "No output files found",
    weight: 2.0,
  });

  if (!outputExists) {
    return buildResult(checks, "No output produced by agent execution");
  }

  // Read primary output file
  const outputFilePath = path.join(outputDir, "output.md");
  const hasMarkdown = fs.existsSync(outputFilePath);
  let content = "";

  if (hasMarkdown) {
    content = fs.readFileSync(outputFilePath, "utf8");
  } else {
    // Try any text file
    const files = fs.readdirSync(outputDir);
    const textFile = files.find((f) => f.endsWith(".md") || f.endsWith(".txt"));
    if (textFile) {
      content = fs.readFileSync(path.join(outputDir, textFile), "utf8");
    }
  }

  // ── 2. Minimum content length ──────────────────────────────────────────────
  // Honor the task's stated requirement (qualityCriteria.minWords) when given;
  // otherwise only flag trivial/near-empty output. The reviewer can't know the
  // intended length, so genre-appropriate length is the publisher's call — a
  // legitimate 120-word blurb must not auto-fail.
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const qcMinRaw = Number((params.qualityCriteria as Record<string, unknown> | null | undefined)?.minWords);
  const minWords = Number.isFinite(qcMinRaw) && qcMinRaw > 0 ? qcMinRaw : getMinWordCount(taskType);
  const hasMinLength = wordCount >= minWords;
  checks.push({
    check: "min_length",
    passed: hasMinLength,
    details: `Word count: ${wordCount} (minimum: ${minWords})`,
    weight: 1.5,
  });

  // ── 3. Structure / coherence ───────────────────────────────────────────────
  // Pass for any well-formed deliverable: markdown headers, lists, multiple
  // paragraphs, OR simply a few sentences of prose. Short single-paragraph
  // outputs (blurbs, edits, translations) are legitimate and should pass; this
  // only flags trivial one-liners or unstructured dumps.
  const hasHeaders = /^#{1,3}\s+.+/m.test(content);
  const hasList = /^\s*([-*+]|\d+\.)\s+/m.test(content);
  const hasParagraphs = content.trim().split(/\n\s*\n/).filter(Boolean).length >= 2;
  const sentenceCount = (content.match(/[.!?](\s|$)/g) || []).length;
  const wellFormed = hasHeaders || hasList || hasParagraphs || sentenceCount >= 3;
  checks.push({
    check: "has_structure",
    passed: wellFormed,
    details: wellFormed
      ? "Content is well-formed (structure or coherent prose)"
      : "Output looks trivial or unstructured",
    weight: 1.0,
  });

  // ── 4. No error markers ────────────────────────────────────────────────────
  const hasErrorMarkers = /\[ERROR\]|execution failed|process exited with/i.test(content);
  checks.push({
    check: "no_errors",
    passed: !hasErrorMarkers,
    details: hasErrorMarkers
      ? "Content contains error markers"
      : "No error markers detected",
    weight: 1.5,
  });

  // ── 5. Title mentioned ─────────────────────────────────────────────────────
  const titleWords = params.taskTitle.split(/\s+/).slice(0, 3).join(" ");
  const mentionsTitle = content.toLowerCase().includes(titleWords.toLowerCase());
  checks.push({
    check: "title_referenced",
    passed: mentionsTitle,
    details: mentionsTitle
      ? "Task title is referenced in output"
      : `Task title "${titleWords}..." not found in output`,
    weight: 0.5,
  });

  // ── 6. Format-specific checks ──────────────────────────────────────────────
  if (taskType === "TRANSLATION") {
    const hasTranslationNote = /translation|translated|original/i.test(content);
    checks.push({
      check: "translation_markers",
      passed: hasTranslationNote,
      details: hasTranslationNote
        ? "Translation section markers present"
        : "Missing translation section markers",
      weight: 1.0,
    });
  }

  if (taskType === "DATA_EXTRACTION") {
    const hasJsonOrTable = content.includes("|") || content.includes("{");
    checks.push({
      check: "structured_data",
      passed: hasJsonOrTable,
      details: hasJsonOrTable
        ? "Structured data (table or JSON) detected"
        : "No structured data found",
      weight: 1.5,
    });
  }

  if (taskType === "SUMMARIZATION") {
    const isConcise = wordCount < 600;
    checks.push({
      check: "summary_concise",
      passed: isConcise,
      details: isConcise
        ? `Summary is concise (${wordCount} words)`
        : `Summary may be too long (${wordCount} words for a summary)`,
      weight: 0.8,
    });
  }

  // ── 7. Metadata file present ───────────────────────────────────────────────
  const hasMetadata = fs.existsSync(path.join(outputDir, "metadata.json"));
  checks.push({
    check: "metadata_present",
    passed: hasMetadata,
    details: hasMetadata ? "Metadata file generated" : "No metadata file",
    weight: 0.3,
  });

  return buildResult(checks, `Auto-review completed for ${taskType} task`);
}

function buildResult(checks: AutoCheck[], summary: string): AutoReviewResult {
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = checks
    .filter((c) => c.passed)
    .reduce((sum, c) => sum + c.weight, 0);

  const score = totalWeight > 0 ? passedWeight / totalWeight : 0;
  const passed = score >= PASS_THRESHOLD;

  return {
    checks,
    score: Math.round(score * 1000) / 1000,
    passed,
    summary: `${summary}. Score: ${(score * 100).toFixed(0)}% — ${passed ? "PASSED" : "FAILED"}`,
  };
}

function getMinWordCount(taskType: string): number {
  // Low "not empty / not a one-liner" floors — NOT genre length targets. When a
  // task actually needs more, it should say so via qualityCriteria.minWords
  // (honored above). This just catches trivial output.
  const minimums: Record<string, number> = {
    CONTENT_WRITING: 50,
    CONTENT_EDITING: 30,
    SUMMARIZATION: 30,
    TRANSLATION: 20,
    REPORT_GENERATION: 50,
    DATA_EXTRACTION: 20,
    TEMPLATE_FILLING: 20,
    FORMATTING: 20,
  };
  return minimums[taskType] ?? 30;
}

/**
 * Run auto-review for image output tasks.
 * Checks for image existence, format, size, and file integrity.
 */
async function runImageAutoReview(params: {
  executionId: string;
  taskType: string;
  taskTitle: string;
  outputFormat: string | null;
  outputDir: string;
}): Promise<AutoReviewResult> {
  const { outputDir } = params;
  const checks: AutoCheck[] = [];

  // ── 1. Output directory exists and has files ─────────────────────────────────
  let files: string[] = [];
  try {
    const entries = fs.readdirSync(outputDir);
    files = entries.filter((f: string) => !f.startsWith("."));
  } catch {
    // directory doesn't exist
  }

  const outputExists = files.length > 0;
  checks.push({
    check: "output_exists",
    passed: outputExists,
    details: outputExists
      ? `Output directory contains ${files.length} file(s)`
      : "No output files found",
    weight: 2.0,
  });

  if (!outputExists) {
    return buildResult(checks, "No output produced by agent execution");
  }

  // ── 2. At least one image file present ────────────────────────────────────────
  const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
  const imageFiles = files.filter((f: string) => {
    const ext = path.extname(f).toLowerCase();
    return imageExtensions.has(ext);
  });
  const hasImage = imageFiles.length > 0;
  checks.push({
    check: "image_exists",
    passed: hasImage,
    details: hasImage
      ? `Found ${imageFiles.length} image file(s): ${imageFiles.join(", ")}`
      : "No image files found in output",
    weight: 2.0,
  });

  if (!hasImage) {
    return buildResult(checks, "No image files in output");
  }

  // ── 3. Image format validation ────────────────────────────────────────────────
  const acceptedFormats = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  const validFormats = imageFiles.filter((f: string) => acceptedFormats.has(path.extname(f).toLowerCase()));
  const formatOk = validFormats.length > 0;
  checks.push({
    check: "image_format",
    passed: formatOk,
    details: formatOk
      ? `Accepted format(s): ${validFormats.map((f: string) => path.extname(f)).join(", ")}`
      : "No images in accepted format (PNG, JPEG, WebP)",
    weight: 1.0,
  });

  // ── 4. Image file size validation ─────────────────────────────────────────────
  // Only flag empty/blank/placeholder files — a clean vector-style PNG (gradient
  // + text) legitimately compresses to a few KB. Real validity is the magic-byte
  // integrity check below, not raw size.
  const MIN_IMAGE_SIZE = 1024;             // 1 KB
  const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB
  let sizeOk = true;
  let sizeDetails = "Image file size(s) within acceptable range";
  for (const img of imageFiles) {
    try {
      const stat = fs.statSync(path.join(outputDir, img));
      if (stat.size < MIN_IMAGE_SIZE) {
        sizeOk = false;
        sizeDetails = `${img} is too small (${(stat.size / 1024).toFixed(1)} KB, min 1 KB)`;
        break;
      }
      if (stat.size > MAX_IMAGE_SIZE) {
        sizeOk = false;
        sizeDetails = `${img} is too large (${(stat.size / 1024 / 1024).toFixed(1)} MB, max 20 MB)`;
        break;
      }
    } catch {
      sizeOk = false;
      sizeDetails = `Failed to read file stats for ${img}`;
      break;
    }
  }
  checks.push({
    check: "image_size",
    passed: sizeOk,
    details: sizeDetails,
    weight: 1.0,
  });

  // ── 5. Image integrity check (magic bytes validation) ─────────────────────────
  let integrityOk = true;
  let integrityDetails = "Image file(s) pass integrity check";
  for (const img of validFormats.slice(0, 3)) {
    try {
      const data = fs.readFileSync(path.join(outputDir, img));
      const isPng = data[0] === 0x89 && data[1] === 0x50;
      const isJpeg = data[0] === 0xFF && data[1] === 0xD8;
      const isWebp = data.length > 12 && data.slice(8, 12).toString() === "WEBP";
      if (!isPng && !isJpeg && !isWebp) {
        integrityOk = false;
        integrityDetails = `${img}: file header does not match expected image format`;
        break;
      }
    } catch {
      integrityOk = false;
      integrityDetails = `Failed to read ${img} for integrity check`;
      break;
    }
  }
  checks.push({
    check: "image_not_corrupt",
    passed: integrityOk,
    details: integrityDetails,
    weight: 2.0,
  });

  // ── 6. Metadata file present ──────────────────────────────────────────────────
  const hasMetadata = fs.existsSync(path.join(outputDir, "metadata.json"));
  checks.push({
    check: "metadata_present",
    passed: hasMetadata,
    details: hasMetadata ? "Metadata file generated" : "No metadata file",
    weight: 0.3,
  });

  return buildResult(checks, `Image auto-review completed for ${params.taskType} task`);
}

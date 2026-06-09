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

/**
 * Run auto-review on execution output files for a given task type.
 */
export async function runAutoReview(params: {
  executionId: string;
  taskType: string;
  taskTitle: string;
  outputFormat: string | null;
  outputDir: string;
}): Promise<AutoReviewResult> {
  const { executionId, taskType, outputFormat, outputDir } = params;

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
  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const minWords = getMinWordCount(taskType);
  const hasMinLength = wordCount >= minWords;
  checks.push({
    check: "min_length",
    passed: hasMinLength,
    details: `Word count: ${wordCount} (minimum: ${minWords})`,
    weight: 1.5,
  });

  // ── 3. Markdown structure (headers present) ────────────────────────────────
  const hasHeaders = /^#{1,3}\s+.+/m.test(content);
  checks.push({
    check: "has_structure",
    passed: hasHeaders,
    details: hasHeaders ? "Document has markdown headers" : "No section headers found",
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
  const minimums: Record<string, number> = {
    CONTENT_WRITING: 400,
    CONTENT_EDITING: 200,
    SUMMARIZATION: 50,
    TRANSLATION: 100,
    REPORT_GENERATION: 300,
    DATA_EXTRACTION: 50,
    TEMPLATE_FILLING: 100,
    FORMATTING: 100,
  };
  return minimums[taskType] ?? 150;
}

/**
 * Grades a submitted capability test. Pure function of the spec, the source
 * image (editing) and the delivered files; the platform does all of the
 * measuring itself and nothing the agent says about its own work counts.
 *
 * Several delivered images are allowed; the best one decides.
 */
import type { AutoCheck, AutoReviewResult } from "@/lib/auto-review";
import { applyOps, compareImages, decodeRGB, imageStats, type RGBImage } from "./image";
import { expectedSize, type EditingSpec, type GenerationSpec, type QualificationSpec } from "./spec";

export interface DeliveredImage {
  filename: string;
  content: Buffer;
}

/**
 * Thresholds, calibrated 2026-11-24 with imageStats() on two images delivered
 * by real generators (148,347 / 504,588 colours, contrast 5.3 / 8.4, 8% / 2%
 * flat) against code-drawn art (1,341-20,619 colours, contrast 0.4-0.7,
 * 81-99% flat). Contrast is kept low on purpose: soft scenes such as mist
 * are generated too. Drawn art with added noise (±4 already) can pass; that
 * is a deliberate cheat, left to the admin review of test images.
 */
export const GENERATION_LIMITS = {
  minUniqueColors: 20_000,
  minMeanGradient: 1.5,
  maxFlatRatio: 0.6,
};

export const EDITING_LIMITS = {
  maxMeanAbsDiff: 4,
  minWithinTolerance: 0.95,
};

function result(checks: AutoCheck[], summary: string): AutoReviewResult {
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  return {
    checks,
    score: total ? Math.round((got / total) * 1000) / 1000 : 0,
    passed: checks.length > 0 && checks.every((c) => c.passed),
    summary,
  };
}

async function tryDecode(img: DeliveredImage): Promise<RGBImage | null> {
  try {
    return await decodeRGB(img.content);
  } catch {
    return null;
  }
}

function best(results: AutoReviewResult[]): AutoReviewResult {
  return results.reduce((a, b) => (b.passed && !a.passed) || b.score > a.score ? b : a);
}

export async function gradeGeneration(spec: GenerationSpec, delivered: DeliveredImage[]): Promise<AutoReviewResult> {
  if (delivered.length === 0) {
    return result([{ check: "image_delivered", passed: false, weight: 1, details: "No image file was submitted" }], "No image delivered");
  }
  const L = GENERATION_LIMITS;
  const graded: AutoReviewResult[] = [];
  for (const file of delivered) {
    const img = await tryDecode(file);
    if (!img) {
      graded.push(result([{ check: "image_decodes", passed: false, weight: 1, details: `${file.filename} is not a readable image` }], "Unreadable image"));
      continue;
    }
    const s = imageStats(img);
    const checks: AutoCheck[] = [
      { check: "image_decodes", passed: true, weight: 1, details: `${file.filename}: ${img.width}×${img.height}` },
      {
        check: "min_size",
        passed: img.width >= spec.minSide && img.height >= spec.minSide,
        weight: 1,
        details: `${img.width}×${img.height}, needs at least ${spec.minSide} on each side`,
      },
      {
        check: "colour_richness",
        passed: s.uniqueColors >= L.minUniqueColors,
        weight: 2,
        details: `${s.uniqueColors.toLocaleString("en-US")} distinct colours (generated images have tens of thousands; drawn art far fewer). Needs ${L.minUniqueColors.toLocaleString("en-US")}.`,
      },
      {
        check: "texture",
        passed: s.meanGradient >= L.minMeanGradient,
        weight: 2,
        details: `Mean local contrast ${s.meanGradient.toFixed(2)} (flat fills and clean gradients are near 0). Needs ${L.minMeanGradient}.`,
      },
      {
        check: "not_flat",
        passed: s.flatRatio <= L.maxFlatRatio,
        weight: 1,
        details: `${Math.round(s.flatRatio * 100)}% of pixels identical to their neighbour. At most ${Math.round(L.maxFlatRatio * 100)}%.`,
      },
    ];
    graded.push(result(checks, ""));
  }
  const r = best(graded);
  r.summary = r.passed
    ? "Passed: the image is a generated raster image of the required size."
    : "Failed: the image does not look generated (or is too small). Code-drawn images do not pass.";
  return r;
}

export async function gradeEditing(spec: EditingSpec, source: Buffer, delivered: DeliveredImage[]): Promise<AutoReviewResult> {
  if (delivered.length === 0) {
    return result([{ check: "image_delivered", passed: false, weight: 1, details: "No image file was submitted" }], "No image delivered");
  }
  const want = applyOps(await decodeRGB(source), spec.ops);
  const size = expectedSize(spec);
  const L = EDITING_LIMITS;
  const graded: AutoReviewResult[] = [];
  for (const file of delivered) {
    const img = await tryDecode(file);
    if (!img) {
      graded.push(result([{ check: "image_decodes", passed: false, weight: 1, details: `${file.filename} is not a readable image` }], ""));
      continue;
    }
    const sizeOk = img.width === size.width && img.height === size.height;
    const checks: AutoCheck[] = [
      { check: "image_decodes", passed: true, weight: 1, details: `${file.filename}: ${img.width}×${img.height}` },
      {
        check: "exact_size",
        passed: sizeOk,
        weight: 1,
        details: `${img.width}×${img.height}, expected ${size.width}×${size.height}`,
      },
    ];
    if (sizeOk) {
      const cmp = compareImages(img, want);
      checks.push({
        check: "pixels_match",
        passed: cmp.meanAbsDiff <= L.maxMeanAbsDiff && cmp.withinTolerance >= L.minWithinTolerance,
        weight: 3,
        details: `Average difference ${cmp.meanAbsDiff.toFixed(2)} per channel (max ${L.maxMeanAbsDiff}); ${(cmp.withinTolerance * 100).toFixed(1)}% of pixels match (needs ${L.minWithinTolerance * 100}%).`,
      });
    } else {
      checks.push({ check: "pixels_match", passed: false, weight: 3, details: "Not compared: wrong size" });
    }
    graded.push(result(checks, ""));
  }
  const r = best(graded);
  r.summary = r.passed
    ? "Passed: the edits match the platform's own result."
    : "Failed: the edited image does not match the requested edits.";
  return r;
}

export async function gradeQualification(
  spec: QualificationSpec,
  delivered: DeliveredImage[],
  source: Buffer | null
): Promise<AutoReviewResult> {
  if (spec.kind === "IMAGE_GENERATION") return gradeGeneration(spec, delivered);
  if (!source) {
    return result([{ check: "source_image", passed: false, weight: 1, details: "The test's source image could not be read" }], "Source image missing");
  }
  return gradeEditing(spec, source, delivered);
}

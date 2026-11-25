/**
 * Capability tests: which task types need one, and how each test is worded.
 *
 * A test is issued as an ordinary job (Task + Order + Execution) so the
 * agent's own runner and brain do it exactly as they would paid work. The
 * spec stored on the task is what the grader in ./grade.ts checks against.
 */
import type { EditOp } from "./image";

/** Task types an agent must pass a test for before it is given that work. */
export const QUALIFIED_TYPES = ["IMAGE_GENERATION", "IMAGE_EDITING"] as const;
export type QualifiedType = (typeof QUALIFIED_TYPES)[number];

export function needsQualification(t: string): t is QualifiedType {
  return (QUALIFIED_TYPES as readonly string[]).includes(t);
}

/** How long an agent has to hand a test in before it expires. */
export const QUALIFICATION_DEADLINE_HOURS = 72;

export interface GenerationSpec {
  kind: "IMAGE_GENERATION";
  version: 1;
  prompt: string;
  minSide: number;
}

export interface EditingSpec {
  kind: "IMAGE_EDITING";
  version: 1;
  /** File id of the source image attached to the task. */
  inputFileId: string;
  sourceWidth: number;
  sourceHeight: number;
  ops: EditOp[];
}

export type QualificationSpec = GenerationSpec | EditingSpec;

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

const SUBJECTS = [
  "a red fox", "an old fishing boat", "a bowl of ramen", "a vintage bicycle",
  "a lighthouse", "a hot-air balloon", "a tabby cat", "a stack of old books",
  "a cup of cappuccino", "a mountain cabin", "a pair of hiking boots", "a sunflower field",
];
const PLACES = [
  "on a misty lake at dawn", "in a snowy forest", "on a rainy city street at night",
  "on a wooden kitchen table", "in a desert at golden hour", "beside a rocky coastline",
  "in an autumn park", "under a starry sky",
];
const LOOKS = [
  "photorealistic, natural light, shallow depth of field",
  "photorealistic, soft overcast light",
  "detailed digital painting, rich colours",
  "cinematic photograph, warm tones",
];

export function buildGenerationSpec(): GenerationSpec {
  return {
    kind: "IMAGE_GENERATION",
    version: 1,
    prompt: `${pick(SUBJECTS)} ${pick(PLACES)}, ${pick(LOOKS)}`,
    minSide: 512,
  };
}

const BORDER_COLOURS = ["#1e66f5", "#d20f39", "#40a02b", "#df8e1d", "#8839ef", "#179299", "#fe640b"];

/** A random chain of exact edits on a source image of the given size. */
export function buildEditingOps(sourceWidth: number, sourceHeight: number): EditOp[] {
  const w = rnd(Math.round(sourceWidth * 0.45), Math.round(sourceWidth * 0.7));
  const h = rnd(Math.round(sourceHeight * 0.45), Math.round(sourceHeight * 0.7));
  const ops: EditOp[] = [
    { op: "crop", x: rnd(0, sourceWidth - w), y: rnd(0, sourceHeight - h), w, h },
  ];
  ops.push(pick<EditOp>([{ op: "flipH" }, { op: "flipV" }, { op: "rotate90cw" }, { op: "rotate180" }]));
  const colour = pick(["invert", "grayscale", "none"] as const);
  if (colour !== "none") ops.push({ op: colour });
  ops.push({ op: "border", width: rnd(8, 24), color: pick(BORDER_COLOURS) });
  return ops;
}

/** The ops in plain words, precise enough that there is one right answer. */
export function describeOp(op: EditOp): string {
  switch (op.op) {
    case "crop":
      return `Crop to the rectangle whose top-left corner is at x=${op.x}, y=${op.y} (pixels, origin at the top-left of the source image), ${op.w} px wide and ${op.h} px tall. Result: ${op.w}×${op.h}.`;
    case "flipH":
      return "Mirror the image horizontally (left and right swap).";
    case "flipV":
      return "Flip the image vertically (top and bottom swap).";
    case "rotate90cw":
      return "Rotate the image 90 degrees clockwise (width and height swap).";
    case "rotate180":
      return "Rotate the image 180 degrees.";
    case "invert":
      return "Invert every colour: each R, G and B value v becomes 255 − v.";
    case "grayscale":
      return "Convert to grayscale with L = 0.299·R + 0.587·G + 0.114·B (rounded), and set R = G = B = L.";
    case "border":
      return `Add a solid ${op.width} px border of colour ${op.color} on all four sides (the image grows by ${op.width * 2} px in each dimension).`;
  }
}

export function expectedSize(spec: EditingSpec): { width: number; height: number } {
  let w = spec.sourceWidth, h = spec.sourceHeight;
  for (const op of spec.ops) {
    if (op.op === "crop") { w = op.w; h = op.h; }
    else if (op.op === "rotate90cw") { [w, h] = [h, w]; }
    else if (op.op === "border") { w += op.width * 2; h += op.width * 2; }
  }
  return { width: w, height: h };
}

const TEST_PREAMBLE =
  "This is a capability test from ThePack, not a customer order. It is free, " +
  "and the platform grades it automatically. Pass it and your agent can take " +
  "paid work of this type. Do not ask questions; do the work and submit.";

export function generationBrief(spec: GenerationSpec) {
  return {
    title: "Capability test: image generation",
    description: [
      TEST_PREAMBLE,
      "",
      "Generate ONE new image with an AI image generator from this description:",
      `"${spec.prompt}"`,
      "",
      `Requirements: a raster image (PNG or JPEG), at least ${spec.minSide} px on each side.`,
      "It must be generated, not drawn with code: an image made from shapes, " +
      "gradients or text with Pillow, SVG, canvas or similar does not pass. If you " +
      "have no image generation tool, say so in your result note instead of " +
      "submitting a drawing.",
      "",
      "Deliver it with upload_file and submit_image_result. In the result note, " +
      "name the tool or model you used.",
    ].join("\n"),
    outputFormat: `One generated PNG or JPEG, at least ${spec.minSide}×${spec.minSide}`,
  };
}

export function editingBrief(spec: EditingSpec) {
  const size = expectedSize(spec);
  return {
    title: "Capability test: image editing",
    description: [
      TEST_PREAMBLE,
      "",
      `The task has one input image (${spec.sourceWidth}×${spec.sourceHeight}). ` +
      "Download it with get_input_file and apply these edits, in this order:",
      ...spec.ops.map((op, i) => `${i + 1}. ${describeOp(op)}`),
      "",
      `The result must be exactly ${size.width}×${size.height} px. Save it as PNG ` +
      "(lossless). The platform recomputes the edits itself and compares your " +
      "image pixel by pixel, so no resampling, filters or extra changes.",
      "",
      "Deliver it with upload_file and submit_image_result.",
    ].join("\n"),
    outputFormat: `One PNG, exactly ${size.width}×${size.height}`,
  };
}

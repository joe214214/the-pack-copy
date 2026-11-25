/**
 * Issuing and grading capability tests. Status changes go through
 * src/lib/orders/lifecycle.ts like every other order.
 */
import { prisma } from "@/lib/prisma";
import { readFile, uploadFile, deleteFile } from "@/lib/storage";
import { openQualification, LifecycleError } from "@/lib/orders/lifecycle";
import type { TaskType } from "@/generated/prisma/enums";
import { encodePNG, makeSourceImage } from "./image";
import {
  QUALIFICATION_DEADLINE_HOURS,
  buildEditingOps,
  buildGenerationSpec,
  editingBrief,
  generationBrief,
  needsQualification,
  type EditingSpec,
  type QualificationSpec,
} from "./spec";
import { gradeQualification, type DeliveredImage } from "./grade";

/**
 * The account that publishes tests. It has no password, so nobody can sign
 * in as it, and it never holds money.
 */
const SYSTEM_EMAIL = "capability-tests@system.thepack";

async function systemPublisherId(): Promise<string> {
  const user = await prisma.user.upsert({
    where: { email: SYSTEM_EMAIL },
    update: {},
    create: {
      email: SYSTEM_EMAIL,
      supabaseId: "system:capability-tests",
      name: "ThePack capability tests",
      passwordHash: null,
      roles: ["PUBLISHER"],
    },
    select: { id: true },
  });
  return user.id;
}

/** Issues a test of `type` to the agent. Returns the new order. */
export async function startQualification(a: { agentId: string; type: TaskType; actorId: string | null }) {
  if (!needsQualification(a.type)) throw new LifecycleError(`${a.type} has no capability test`, 400);
  const publisherId = await systemPublisherId();

  if (a.type === "IMAGE_GENERATION") {
    const spec = buildGenerationSpec();
    return openQualification({
      agentId: a.agentId,
      publisherId,
      type: a.type,
      spec: { ...spec },
      brief: generationBrief(spec),
      deadlineHours: QUALIFICATION_DEADLINE_HOURS,
      actorId: a.actorId,
    });
  }

  // IMAGE_EDITING: a fresh random source image, uploaded as the task's input.
  const source = makeSourceImage();
  const png = await encodePNG(source);
  const stored = await uploadFile("task-inputs", `capability-test-${a.agentId}`, "source.png", png, "image/png");
  const file = await prisma.file.create({
    data: {
      key: stored.key,
      bucket: stored.bucket,
      filename: "source.png",
      contentType: "image/png",
      size: png.length,
      width: source.width,
      height: source.height,
      uploadedById: publisherId,
    },
  });
  const spec: EditingSpec = {
    kind: "IMAGE_EDITING",
    version: 1,
    inputFileId: file.id,
    sourceWidth: source.width,
    sourceHeight: source.height,
    ops: buildEditingOps(source.width, source.height),
  };
  try {
    return await openQualification({
      agentId: a.agentId,
      publisherId,
      type: a.type,
      spec: JSON.parse(JSON.stringify(spec)),
      brief: editingBrief(spec),
      deadlineHours: QUALIFICATION_DEADLINE_HOURS,
      inputFileId: file.id,
      actorId: a.actorId,
    });
  } catch (e) {
    // Most often "a test of this type is already waiting": drop the unused image.
    await prisma.file.delete({ where: { id: file.id } }).catch(() => {});
    await deleteFile(stored.key).catch(() => {});
    throw e;
  }
}

/**
 * Starts a test for each type in the list that needs one. Failures are
 * returned, not thrown: registering the agent must not fail because a test
 * could not be issued, and the owner can start it again from the agent page.
 */
export async function startQualifications(agentId: string, types: TaskType[], actorId: string | null) {
  const errors: string[] = [];
  for (const type of types.filter(needsQualification)) {
    try {
      await startQualification({ agentId, type, actorId });
    } catch (e) {
      errors.push(`${type}: ${(e as Error).message}`);
      console.error("[qualification] could not start", type, e);
    }
  }
  return errors;
}

/** Grades a submission against the spec stored on the task. */
export async function gradeSubmission(spec: QualificationSpec, delivered: DeliveredImage[]) {
  let source: Buffer | null = null;
  if (spec.kind === "IMAGE_EDITING") {
    const file = await prisma.file.findUnique({ where: { id: spec.inputFileId }, select: { key: true } });
    if (file) source = await readFile(file.key).catch(() => null);
  }
  return gradeQualification(spec, delivered, source);
}

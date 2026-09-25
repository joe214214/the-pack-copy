/**
 * GET /api/revisions/[revisionId]/[name] — serve one file from an earlier round
 *
 * The sibling route /api/deliverables/[executionId]/[name] resolves a filename
 * against the execution's CURRENT outputFiles. That is wrong for history: every
 * round tends to deliver a file with the same name ("index.html"), so asking
 * that route for round 1's file hands back round 2's content under round 1's
 * heading. Revision rows carry a `previousFiles` snapshot of exactly what was
 * delivered before it was replaced, and this route reads that instead.
 *
 * Access: the order's publisher, the agent's owner, or an admin.
 *
 * Security: same as the deliverables route — the payload is agent-authored, so
 * it goes out under `Content-Security-Policy: sandbox`, which parks it in an
 * opaque origin. Scripts still run; the document is not same-origin with us.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type OutputFile = { name?: string; url?: string; type?: string; size?: number };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ revisionId: string; name: string }> }
) {
  const { revisionId, name } = await params;
  const filename = decodeURIComponent(name);

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const revision = await prisma.revision.findUnique({
    where: { id: revisionId },
    include: { order: { include: { agent: { select: { ownerId: true } } } } },
  });
  if (!revision) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }

  const allowed =
    user.isAdmin ||
    revision.order.publisherId === user.id ||
    revision.order.agent?.ownerId === user.id;
  if (!allowed) {
    return NextResponse.json({ error: "Not your delivery" }, { status: 403 });
  }

  const files = (revision.previousFiles ?? []) as OutputFile[];
  const file = Array.isArray(files)
    ? files.find((f) => f?.name === filename)
    : undefined;
  if (!file?.url) {
    return NextResponse.json(
      { error: "File not found in this round" },
      { status: 404 }
    );
  }

  // An uploaded file already lives behind a real URL, and its storage key is
  // unique per upload, so the historical object is still the right one.
  if (!file.url.startsWith("data:")) {
    return NextResponse.redirect(new URL(file.url, req.url));
  }

  // data:<mime>[;charset=...][;base64],<payload>
  const comma = file.url.indexOf(",");
  if (comma === -1) {
    return NextResponse.json({ error: "Malformed data URL" }, { status: 500 });
  }
  const meta = file.url.slice(5, comma);
  const payload = file.url.slice(comma + 1);
  const isBase64 = /;base64$/i.test(meta);
  const contentType =
    meta.replace(/;base64$/i, "") || file.type || "application/octet-stream";
  const body = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

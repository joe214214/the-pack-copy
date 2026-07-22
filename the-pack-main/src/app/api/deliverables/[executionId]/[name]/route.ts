/**
 * GET /api/deliverables/[executionId]/[name] — serve one delivered file
 *
 * Why this exists: a deliverable submitted inline is stored as a `data:` URI, and
 * browsers refuse to open a `data:` URL as a top-level navigation. So a delivered
 * web page could only ever be previewed in an iframe, never opened in its own tab.
 * This route re-serves that content from a real URL with a real Content-Type, so
 * "open in a new tab" works for inline and uploaded deliverables alike.
 *
 * (It lives under /api/deliverables rather than /api/executions because that
 * segment already uses an [orderId] slug, and Next forbids two slug names at the
 * same path position.)
 *
 * Access: the order's publisher, the agent's owner, or an admin.
 *
 * Security: the payload is agent-authored HTML. Serving it from our own origin
 * would let it call our API as the signed-in user, so it goes out under
 * `Content-Security-Policy: sandbox`, which parks the document in an opaque
 * origin — scripts still run, but it is not same-origin with the app.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type OutputFile = { name?: string; url?: string; type?: string; size?: number };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ executionId: string; name: string }> }
) {
  const { executionId, name } = await params;
  const filename = decodeURIComponent(name);

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const execution = await prisma.execution.findUnique({
    where: { id: executionId },
    include: { order: { include: { agent: { select: { ownerId: true } } } } },
  });
  if (!execution) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }

  const allowed =
    user.isAdmin ||
    execution.order.publisherId === user.id ||
    execution.order.agent?.ownerId === user.id;
  if (!allowed) {
    return NextResponse.json({ error: "Not your delivery" }, { status: 403 });
  }

  const files = (execution.outputFiles ?? []) as OutputFile[];
  const file = files.find((f) => f.name === filename);
  if (!file?.url) {
    return NextResponse.json({ error: "File not found in this delivery" }, { status: 404 });
  }

  // Uploaded files already live behind a real URL — send the caller there.
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
  const contentType = meta.replace(/;base64$/i, "") || file.type || "application/octet-stream";
  const body = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
      // Opaque origin: the delivered page can run, but not act as this site.
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

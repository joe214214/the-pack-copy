/**
 * Verifies the browser-facing file path end to end:
 * storage upload -> File row -> GET /api/files/[key] -> byte comparison.
 *
 * Cleans up both the row and the object. Point BASE_URL at whichever server
 * should be tested; it defaults to the local one.
 *
 *   npx tsx --env-file=.env scripts/files-http-check.ts [baseUrl]
 */
import { uploadFile, deleteFile, getFileUrl } from "../src/lib/storage";
import { prisma } from "../src/lib/prisma";

async function main() {
  const base = (process.argv[2] || "http://localhost:3100").replace(/\/$/, "");

  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error("No user in the database to attribute the upload to.");

  const payload = Buffer.from("<!doctype html><title>probe</title><p>hello</p>");
  const up = await uploadFile(
    "task-outputs", "http-check", "probe.html", payload, "text/html"
  );

  await prisma.file.create({
    data: {
      key: up.key, bucket: up.bucket, filename: up.filename,
      contentType: up.contentType, size: up.size, uploadedById: user.id,
    },
  });

  const url = `${base}/api/files/${encodeURIComponent(up.key)}`;
  console.log(`  GET ${url}`);

  try {
    const res = await fetch(url);
    const body = Buffer.from(await res.arrayBuffer());
    const ok = res.ok && body.equals(payload);
    console.log(`  status  ${res.status}`);
    console.log(`  type    ${res.headers.get("content-type")}`);
    console.log(`  bytes   ${ok ? "ok   identical to what was uploaded" : "FAIL mismatch"} (${body.length})`);
    if (!ok) process.exitCode = 1;
    console.log(`\n  getFileUrl() would hand the browser: ${getFileUrl(up.key)}`);
  } finally {
    await prisma.file.delete({ where: { key: up.key } }).catch(() => {});
    await deleteFile(up.key).catch(() => {});
    await prisma.$disconnect();
    console.log("  cleaned up");
  }
}

main().catch(async (e) => {
  console.error("  ERROR:", e instanceof Error ? e.message : e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});

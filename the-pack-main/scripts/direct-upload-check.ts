// Direct-upload roundtrip against real Supabase Storage (no HTTP server needed).
// Run from the-pack-main:  npx tsx --env-file=.env --tsconfig tsconfig.json <this file>
import crypto from "crypto";
import { createUploadTarget, getSignedDownloadUrl, deleteFile, statFile } from "@/lib/storage";
import { signTicket, verifyTicket, verifyStoredObject } from "@/lib/direct-upload";

async function main() {
  // 6 MB PNG-headed blob (> Vercel's 4.5 MB body cap). Real PNG header → dims parse.
  const size = 6 * 1024 * 1024;
  const buf = crypto.randomBytes(size);
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000007d0000005dc0806000000", "hex"); // 2000x1500
  png.copy(buf, 0);

  const t0 = Date.now();
  const target = await createUploadTarget("task-outputs", "selftest", "big.png", "image/png", size);
  console.log("1. upload-url ok:", target.key);

  // PUT with NO apikey/Authorization — exactly what a browser/agent does.
  const put = await fetch(target.signedUrl, {
    method: "PUT", headers: { "Content-Type": "image/png", "x-upsert": "false" }, body: buf,
  });
  console.log("2. PUT", put.status, (await put.text()).slice(0, 120));
  if (!put.ok) process.exit(1);

  const ticket = signTicket({ key: target.key, bucket: "task-outputs", filename: "big.png", contentType: "image/png", size, owner: "agent:x", executionId: "e" });
  const t = verifyTicket(ticket, "agent:x");
  console.log("3. stat", await statFile(t.key));
  console.log("4. verify", await verifyStoredObject(t, { sniffHtml: true }));

  // Tamper checks
  try { verifyTicket(ticket, "agent:other"); console.log("!! owner check FAILED"); } catch (e: any) { console.log("5. wrong owner rejected:", e.message); }
  try { verifyTicket(ticket.slice(0, -2) + "xx", "agent:x"); console.log("!! sig check FAILED"); } catch (e: any) { console.log("6. bad sig rejected:", e.message); }
  try { await verifyStoredObject({ ...t, size: size + 1 }); console.log("!! size check FAILED"); } catch (e: any) { console.log("7. size mismatch rejected (object deleted):", e.message); }

  // Upload again for download test (the mismatch test deleted it)
  const t2 = await createUploadTarget("task-outputs", "selftest", "big.png", "image/png", size);
  await fetch(t2.signedUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: buf });
  const url = await getSignedDownloadUrl(t2.key, 60, "big.png");
  const got = Buffer.from(await (await fetch(url)).arrayBuffer());
  console.log("8. signed download bytes match:", got.equals(buf), got.length);
  await deleteFile(t2.key);
  console.log(`done in ${Date.now() - t0}ms`);
}
main().catch((e) => { console.error("FAILED", e); process.exit(1); });

/**
 * End-to-end check of the storage layer: upload a file, read it back byte for
 * byte, then delete it. Run after changing the storage backend or pointing the
 * app at a new Supabase project.
 *
 *   npm run storage:check
 */
import { uploadFile, readFile, deleteFile } from "../src/lib/storage";

async function main() {
  const payload = Buffer.from("# roundtrip\n\nwritten at " + new Date().toISOString());

  const up = await uploadFile(
    "task-outputs", "roundtrip-check", "probe.md", payload, "text/markdown"
  );
  console.log(`  upload  ok   key=${up.key}  size=${up.size}`);

  const back = await readFile(up.key);
  const same = back.equals(payload);
  console.log(`  read    ${same ? "ok   identical bytes" : "FAIL mismatch"}  size=${back.length}`);
  if (!same) process.exitCode = 1;

  await deleteFile(up.key);
  console.log("  delete  ok");

  let gone = false;
  try {
    await readFile(up.key);
  } catch {
    gone = true;
  }
  console.log(`  verify  ${gone ? "ok   deleted file no longer readable" : "FAIL still readable"}`);
  if (!gone) process.exitCode = 1;
}

main().catch((e) => {
  console.error("  ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});

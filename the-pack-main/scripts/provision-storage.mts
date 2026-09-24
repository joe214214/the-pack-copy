/**
 * Creates the Supabase Storage buckets the app writes to.
 *
 * Idempotent: a bucket that already exists is left exactly as it is. Safe to
 * re-run, and it must be run once against any new Supabase project before file
 * uploads will work.
 *
 *   npx tsx --env-file=.env scripts/provision-storage.mts
 *
 * Buckets are created PRIVATE. Files are served through /api/files/[key],
 * which looks the record up in the database first, so nothing should be
 * reachable by guessing an object URL.
 */
import { createClient } from "@supabase/supabase-js";

// Mirrors MAX_FILE_SIZE in src/lib/storage.ts. The app validates size before
// uploading; this is the backstop if that check is ever bypassed.
const BUCKETS: Array<{ name: string; fileSizeLimit: string }> = [
  { name: "task-inputs", fileSizeLimit: "10MB" },
  { name: "task-outputs", fileSizeLimit: "20MB" },
  { name: "avatars", fileSizeLimit: "2MB" },
  { name: "revision-feedback", fileSizeLimit: "10MB" },
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Run with: npx tsx --env-file=.env scripts/provision-storage.mts"
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    console.error(`Could not list buckets: ${listError.message}`);
    process.exit(1);
  }
  const have = new Set((existing ?? []).map((b) => b.name));

  let created = 0;
  for (const bucket of BUCKETS) {
    if (have.has(bucket.name)) {
      console.log(`  = ${bucket.name.padEnd(20)} already exists, left alone`);
      continue;
    }
    const { error } = await supabase.storage.createBucket(bucket.name, {
      public: false,
      fileSizeLimit: bucket.fileSizeLimit,
    });
    if (error) {
      console.error(`  ! ${bucket.name.padEnd(20)} FAILED: ${error.message}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`  + ${bucket.name.padEnd(20)} created (private, ${bucket.fileSizeLimit})`);
    created++;
  }

  console.log(`\nDone. ${created} bucket(s) created, ${BUCKETS.length - created} already present.`);
}

main();

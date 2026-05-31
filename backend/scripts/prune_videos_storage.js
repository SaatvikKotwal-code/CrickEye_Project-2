/**
 * One-time storage cleanup (service role). Frees Supabase quota when DB rows were
 * deleted but Storage objects were left behind.
 *
 * Usage (from repo root, with backend/.env loaded):
 *   node backend/scripts/prune_videos_storage.js --dry-run
 *   node backend/scripts/prune_videos_storage.js --confirm
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { supabaseAdmin } = require("../services/supabaseAdmin");

const BUCKET = "videos";
const PAGE = 100;

async function listAllObjectPaths() {
  const paths = [];
  const { data: roots, error: rootErr } = await supabaseAdmin.storage.from(BUCKET).list("", {
    limit: PAGE,
  });
  if (rootErr) throw rootErr;
  for (const entry of roots || []) {
    if (!entry?.name) continue;
    if (entry.id) {
      paths.push(entry.name);
      continue;
    }
    let offset = 0;
    for (;;) {
      const { data: page, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(entry.name, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      for (const f of page || []) {
        if (f?.name) paths.push(`${entry.name}/${f.name}`);
      }
      if (!page || page.length < PAGE) break;
      offset += PAGE;
    }
  }
  return paths;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const dryRun = process.argv.includes("--dry-run") || !confirm;
  if (!confirm && !process.argv.includes("--dry-run")) {
    console.log("Pass --dry-run to list objects, or --confirm to delete them.");
    process.exit(1);
  }

  const paths = await listAllObjectPaths();
  console.log(`Bucket "${BUCKET}": ${paths.length} object(s).`);
  paths.slice(0, 20).forEach((p) => console.log("  ", p));
  if (paths.length > 20) console.log(`  ... and ${paths.length - 20} more`);

  if (dryRun) {
    console.log("\nDry run only. Re-run with --confirm to delete.");
    return;
  }

  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await supabaseAdmin.storage.from(BUCKET).remove(batch);
    if (error) throw error;
    console.log(`Deleted ${Math.min(i + 100, paths.length)} / ${paths.length}`);
  }
  console.log("Done. Check Supabase Usage → Storage in a few minutes.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

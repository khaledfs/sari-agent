/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Shared run-mode gate for every DB-writing script under scripts/.
 *
 * SAFETY DEFAULT: dry-run. A bare `node scripts/<x>.js` performs NO writes —
 * it prints exactly what it would do and exits 0. Real writes require the
 * explicit `--apply` flag. `--dry` is still accepted as a no-op alias (it is
 * already the default) so existing docs and commands keep working.
 */

function resolveMode(argv) {
  const apply = argv.includes("--apply");
  // --dry is redundant now (dry is the default) but accepted for compatibility.
  return { apply, dry: !apply };
}

function hostFromUri(uri) {
  try {
    return uri.split("://")[1].split("/")[0].split("@").pop() || "(unknown host)";
  } catch {
    return "(unknown host)";
  }
}

function dbNameFromUri(uri) {
  if (!uri) return "(unknown db)";
  try {
    const afterHost = uri.split("://")[1].split("/").slice(1).join("/");
    const db = (afterHost.split("?")[0] || "").trim();
    return db || "(server default db)";
  } catch {
    return "(unknown db)";
  }
}

/**
 * Loud start-of-run banner: the mode and the target database it points at, so
 * an operator can never confuse a dry run with a real one, or a local DB with
 * the shared cluster. Pass the live mongoose connection when available (most
 * accurate); the uri is used as a fallback before/without a connection.
 */
function printModeBanner(scriptName, apply, uri, connection) {
  const db = (connection && connection.name) || dbNameFromUri(uri);
  const host = (connection && connection.host) || hostFromUri(uri);
  const bar = "=".repeat(72);
  console.log(bar);
  console.log(`  ${scriptName}`);
  console.log(`  MODE:      ${apply ? "APPLY  —  WRITES ENABLED" : "DRY RUN  —  no writes (default)"}`);
  console.log(`  TARGET DB: ${db}  @  ${host}`);
  if (!apply) {
    console.log("  Nothing will be written. Re-run with --apply to perform writes.");
  }
  console.log(bar);
}

module.exports = { resolveMode, printModeBanner, dbNameFromUri, hostFromUri };

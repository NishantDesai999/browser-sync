import { execSync } from "child_process";
import { readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import plist from "plist";

export function readBinaryPlist(filePath: string): object {
  // Write to a temp file to avoid stdout buffer limits on large plists
  const tmp = join(tmpdir(), `bsync-plist-${Date.now()}.xml`);
  try {
    execSync(`plutil -convert xml1 "${filePath}" -o "${tmp}"`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("permission") || msg.includes("couldn't be opened")) {
      throw new Error(
        `Permission denied reading ${filePath}.\n` +
        `Grant "Full Disk Access" to your terminal app:\n` +
        `  System Settings > Privacy & Security > Full Disk Access`
      );
    }
    throw err;
  }

  try {
    const xml = readFileSync(tmp, "utf-8");
    return plist.parse(xml) as object;
  } finally {
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

import { execSync } from "child_process";
import plist from "plist";

export function readBinaryPlist(filePath: string): object {
  // plutil ships with macOS — no install needed
  let xml: string;
  try {
    xml = execSync(`plutil -convert xml1 -o - "${filePath}"`).toString("utf-8");
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
  return plist.parse(xml) as object;
}

import { execSync } from "child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";
import { readdirSync } from "fs";
import { join } from "path";

export interface ChromeBookmarkNode {
  id: string;
  type: "url" | "folder";
  name: string;
  url?: string;
  date_added?: string;
  children?: ChromeBookmarkNode[];
}

export interface ChromeBookmarkFile {
  roots: {
    bookmark_bar: ChromeBookmarkNode;
    other: ChromeBookmarkNode;
    synced?: ChromeBookmarkNode;
  };
}

export function readChromeBookmarks(bookmarksPath: string): ChromeBookmarkFile {
  if (!existsSync(bookmarksPath)) {
    throw new Error(`Chrome Bookmarks file not found: ${bookmarksPath}`);
  }
  return JSON.parse(readFileSync(bookmarksPath, "utf-8")) as ChromeBookmarkFile;
}

export function writeChromeBookmarks(data: ChromeBookmarkFile, bookmarksPath: string): void {
  if (!existsSync(bookmarksPath)) {
    throw new Error(
      `Chrome Bookmarks file not found at ${bookmarksPath}. ` +
      `Is Chrome installed and has it been opened at least once?`
    );
  }

  if (isChromeRunning()) {
    throw new Error(
      'Chrome is currently running. Please close Chrome before pushing bookmarks, ' +
      'otherwise Chrome will overwrite the changes on next save.'
    );
  }

  // Backup before overwriting so nothing is permanently lost
  const backup = `${bookmarksPath}.bsync-backup`;
  writeFileSync(backup, readFileSync(bookmarksPath, "utf-8"), "utf-8");

  const tmp = `${bookmarksPath}.bsync-tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmp, bookmarksPath);
}

export interface ChromeRawExtension {
  id: string;
  name: string;
  version: string;
}

export function readChromeExtensions(extensionsDir: string): ChromeRawExtension[] {
  if (!existsSync(extensionsDir)) return [];

  const results: ChromeRawExtension[] = [];
  const extIds = readdirSync(extensionsDir).filter(
    (d) => !d.startsWith(".") && d.length === 32
  );

  for (const extId of extIds) {
    try {
      const versionDirs = readdirSync(join(extensionsDir, extId));
      const versionDir = versionDirs[0];
      if (!versionDir) continue;

      const manifestPath = join(extensionsDir, extId, versionDir, "manifest.json");
      if (!existsSync(manifestPath)) continue;

      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
        name?: string;
        version?: string;
      };

      results.push({
        id: extId,
        name: manifest.name ?? extId,
        version: manifest.version ?? "",
      });
    } catch {
      // Skip extensions with unreadable manifests
    }
  }

  return results;
}

function isChromeRunning(): boolean {
  try {
    execSync('pgrep -x "Google Chrome"', { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

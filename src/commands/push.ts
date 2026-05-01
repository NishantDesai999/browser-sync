import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { BrowserName } from "../types.js";
import { readChromeBookmarks, writeChromeBookmarks } from "../browsers/chrome.js";
import {
  canonicalToChromeFile,
  canonicalToNetscapeHtml,
  chromeToCanonical,
  mergeWithExisting,
} from "../adapters/bookmark-adapter.js";
import { loadBookmarks } from "../store/gist-store.js";
import { getChromeBookmarksPath, getDataDir } from "../utils/paths.js";
import { log } from "../utils/logger.js";

interface PushOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

export async function push(browser: BrowserName, opts: PushOptions): Promise<void> {
  const loadSpinner = log.step("Loading bookmarks from Gist...");

  let tree;
  try {
    tree = await loadBookmarks();
    loadSpinner.succeed("Loaded bookmarks from Gist");
  } catch (err) {
    loadSpinner.fail("Failed to load bookmarks from Gist");
    throw err;
  }

  if (!tree) {
    log.error("No bookmarks in Gist yet. Run `browser-sync pull <browser>` first.");
    process.exit(1);
  }

  if (browser === "chrome") {
    const bookmarksPath = getChromeBookmarksPath();
    if (opts.verbose) log.info(`Writing to ${bookmarksPath}`);

    // Merge: preserve any Chrome-unique bookmarks not in the Gist
    let mergedTree = tree;
    let preservedCount = 0;
    if (existsSync(bookmarksPath)) {
      try {
        const existing = readChromeBookmarks(bookmarksPath);
        const existingCanonical = chromeToCanonical(existing);
        const result = mergeWithExisting(tree, existingCanonical, "Chrome");
        mergedTree = result.tree;
        preservedCount = result.preservedCount;
      } catch {
        // If we can't read existing bookmarks, proceed with Gist-only
      }
    }

    if (opts.dryRun) {
      const count = mergedTree.roots.bookmarkBar.children?.length ?? 0;
      log.warn(`--dry-run: would write ${count} top-level bar bookmarks to Chrome`);
      if (preservedCount > 0) {
        log.warn(`--dry-run: would also preserve ${preservedCount} Chrome-unique bookmarks`);
      }
      return;
    }

    const writeSpinner = log.step("Writing Chrome bookmarks...");
    try {
      const chromeData = canonicalToChromeFile(mergedTree);
      writeChromeBookmarks(chromeData, bookmarksPath);
      writeSpinner.succeed("Chrome bookmarks updated (restart Chrome to see changes)");
      if (preservedCount > 0) {
        log.info(`Preserved ${preservedCount} Chrome-unique bookmarks in "Other Bookmarks"`);
      }
      log.info(`Backup saved to ${bookmarksPath}.bsync-backup`);
    } catch (err) {
      writeSpinner.fail("Failed to write Chrome bookmarks");
      throw err;
    }
    return;
  }

  // Firefox and Safari: export Netscape HTML
  const html = canonicalToNetscapeHtml(tree);
  const exportPath = join(getDataDir(), "export.html");

  if (opts.dryRun) {
    const barCount = tree.roots.bookmarkBar.children?.length ?? 0;
    log.warn(`--dry-run: would write Netscape HTML export with ${barCount} top-level bar items`);
    return;
  }

  writeFileSync(exportPath, html, "utf-8");

  if (browser === "firefox") {
    log.success(`Wrote ${exportPath}`);
    log.info("To import in Firefox:");
    log.info("  Bookmarks > Manage Bookmarks > Import and Backup > Import Bookmarks from HTML");
    log.info(`  Then select: ${exportPath}`);
  } else {
    log.success(`Wrote ${exportPath}`);
    log.info("To import in Safari:");
    log.info("  File > Import From > Bookmarks HTML File...");
    log.info(`  Then select: ${exportPath}`);
    log.warn("Note: Safari extensions must be installed manually from the App Store.");
  }
}

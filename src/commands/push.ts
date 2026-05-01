import { existsSync } from "fs";
import { BrowserName } from "../types.js";
import { readChromeBookmarks, writeChromeBookmarks } from "../browsers/chrome.js";
import { writeFirefoxBookmarks } from "../browsers/firefox.js";
import { writeSafariBookmarks, readSafariBookmarks } from "../browsers/safari.js";
import {
  canonicalToChromeFile,
  chromeToCanonical,
  safariToCanonical,
  mergeWithExisting,
} from "../adapters/bookmark-adapter.js";
import { loadBookmarks } from "../store/gist-store.js";
import { getChromeBookmarksPath, getFirefoxPlacesDb, getSafariBookmarksPath } from "../utils/paths.js";
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

    let mergedTree = tree;
    let preservedCount = 0;
    if (existsSync(bookmarksPath)) {
      try {
        const existing = readChromeBookmarks(bookmarksPath);
        const result = mergeWithExisting(tree, chromeToCanonical(existing), "Chrome");
        mergedTree = result.tree;
        preservedCount = result.preservedCount;
      } catch { /* proceed with Gist-only if Chrome unreadable */ }
    }

    if (opts.dryRun) {
      const count = mergedTree.roots.bookmarkBar.children?.length ?? 0;
      log.warn(`--dry-run: would write ${count} top-level bar bookmarks to Chrome`);
      if (preservedCount > 0) log.warn(`--dry-run: would preserve ${preservedCount} Chrome-unique bookmarks`);
      return;
    }

    const spinner = log.step("Writing Chrome bookmarks...");
    try {
      writeChromeBookmarks(canonicalToChromeFile(mergedTree), bookmarksPath);
      spinner.succeed("Chrome bookmarks updated (restart Chrome to see changes)");
      if (preservedCount > 0) log.info(`Preserved ${preservedCount} Chrome-unique bookmarks in "Other Bookmarks"`);
      log.info(`Backup: ${bookmarksPath}.bsync-backup`);
    } catch (err) {
      spinner.fail("Failed to write Chrome bookmarks");
      throw err;
    }
    return;
  }

  if (browser === "firefox") {
    const dbPath = getFirefoxPlacesDb();
    if (opts.verbose) log.info(`Writing to ${dbPath}`);

    if (opts.dryRun) {
      const count = tree.roots.bookmarkBar.children?.length ?? 0;
      log.warn(`--dry-run: would write ${count} top-level bar bookmarks to Firefox SQLite`);
      return;
    }

    const spinner = log.step("Writing Firefox bookmarks...");
    try {
      const backupPath = writeFirefoxBookmarks(tree, dbPath);
      spinner.succeed("Firefox bookmarks updated (restart Firefox to see changes)");
      log.info(`Backup: ${backupPath}`);
    } catch (err) {
      spinner.fail("Failed to write Firefox bookmarks");
      throw err;
    }
    return;
  }

  // Safari
  const plistPath = getSafariBookmarksPath();
  if (opts.verbose) log.info(`Writing to ${plistPath}`);

  if (opts.dryRun) {
    const count = tree.roots.bookmarkBar.children?.length ?? 0;
    log.warn(`--dry-run: would write ${count} top-level bar bookmarks to Safari plist`);
    return;
  }

  const spinner = log.step("Writing Safari bookmarks...");
  try {
    // Merge Safari-unique bookmarks before writing
    let mergedTree = tree;
    try {
      const existing = readSafariBookmarks(plistPath);
      const result = mergeWithExisting(tree, safariToCanonical(existing), "Safari");
      mergedTree = result.tree;
      if (result.preservedCount > 0) {
        log.info(`Preserved ${result.preservedCount} Safari-unique bookmarks`);
      }
    } catch { /* no existing safari bookmarks or no permission — write Gist-only */ }

    const backupPath = writeSafariBookmarks(mergedTree, plistPath);
    spinner.succeed("Safari bookmarks updated (restart Safari to see changes)");
    log.info(`Backup: ${backupPath}`);
  } catch (err) {
    spinner.fail("Failed to write Safari bookmarks");
    throw err;
  }
}

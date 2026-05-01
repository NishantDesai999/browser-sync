import { BrowserName } from "../types.js";
import { readFirefoxBookmarks, readFirefoxExtensions } from "../browsers/firefox.js";
import { readChromeBookmarks, readChromeExtensions } from "../browsers/chrome.js";
import { readSafariBookmarks } from "../browsers/safari.js";
import {
  firefoxToCanonical,
  chromeToCanonical,
  safariToCanonical,
  mergeWithExisting,
} from "../adapters/bookmark-adapter.js";
import {
  firefoxExtensionsToCanonical,
  chromeExtensionsToCanonical,
  mergeExtensionLists,
} from "../adapters/extension-adapter.js";
import { loadBookmarks, saveBookmarks, loadExtensions, saveExtensions } from "../store/gist-store.js";
import {
  getFirefoxPlacesDb,
  getFirefoxExtensionsDir,
  getChromeBookmarksPath,
  getChromeExtensionsDir,
  getSafariBookmarksPath,
} from "../utils/paths.js";
import { log } from "../utils/logger.js";

interface PullOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

export async function pull(browser: BrowserName, opts: PullOptions): Promise<void> {
  const spinner = log.step(`Reading bookmarks from ${browser}...`);

  try {
    const gistTree = await loadBookmarks();
    let tree;

    if (browser === "firefox") {
      const dbPath = getFirefoxPlacesDb();
      if (opts.verbose) log.info(`Firefox DB: ${dbPath}`);
      const raw = readFirefoxBookmarks(dbPath);
      // Pass existing Gist tree for UUID reconciliation
      tree = firefoxToCanonical(raw, gistTree ?? undefined);
    } else if (browser === "chrome") {
      const bookmarksPath = getChromeBookmarksPath();
      if (opts.verbose) log.info(`Chrome Bookmarks: ${bookmarksPath}`);
      const raw = readChromeBookmarks(bookmarksPath);
      tree = chromeToCanonical(raw, gistTree ?? undefined);
    } else {
      const plistPath = getSafariBookmarksPath();
      if (opts.verbose) log.info(`Safari plist: ${plistPath}`);
      const raw = readSafariBookmarks(plistPath);
      tree = safariToCanonical(raw, gistTree ?? undefined);
    }

    // Merge: preserve any Gist-only bookmarks (from other browsers) so the
    // Gist accumulates bookmarks across all browsers over time.
    let finalTree = tree;
    let preservedCount = 0;
    if (gistTree) {
      const result = mergeWithExisting(tree, gistTree, "previous sync");
      finalTree = result.tree;
      preservedCount = result.preservedCount;
    }

    const count = countBookmarks(finalTree.roots.bookmarkBar) + countBookmarks(finalTree.roots.other);
    spinner.succeed(`Read ${count} bookmarks from ${browser}${preservedCount > 0 ? ` (+${preservedCount} preserved from Gist)` : ""}`);

    if (opts.dryRun) {
      log.warn("--dry-run: skipping Gist save");
      return;
    }

    const saveSpinner = log.step("Saving to GitHub Gist...");
    await saveBookmarks(finalTree);
    saveSpinner.succeed("Bookmarks saved to Gist");

    // Extensions: also merge with existing Gist extension list
    if (browser === "firefox") {
      const extPath = getFirefoxExtensionsDir();
      const rawExts = readFirefoxExtensions(extPath);
      const newList = firefoxExtensionsToCanonical(rawExts);
      const existing = await loadExtensions();
      const merged = existing ? mergeExtensionLists([existing, newList]) : newList;
      await saveExtensions(merged);
      log.success(`Saved ${merged.entries.length} extensions to Gist`);
    } else if (browser === "chrome") {
      const extDir = getChromeExtensionsDir();
      const rawExts = readChromeExtensions(extDir);
      const newList = chromeExtensionsToCanonical(rawExts);
      const existing = await loadExtensions();
      const merged = existing ? mergeExtensionLists([existing, newList]) : newList;
      await saveExtensions(merged);
      log.success(`Saved ${merged.entries.length} extensions to Gist`);
    }
  } catch (err) {
    spinner.fail(`Failed to pull from ${browser}`);
    throw err;
  }
}

function countBookmarks(node: { type: string; children?: Array<{ type: string; children?: unknown[] }> }): number {
  if (node.type === "bookmark") return 1;
  return (node.children ?? []).reduce((sum, c) => sum + countBookmarks(c as Parameters<typeof countBookmarks>[0]), 0);
}

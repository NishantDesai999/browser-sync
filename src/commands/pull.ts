import { BrowserName } from "../types.js";
import { readFirefoxBookmarks, readFirefoxExtensions } from "../browsers/firefox.js";
import { readChromeBookmarks, readChromeExtensions } from "../browsers/chrome.js";
import { readSafariBookmarks } from "../browsers/safari.js";
import {
  firefoxToCanonical,
  chromeToCanonical,
  safariToCanonical,
} from "../adapters/bookmark-adapter.js";
import {
  firefoxExtensionsToCanonical,
  chromeExtensionsToCanonical,
} from "../adapters/extension-adapter.js";
import { loadBookmarks, saveBookmarks, saveExtensions } from "../store/gist-store.js";
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
    const existing = await loadBookmarks();
    let tree;

    if (browser === "firefox") {
      const dbPath = getFirefoxPlacesDb();
      if (opts.verbose) log.info(`Firefox DB: ${dbPath}`);
      const raw = readFirefoxBookmarks(dbPath);
      tree = firefoxToCanonical(raw, existing ?? undefined);
    } else if (browser === "chrome") {
      const bookmarksPath = getChromeBookmarksPath();
      if (opts.verbose) log.info(`Chrome Bookmarks: ${bookmarksPath}`);
      const raw = readChromeBookmarks(bookmarksPath);
      tree = chromeToCanonical(raw, existing ?? undefined);
    } else {
      const plistPath = getSafariBookmarksPath();
      if (opts.verbose) log.info(`Safari plist: ${plistPath}`);
      const raw = readSafariBookmarks(plistPath);
      tree = safariToCanonical(raw, existing ?? undefined);
    }

    const count = countBookmarks(tree.roots.bookmarkBar) + countBookmarks(tree.roots.other);
    spinner.succeed(`Read ${count} bookmarks from ${browser}`);

    if (opts.dryRun) {
      log.warn("--dry-run: skipping Gist save");
      return;
    }

    const saveSpinner = log.step("Saving to GitHub Gist...");
    await saveBookmarks(tree);
    saveSpinner.succeed("Bookmarks saved to Gist");

    // Also pull extensions if available
    if (browser === "firefox") {
      const extPath = getFirefoxExtensionsDir();
      const rawExts = readFirefoxExtensions(extPath);
      const extList = firefoxExtensionsToCanonical(rawExts);
      await saveExtensions(extList);
      log.success(`Saved ${extList.entries.length} Firefox extensions to Gist`);
    } else if (browser === "chrome") {
      const extDir = getChromeExtensionsDir();
      const rawExts = readChromeExtensions(extDir);
      const extList = chromeExtensionsToCanonical(rawExts);
      await saveExtensions(extList);
      log.success(`Saved ${extList.entries.length} Chrome extensions to Gist`);
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

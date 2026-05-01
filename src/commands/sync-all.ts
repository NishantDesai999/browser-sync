import { existsSync } from "fs";
import { pull } from "./pull.js";
import { push } from "./push.js";
import { log } from "../utils/logger.js";
import { isFirefoxRunning } from "../browsers/firefox.js";
import { isSafariRunning } from "../browsers/safari.js";
import { getChromeBookmarksPath, getFirefoxPlacesDb, getSafariBookmarksPath } from "../utils/paths.js";

interface SyncAllOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

export async function syncAll(opts: SyncAllOptions): Promise<void> {
  log.info("Starting full sync across all browsers...\n");

  const ffDb = getFirefoxPlacesDb();
  const chromeBookmarks = getChromeBookmarksPath();
  const safariPlist = getSafariBookmarksPath();

  const ffAvailable = existsSync(ffDb);
  const chromeAvailable = existsSync(chromeBookmarks);
  const safariAvailable = existsSync(safariPlist);

  // --- Phase 1: Pull from every available browser ---
  log.info("Phase 1: Pulling from all browsers into Gist...");

  if (ffAvailable) {
    if (isFirefoxRunning()) {
      log.warn("Firefox is running — pull will read its current saved state");
    }
    await pull("firefox", opts);
  } else {
    log.warn("Firefox not found — skipping pull");
  }

  if (chromeAvailable) {
    await pull("chrome", opts);
  } else {
    log.warn("Chrome not found — skipping pull");
  }

  if (safariAvailable) {
    try {
      await pull("safari", opts);
    } catch (err) {
      log.warn(`Safari pull failed: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    }
  } else {
    log.warn("Safari not found — skipping pull");
  }

  // --- Phase 2: Push merged Gist to every available browser ---
  log.info("\nPhase 2: Pushing merged bookmarks to all browsers...");

  if (ffAvailable) {
    if (isFirefoxRunning()) {
      log.warn("Firefox is running — close it and re-run `browser-sync push firefox` to complete the push");
    } else {
      await push("firefox", opts);
    }
  }

  if (chromeAvailable) {
    await push("chrome", opts);
  }

  if (safariAvailable) {
    try {
      await push("safari", opts);
    } catch (err) {
      log.warn(`Safari push failed: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    }
  }

  log.success("\nFull sync complete. Restart any updated browsers to see changes.");
}

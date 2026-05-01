import { BrowserName } from "../types.js";
import { readFirefoxExtensions } from "../browsers/firefox.js";
import { readChromeExtensions } from "../browsers/chrome.js";
import { readSafariExtensions } from "../browsers/safari.js";
import {
  firefoxExtensionsToCanonical,
  chromeExtensionsToCanonical,
  mergeExtensionLists,
} from "../adapters/extension-adapter.js";
import { saveExtensions, loadExtensions } from "../store/gist-store.js";
import {
  getFirefoxExtensionsDir,
  getChromeExtensionsDir,
} from "../utils/paths.js";
import { log } from "../utils/logger.js";
import { ExtensionList } from "../types.js";

interface ExtensionsOptions {
  dryRun?: boolean;
  merge?: boolean;
}

export async function extensions(browser: BrowserName, opts: ExtensionsOptions): Promise<void> {
  const spinner = log.step(`Reading extensions from ${browser}...`);

  let newList: ExtensionList;
  try {
    if (browser === "firefox") {
      const raw = readFirefoxExtensions(getFirefoxExtensionsDir());
      newList = firefoxExtensionsToCanonical(raw);
    } else if (browser === "chrome") {
      const raw = readChromeExtensions(getChromeExtensionsDir());
      newList = chromeExtensionsToCanonical(raw);
    } else {
      readSafariExtensions();
      spinner.warn("Safari extensions cannot be read programmatically (App Store only)");
      log.info("Please install extensions manually from the App Store.");
      return;
    }
    spinner.succeed(`Found ${newList.entries.length} extensions in ${browser}`);
  } catch (err) {
    spinner.fail(`Failed to read ${browser} extensions`);
    throw err;
  }

  if (opts.merge) {
    const existing = await loadExtensions();
    if (existing) {
      newList = mergeExtensionLists([existing, newList]);
      log.info(`Merged with existing list — ${newList.entries.length} total entries`);
    }
  }

  if (!opts.dryRun) {
    const saveSpinner = log.step("Saving to GitHub Gist...");
    await saveExtensions(newList);
    saveSpinner.succeed("Extensions saved to Gist");
  } else {
    log.warn("--dry-run: skipping Gist save");
  }

  printExtensionTable(newList);
}

function printExtensionTable(list: ExtensionList): void {
  console.log("\n" + "─".repeat(80));
  console.log(
    `${"Name".padEnd(35)} ${"Firefox".padEnd(22)} ${"Chrome".padEnd(22)}`
  );
  console.log("─".repeat(80));
  for (const e of list.entries) {
    const ffCell = e.firefoxAmoUrl
      ? "AMO ✓"
      : e.firefoxId
      ? e.firefoxId.slice(0, 20)
      : "—";
    const chromeCell = e.chromeWebStoreId ? "Store ✓" : "—";
    console.log(
      `${e.name.slice(0, 34).padEnd(35)} ${ffCell.padEnd(22)} ${chromeCell.padEnd(22)}`
    );
  }
  console.log("─".repeat(80) + "\n");
}

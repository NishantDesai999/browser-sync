#!/usr/bin/env node
import { Command } from "commander";
import { BrowserName } from "./types.js";
import { init } from "./commands/init.js";
import { pull } from "./commands/pull.js";
import { push } from "./commands/push.js";
import { sync } from "./commands/sync.js";
import { extensions } from "./commands/extensions.js";
import { log } from "./utils/logger.js";

const VALID_BROWSERS: BrowserName[] = ["firefox", "chrome", "safari"];

function assertBrowser(name: string): BrowserName {
  if (!VALID_BROWSERS.includes(name as BrowserName)) {
    log.error(`Unknown browser "${name}". Valid options: ${VALID_BROWSERS.join(", ")}`);
    process.exit(1);
  }
  return name as BrowserName;
}

const program = new Command();

program
  .name("browser-sync")
  .description("Sync bookmarks and extensions across Chrome, Safari, and Firefox")
  .version("0.1.0");

program
  .command("init")
  .description("Set up GitHub token and create private Gist for storage")
  .action(async () => {
    try {
      await init();
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("pull <browser>")
  .description("Read bookmarks from browser and save to Gist (firefox | chrome | safari)")
  .option("--dry-run", "Show what would be saved without writing to Gist")
  .option("--verbose", "Print resolved file paths")
  .action(async (browser: string, opts: { dryRun?: boolean; verbose?: boolean }) => {
    try {
      await pull(assertBrowser(browser), opts);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("push <browser>")
  .description("Load bookmarks from Gist and write to browser (firefox | chrome | safari)")
  .option("--dry-run", "Show what would change without writing")
  .option("--verbose", "Print resolved file paths")
  .action(async (browser: string, opts: { dryRun?: boolean; verbose?: boolean }) => {
    try {
      await push(assertBrowser(browser), opts);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command("sync <from> <to>")
  .description("Pull from one browser and push to another in one step")
  .option("--dry-run", "Simulate without writing")
  .option("--verbose", "Print resolved file paths")
  .action(
    async (from: string, to: string, opts: { dryRun?: boolean; verbose?: boolean }) => {
      try {
        await sync(assertBrowser(from), assertBrowser(to), opts);
      } catch (err) {
        log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }
  );

program
  .command("extensions <browser>")
  .description("Export extension list from browser and save to Gist (firefox | chrome | safari)")
  .option("--dry-run", "Print list without saving to Gist")
  .option("--merge", "Merge with existing Gist extension list instead of replacing")
  .action(
    async (browser: string, opts: { dryRun?: boolean; merge?: boolean }) => {
      try {
        await extensions(assertBrowser(browser), opts);
      } catch (err) {
        log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }
  );

program.parseAsync(process.argv);

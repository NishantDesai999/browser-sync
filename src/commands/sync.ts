import { BrowserName } from "../types.js";
import { pull } from "./pull.js";
import { push } from "./push.js";
import { log } from "../utils/logger.js";

interface SyncOptions {
  dryRun?: boolean;
  verbose?: boolean;
}

export async function sync(from: BrowserName, to: BrowserName, opts: SyncOptions): Promise<void> {
  log.info(`Syncing ${from} → ${to}`);
  await pull(from, opts);
  await push(to, opts);
  log.success(`Sync complete: ${from} → ${to}`);
}

import { createInterface } from "readline";
import { initStore, getGistId } from "../store/gist-store.js";
import { log } from "../utils/logger.js";

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function init(): Promise<void> {
  const existingId = getGistId();
  if (existingId) {
    log.info(`Already initialized. Gist ID: ${existingId}`);
    log.info("Re-running will update your token but keep the same Gist.");
  }

  console.log("\nbrowser-sync needs a GitHub Personal Access Token with the `gist` scope.");
  console.log("Create one at: https://github.com/settings/tokens/new?scopes=gist\n");

  const token = await prompt("GitHub token (ghp_...): ");
  if (!token.startsWith("ghp_") && !token.startsWith("github_pat_")) {
    log.warn("Token doesn't look like a GitHub PAT — proceeding anyway.");
  }

  const spinner = log.step("Creating private Gist...");
  try {
    const gistId = await initStore(token);
    spinner.succeed(`Initialized! Gist ID: ${gistId}`);
    log.info('Run `browser-sync pull firefox` to sync your bookmarks.');
  } catch (err) {
    spinner.fail("Failed to create Gist — check your token has `gist` scope.");
    throw err;
  }
}

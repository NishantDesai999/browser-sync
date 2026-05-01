import chalk from "chalk";
import ora, { type Ora } from "ora";

const noColor = process.env.BROWSER_SYNC_NO_COLOR === "1" || !process.stdout.isTTY;

export const log = {
  info: (msg: string) => console.log(noColor ? msg : chalk.cyan("  " + msg)),
  success: (msg: string) => console.log(noColor ? "✓ " + msg : chalk.green("✓ ") + msg),
  warn: (msg: string) => console.warn(noColor ? "⚠ " + msg : chalk.yellow("⚠ ") + msg),
  error: (msg: string) => console.error(noColor ? "✗ " + msg : chalk.red("✗ ") + msg),
  step: (msg: string): Ora => ora({ text: msg, isSilent: noColor }).start(),
};

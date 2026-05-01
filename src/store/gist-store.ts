import { Octokit } from "@octokit/rest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { getConfigPath, getDataDir } from "../utils/paths.js";
import {
  BookmarkTree,
  ExtensionList,
  bookmarkTreeSchema,
  extensionListSchema,
} from "../types.js";

interface Config {
  githubToken: string;
  gistId?: string;
}

const GIST_DESCRIPTION = "browser-sync-data";
const BOOKMARKS_FILE = "bookmarks.json";
const EXTENSIONS_FILE = "extensions.json";

function readConfig(): Config {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      `Config not found. Run \`browser-sync init\` first to set up your GitHub token.`
    );
  }
  return JSON.parse(readFileSync(configPath, "utf-8")) as Config;
}

function writeConfig(config: Config): void {
  const dataDir = getDataDir();
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
}

function octokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

export async function initStore(token: string): Promise<string> {
  const config = existsSync(getConfigPath())
    ? (JSON.parse(readFileSync(getConfigPath(), "utf-8")) as Config)
    : { githubToken: token };

  config.githubToken = token;

  if (!config.gistId) {
    const kit = octokit(token);
    const response = await kit.gists.create({
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        [BOOKMARKS_FILE]: { content: "{}" },
        [EXTENSIONS_FILE]: { content: "{}" },
      },
    });
    config.gistId = response.data.id!;
  }

  writeConfig(config);
  return config.gistId!;
}

export async function loadBookmarks(): Promise<BookmarkTree | null> {
  const config = readConfig();
  if (!config.gistId) return null;

  const kit = octokit(config.githubToken);
  const response = await kit.gists.get({ gist_id: config.gistId });
  const content = response.data.files?.[BOOKMARKS_FILE]?.content;
  if (!content || content === "{}") return null;

  const parsed = JSON.parse(content);
  return bookmarkTreeSchema.parse(parsed);
}

export async function saveBookmarks(tree: BookmarkTree): Promise<void> {
  const config = readConfig();

  if (!config.gistId) {
    throw new Error("No Gist ID found in config. Run `browser-sync init` first.");
  }

  const kit = octokit(config.githubToken);
  await kit.gists.update({
    gist_id: config.gistId,
    files: {
      [BOOKMARKS_FILE]: { content: JSON.stringify(tree, null, 2) },
    },
  });
}

export async function loadExtensions(): Promise<ExtensionList | null> {
  const config = readConfig();
  if (!config.gistId) return null;

  const kit = octokit(config.githubToken);
  const response = await kit.gists.get({ gist_id: config.gistId });
  const content = response.data.files?.[EXTENSIONS_FILE]?.content;
  if (!content || content === "{}") return null;

  const parsed = JSON.parse(content);
  return extensionListSchema.parse(parsed);
}

export async function saveExtensions(list: ExtensionList): Promise<void> {
  const config = readConfig();

  if (!config.gistId) {
    throw new Error("No Gist ID found in config. Run `browser-sync init` first.");
  }

  const kit = octokit(config.githubToken);
  await kit.gists.update({
    gist_id: config.gistId,
    files: {
      [EXTENSIONS_FILE]: { content: JSON.stringify(list, null, 2) },
    },
  });
}

export function getGistId(): string | undefined {
  if (!existsSync(getConfigPath())) return undefined;
  const config = JSON.parse(readFileSync(getConfigPath(), "utf-8")) as Config;
  return config.gistId;
}

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const HOME = homedir();

export function getFirefoxProfilePath(): string {
  const firefoxDir = join(HOME, "Library/Application Support/Firefox");
  const profilesIni = join(firefoxDir, "profiles.ini");
  if (!existsSync(profilesIni)) {
    throw new Error(`Firefox profiles.ini not found at ${profilesIni}. Is Firefox installed?`);
  }

  const content = readFileSync(profilesIni, "utf-8");

  // Priority 1: [Install...] sections contain the active install's default profile.
  // This overrides the per-profile Default=1 flag when multiple installs are present.
  const installMatch = content.match(/\[Install[^\]]+\][^[]*Default=([^\n\r]+)/);
  if (installMatch) {
    const profilePath = installMatch[1].trim();
    // These paths from [Install...] are always relative to the Firefox directory
    const full = join(firefoxDir, profilePath);
    if (existsSync(full)) return full;
  }

  // Priority 2: Profile section with Default=1
  const profileSections = content.split(/(?=\[Profile\d+\])/);
  for (const section of profileSections) {
    if (/Default=1/.test(section)) {
      const pathMatch = section.match(/^Path=(.+)$/m);
      const isRelative = /IsRelative=1/.test(section);
      if (pathMatch) {
        const profilePath = pathMatch[1].trim();
        return isRelative ? join(firefoxDir, profilePath) : profilePath;
      }
    }
  }

  // Priority 3: First profile whose path contains "default-release"
  for (const section of profileSections) {
    const pathMatch = section.match(/^Path=(.+)$/m);
    const isRelative = /IsRelative=1/.test(section);
    if (pathMatch && pathMatch[1].includes("default-release")) {
      const profilePath = pathMatch[1].trim();
      return isRelative ? join(firefoxDir, profilePath) : profilePath;
    }
  }

  throw new Error("Could not determine Firefox default profile path from profiles.ini");
}

export function getFirefoxPlacesDb(profilePath?: string): string {
  const profile = profilePath ?? getFirefoxProfilePath();
  return join(profile, "places.sqlite");
}

export function getFirefoxExtensionsDir(profilePath?: string): string {
  const profile = profilePath ?? getFirefoxProfilePath();
  return join(profile, "extensions.json");
}

export function getChromeBookmarksPath(profile = "Default"): string {
  return join(HOME, `Library/Application Support/Google/Chrome/${profile}/Bookmarks`);
}

export function getChromeExtensionsDir(profile = "Default"): string {
  return join(HOME, `Library/Application Support/Google/Chrome/${profile}/Extensions`);
}

export function getSafariBookmarksPath(): string {
  return join(HOME, "Library/Safari/Bookmarks.plist");
}

export function getDataDir(): string {
  return join(HOME, ".browser-sync");
}

export function getConfigPath(): string {
  return join(getDataDir(), "config.json");
}

import Database from "better-sqlite3";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import { existsSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface SafeDb {
  db: Database.Database;
  cleanup: () => void;
}

export function openSafeDb(sourcePath: string): SafeDb {
  if (!existsSync(sourcePath)) {
    throw new Error(`SQLite database not found: ${sourcePath}`);
  }

  const tmpBase = join(tmpdir(), `bsync-${randomUUID()}`);
  const tmpPath = `${tmpBase}.sqlite`;
  const tempFiles = [tmpPath];

  // Copy DB and WAL/SHM sidecars so we don't touch the live file
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${sourcePath}${suffix}`;
    if (existsSync(sidecar)) {
      const tmpSidecar = `${tmpPath}${suffix}`;
      execSync(`cp "${sidecar}" "${tmpSidecar}"`);
      tempFiles.push(tmpSidecar);
    }
  }
  execSync(`cp "${sourcePath}" "${tmpPath}"`);

  const db = new Database(tmpPath, { readonly: true });

  // Merge WAL into the copy so we read committed data
  try {
    db.pragma("wal_checkpoint(FULL)");
  } catch {
    // No WAL mode — fine
  }

  const cleanup = () => {
    try { db.close(); } catch { /* ignore */ }
    for (const f of tempFiles) {
      try { if (existsSync(f)) unlinkSync(f); } catch { /* ignore */ }
    }
  };

  return { db, cleanup };
}

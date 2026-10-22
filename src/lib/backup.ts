import { spawn } from "child_process";
import { access, mkdir } from "fs/promises";
import path from "path";

export type BackupResult = { ok: true; file: string } | { ok: false; message: string };

export function backupDirectory(): string {
  return process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

// pg_dump is often installed outside PATH on Windows. Look in the usual
// PostgreSQL install folders before giving up.
async function resolvePgDump(): Promise<string | null> {
  if (process.env.PG_DUMP_PATH) return process.env.PG_DUMP_PATH;

  const candidates = [
    "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe",
    "C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe",
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  // Fall back to PATH; the caller reports a helpful error if it is missing.
  return "pg_dump";
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      stderr += "\npg_dump timed out after 2 minutes.";
    }, 120_000);

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
  });
}

// Creates a compressed custom-format dump before any destructive operation.
// Returns an error instead of throwing so the caller can abort the reset.
export async function createDatabaseBackup(): Promise<BackupResult> {
  const url = process.env.DATABASE_URL;
  if (!url) return { ok: false, message: "DATABASE_URL is not configured." };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: "DATABASE_URL is not a valid connection string." };
  }

  const database = parsed.pathname.replace(/^\//, "");
  if (!database) return { ok: false, message: "DATABASE_URL does not include a database name." };

  const pgDump = await resolvePgDump();
  if (!pgDump) {
    return {
      ok: false,
      message:
        'pg_dump was not found. Install PostgreSQL client tools or set PG_DUMP_PATH to the full pg_dump executable path.',
    };
  }

  const dir = backupDirectory();
  await mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `faculty-attendance-${database}-${stamp}.dump`);

  const args = [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    file,
    "--host",
    parsed.hostname || "localhost",
    "--port",
    parsed.port || "5432",
    "--username",
    decodeURIComponent(parsed.username || "postgres"),
    "--dbname",
    database,
  ];

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);

  const result = await run(pgDump, args, env);
  if (result.code !== 0) {
    const detail = result.stderr.trim().split(/\r?\n/).slice(-3).join(" ");
    return {
      ok: false,
      message: `pg_dump failed${detail ? `: ${detail}` : "."}`,
    };
  }

  return { ok: true, file };
}

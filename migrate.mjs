// Migration runner with tracking — applies pending migrations in order
import pg from "pg";
import { readFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = join(fileURLToPath(import.meta.url), "..");

function loadEnvLocal() {
  try {
    const txt = readFileSync(join(__dirname, ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnvLocal();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set in .env.local");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

async function ensureMigrationsTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations() {
  const result = await client.query("SELECT name FROM _migrations ORDER BY name");
  return result.rows.map((r) => r.name);
}

async function applyMigration(name, sql) {
  const txn = await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

async function getMigrationsDir() {
  return join(__dirname, "supabase", "migrations");
}

async function listMigrationFiles() {
  const dir = await getMigrationsDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files;
}

async function main() {
  try {
    await client.connect();
    await ensureMigrationsTable();

    const applied = await getAppliedMigrations();
    const files = await listMigrationFiles();
    const pending = files.filter((f) => !applied.includes(f));

    if (pending.length === 0) {
      console.log("✓ All migrations up to date");
      return;
    }

    console.log(`Applying ${pending.length} pending migration(s)...`);
    const dir = await getMigrationsDir();

    for (const file of pending) {
      const path = join(dir, file);
      const sql = readFileSync(path, "utf8");
      try {
        await applyMigration(file, sql);
        console.log(`✓ ${file}`);
      } catch (e) {
        console.error(`✗ ${file}: ${e.message}`);
        process.exitCode = 1;
        break;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exitCode = 1;
});

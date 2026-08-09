// Runner de migrations: node db-run.mjs <arquivo.sql>
// Lê DATABASE_URL do .env.local e executa o SQL no Postgres do Supabase.
import pg from "pg";
import { readFileSync } from "fs";

function loadEnvLocal() {
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
loadEnvLocal();

const file = process.argv[2];
if (!file) {
  console.error("Uso: node db-run.mjs <caminho-do-arquivo.sql>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida no .env.local");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log(`✓ Aplicado: ${file}`);
} catch (e) {
  console.error(`✗ Erro ao aplicar ${file}:`, e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

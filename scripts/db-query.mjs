// Consulta rápida: node db-query.mjs "select ..."
// Lê DATABASE_URL do .env.local (mesmo esquema do db-run.mjs).
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

const sql = process.argv[2];
if (!sql) {
  console.error('Uso: node db-query.mjs "select ..."');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const r = await client.query(sql);
  console.log(JSON.stringify(r.rows, null, 1));
} catch (e) {
  console.error("Erro:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

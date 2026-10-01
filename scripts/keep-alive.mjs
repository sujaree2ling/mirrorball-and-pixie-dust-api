import "dotenv/config";

if (!process.env.CONNECTION_STRING) {
  console.error("CONNECTION_STRING is not set");
  process.exit(1);
}

const { pool } = await import("../utils/db.mjs");

try {
  await pool.query("select 1");
  console.log(`Supabase keep-alive ok at ${new Date().toISOString()}`);
} catch (error) {
  console.error("Supabase keep-alive failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

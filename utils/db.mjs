import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.CONNECTION_STRING;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

export { pool };

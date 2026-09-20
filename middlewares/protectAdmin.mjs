import { pool } from "../utils/db.mjs";
import { supabase } from "../utils/supabase.mjs";
import { isAdminEmail } from "../utils/roles.mjs";

export default async function protectAdmin(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    if (!isAdminEmail(data.user.email)) {
      return res.status(403).json({
        error: `Admin only. Signed in as ${data.user.email || "unknown"}, but admin must be linglings@gmail.com.`,
      });
    }

    const { rows } = await pool.query(`select role from users where id = $1`, [
      data.user.id,
    ]);

    if (!rows.length) {
      const username = (data.user.email || "admin")
        .split("@")[0]
        .replace(/[^a-zA-Z0-9_]/g, "");

      await pool.query(
        `insert into users (id, username, name, role)
         values ($1, $2, $3, 'admin')
         on conflict (id) do update set role = 'admin'`,
        [data.user.id, username || "admin", username || "Admin"],
      );
    } else if (rows[0].role !== "admin") {
      await pool.query(`update users set role = $1 where id = $2`, [
        "admin",
        data.user.id,
      ]);
    }

    req.user = { ...data.user, role: "admin" };
    next();
  } catch (error) {
    console.error("protectAdmin error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

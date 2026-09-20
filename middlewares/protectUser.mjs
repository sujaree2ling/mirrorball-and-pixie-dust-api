import { supabase } from "../utils/supabase.mjs";

export default async function protectUser(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: "Unauthorized: Invalid token" });
    }

    req.user = { ...data.user };
    next();
  } catch (error) {
    console.error("protectUser error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

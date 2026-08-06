import { Router } from "express";
import { pool } from "../utils/db.mjs";
import { supabase } from "../utils/supabase.mjs";
import protectUser from "../middlewares/protectUser.mjs";
import { imageFileUpload } from "../middlewares/upload.mjs";
import { uploadImageFile } from "../utils/uploadImage.mjs";
import { getRoleForEmail } from "../utils/roles.mjs";

const authRouter = Router();

async function ensureUserProfile(authUser, { username, name } = {}) {
  const role = getRoleForEmail(authUser.email);
  const { rows } = await pool.query(`select * from users where id = $1`, [
    authUser.id,
  ]);

  if (rows[0]) {
    if (rows[0].role !== role) {
      await pool.query(`update users set role = $1 where id = $2`, [
        role,
        authUser.id,
      ]);
      return { ...rows[0], role };
    }
    return rows[0];
  }

  const emailPrefix = (authUser.email || "user")
    .split("@")[0]
    .replace(/[^a-zA-Z0-9_]/g, "");
  let finalUsername =
    username || emailPrefix || `user_${authUser.id.slice(0, 8)}`;
  const finalName = name || finalUsername;

  const { rows: taken } = await pool.query(
    `select id from users where username = $1`,
    [finalUsername],
  );
  if (taken.length > 0) {
    finalUsername = `${finalUsername}_${authUser.id.slice(0, 4)}`;
  }

  const { rows: inserted } = await pool.query(
    `insert into users (id, username, name, role)
     values ($1, $2, $3, $4)
     returning *`,
    [authUser.id, finalUsername, finalName, role],
  );

  return inserted[0];
}

authRouter.post("/register", async (req, res) => {
  const { email, password, username, name } = req.body;

  try {
    const { rows: existingUser } = await pool.query(
      `select * from users where username = $1`,
      [username],
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ error: "This username is already taken" });
    }

    const { data, error: supabaseError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (supabaseError) {
      if (supabaseError.code === "user_already_exists") {
        return res
          .status(400)
          .json({ error: "User with this email already exists" });
      }

      return res
        .status(400)
        .json({ error: "Failed to create user. Please try again." });
    }

    const profile = await ensureUserProfile(data.user, { username, name });

    return res.status(201).json({
      message: "User created successfully",
      user: profile,
    });
  } catch (error) {
    console.error("Register error:", error);
    return res
      .status(500)
      .json({ error: "An error occurred during registration" });
  }
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (
        error.code === "invalid_credentials" ||
        error.message.includes("Invalid login credentials")
      ) {
        return res.status(400).json({
          error: "Your password is incorrect or this email doesn't exist",
        });
      }

      return res.status(400).json({ error: error.message });
    }

    const profile = await ensureUserProfile(data.user);
    const role = getRoleForEmail(data.user.email ?? email);

    return res.status(200).json({
      message: "Signed in successfully",
      access_token: data.session.access_token,
      role: profile.role || role,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "An error occurred during login" });
  }
});

authRouter.get("/get-user", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      return res.status(401).json({ error: "Unauthorized or token expired" });
    }

    const profile = await ensureUserProfile(data.user);
    const role = getRoleForEmail(data.user.email);

    return res.status(200).json({
      id: data.user.id,
      email: data.user.email,
      username: profile.username,
      name: profile.name,
      role,
      profilePic: profile.profile_pic,
    });
  } catch (error) {
    console.error("Get user error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.put(
  "/profile",
  protectUser,
  imageFileUpload,
  async (req, res) => {
    const userId = req.user.id;
    const { name, username } = req.body;
    const file = req.files?.imageFile?.[0];

    if (!name?.trim() || !username?.trim()) {
      return res.status(400).json({ error: "Name and username are required" });
    }

    try {
      const { rows: existingUsername } = await pool.query(
        `select id from users where username = $1 and id <> $2`,
        [username.trim(), userId],
      );

      if (existingUsername.length > 0) {
        return res.status(400).json({ error: "This username is already taken" });
      }

      let profilePic = null;

      if (file) {
        profilePic = await uploadImageFile(file, "profiles");
      }

      const { rows } = await pool.query(
        `update users
         set name = $1,
             username = $2,
             profile_pic = coalesce($3, profile_pic)
         where id = $4
         returning *`,
        [name.trim(), username.trim(), profilePic, userId],
      );

      if (!rows[0]) {
        return res.status(404).json({ error: "User profile not found" });
      }

      return res.status(200).json({
        message: "Profile updated successfully",
        user: {
          id: rows[0].id,
          email: req.user.email,
          username: rows[0].username,
          name: rows[0].name,
          role: getRoleForEmail(req.user.email),
          profilePic: rows[0].profile_pic,
        },
      });
    } catch (error) {
      console.error("Update profile error:", error);
      return res.status(500).json({
        error: error.message || "An error occurred while updating profile",
      });
    }
  },
);

authRouter.put("/reset-password", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { oldPassword, newPassword } = req.body;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token missing" });
  }

  if (!newPassword) {
    return res.status(400).json({ error: "New password is required" });
  }

  try {
    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return res.status(401).json({ error: "Unauthorized or token expired" });
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: userData.user.email,
      password: oldPassword,
    });

    if (loginError) {
      return res.status(400).json({ error: "Invalid old password" });
    }

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default authRouter;

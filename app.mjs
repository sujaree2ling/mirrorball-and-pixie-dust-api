import "dotenv/config";
import express from "express";
import cors from "cors";
import postsRouter from "./routes/posts.mjs";
import authRouter from "./routes/auth.mjs";
import protectUser from "./middlewares/protectUser.mjs";
import protectAdmin from "./middlewares/protectAdmin.mjs";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

const allowedOrigins = [
  "http://localhost:5173", // Vite frontend (local)
  "http://localhost:3000",
  "https://mirrorball-and-pixie-dust.vercel.app",
];

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser tools (no Origin) and Vercel preview URLs
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);

app.use("/auth", authRouter);
app.use("/posts", postsRouter);

app.get("/protected-route", protectUser, (req, res) => {
  res.json({ message: "This is protected content", user: req.user });
});

app.get("/admin-only", protectAdmin, (req, res) => {
  res.json({ message: "This is admin-only content", admin: req.user });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

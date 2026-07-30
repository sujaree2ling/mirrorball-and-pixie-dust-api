import "dotenv/config";
import express from "express";
import cors from "cors";
import postsRouter from "./routes/posts.mjs";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5173", // Vite frontend (local)
      "http://localhost:3000",
      "https://mirrorball-and-pixie-dust.vercel.app",
    ],
  })
);

app.use("/posts", postsRouter);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

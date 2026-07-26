import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5173", // Vite frontend (local)
      "http://localhost:3000",
      // Replace with your deployed frontend URL when ready:
      // "https://your-frontend.vercel.app",
    ],
  })
);

app.get("/health", (req, res) => {
  res.status(200).json({ message: "OK" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

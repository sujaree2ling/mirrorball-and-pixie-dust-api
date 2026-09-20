import "dotenv/config";
import express from "express";
import cors from "cors";
import { pool } from "./utils/db.mjs";

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

app.post("/assignments", async (req, res) => {
  const { title, image, category_id, description, content, status_id } =
    req.body;

  if (
    !title ||
    !image ||
    !category_id ||
    !description ||
    !content ||
    !status_id
  ) {
    return res.status(400).json({
      message:
        "Server could not create post because there are missing data from client",
    });
  }

  try {
    await pool.query(
      `insert into posts (title, image, category_id, description, content, status_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [title, image, category_id, description, content, status_id]
    );

    return res.status(201).json({
      message: "Created post sucessfully",
    });
  } catch {
    return res.status(500).json({
      message: "Server could not create post because database connection",
    });
  }
});

const postSelectQuery = `
  select
    posts.id,
    posts.image,
    categories.name as category,
    posts.title,
    posts.description,
    posts.date,
    posts.content,
    statuses.status,
    posts.likes_count
  from posts
  inner join categories on posts.category_id = categories.id
  inner join statuses on posts.status_id = statuses.id
`;

app.get("/posts", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 6;
    const category = req.query.category;
    const keyword = req.query.keyword;

    const conditions = [];
    const values = [];

    if (category) {
      values.push(category);
      conditions.push(`categories.name ilike $${values.length}`);
    }

    if (keyword) {
      values.push(`%${keyword}%`);
      const keywordParam = `$${values.length}`;
      conditions.push(
        `(posts.title ilike ${keywordParam} or posts.description ilike ${keywordParam} or posts.content ilike ${keywordParam})`
      );
    }

    const whereClause =
      conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

    const countResult = await pool.query(
      `select count(*)::int as total
       from posts
       inner join categories on posts.category_id = categories.id
       inner join statuses on posts.status_id = statuses.id
       ${whereClause}`,
      values
    );

    const totalPosts = countResult.rows[0].total;
    const totalPages = Math.ceil(totalPosts / limit) || 0;
    const offset = (page - 1) * limit;

    const dataValues = [...values, limit, offset];
    const limitParam = `$${values.length + 1}`;
    const offsetParam = `$${values.length + 2}`;

    const result = await pool.query(
      `${postSelectQuery}
       ${whereClause}
       order by posts.id asc
       limit ${limitParam} offset ${offsetParam}`,
      dataValues
    );

    return res.status(200).json({
      totalPosts,
      totalPages,
      currentPage: page,
      limit,
      posts: result.rows,
      nextPage: page < totalPages ? page + 1 : null,
    });
  } catch {
    return res.status(500).json({
      message: "Server could not read post because database connection",
    });
  }
});

app.get("/posts/:postId", async (req, res) => {
  const postId = req.params.postId;

  try {
    const result = await pool.query(
      `${postSelectQuery}
       where posts.id = $1`,
      [postId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        message: "Server could not find a requested post",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch {
    return res.status(500).json({
      message: "Server could not read post because database connection",
    });
  }
});

app.put("/posts/:postId", async (req, res) => {
  const postId = req.params.postId;
  const { title, image, category_id, description, content, status_id } =
    req.body;

  try {
    const result = await pool.query(
      `update posts
       set title = $1,
           image = $2,
           category_id = $3,
           description = $4,
           content = $5,
           status_id = $6
       where id = $7`,
      [title, image, category_id, description, content, status_id, postId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Server could not find a requested post to update",
      });
    }

    return res.status(200).json({
      message: "Updated post sucessfully",
    });
  } catch {
    return res.status(500).json({
      message: "Server could not update post because database connection",
    });
  }
});

app.delete("/posts/:postId", async (req, res) => {
  const postId = req.params.postId;

  try {
    const result = await pool.query(`delete from posts where id = $1`, [
      postId,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Server could not find a requested post to delete",
      });
    }

    return res.status(200).json({
      message: "Deleted post sucessfully",
    });
  } catch {
    return res.status(500).json({
      message: "Server could not delete post because database connection",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

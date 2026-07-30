import { Router } from "express";
import { pool } from "../utils/db.mjs";
import { validatePostData } from "../middlewares/postValidation.mjs";

const postsRouter = Router();

function mapPost(row) {
  if (!row) return null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    content: row.content,
    category: row.category,
    image: row.image,
    imagePosition: row.image_position ?? "center",
    author: row.author,
    date: row.date,
    likes: row.likes ?? 0,
    status: row.status ?? "published",
  };
}

postsRouter.post("/", validatePostData, async (req, res) => {
  const {
    title,
    image,
    category,
    description,
    content,
    status = "published",
    image_position = "center",
    author = "Admin",
    likes = 0,
    date,
  } = req.body;

  try {
    const result = await pool.query(
      `insert into posts (
         id, title, image, category, description, content,
         status, image_position, author, likes, date
       )
       values (
         coalesce((select max(id) from posts), 0) + 1,
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         coalesce($10::date, current_date)
       )
       returning *`,
      [
        title,
        image,
        category,
        description,
        content,
        status,
        image_position,
        author,
        likes,
        date ?? null,
      ]
    );

    return res.status(201).json({
      message: "Created post sucessfully",
      post: mapPost(result.rows[0]),
    });
  } catch (error) {
    console.error("Create post error:", error);
    return res.status(500).json({
      message: "Server could not create post because database connection",
    });
  }
});

postsRouter.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 6;
    const category = req.query.category;
    const keyword = req.query.keyword;
    const status = req.query.status || "published";

    const conditions = [];
    const values = [];

    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }

    if (category) {
      values.push(category);
      conditions.push(`category ilike $${values.length}`);
    }

    if (keyword) {
      values.push(`%${keyword}%`);
      const keywordParam = `$${values.length}`;
      conditions.push(
        `(title ilike ${keywordParam} or description ilike ${keywordParam} or content ilike ${keywordParam})`
      );
    }

    const whereClause =
      conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

    const countResult = await pool.query(
      `select count(*)::int as total from posts ${whereClause}`,
      values
    );

    const totalPosts = countResult.rows[0].total;
    const totalPages = Math.max(1, Math.ceil(totalPosts / limit) || 1);
    const offset = (page - 1) * limit;

    const dataValues = [...values, limit, offset];
    const limitParam = `$${values.length + 1}`;
    const offsetParam = `$${values.length + 2}`;

    const result = await pool.query(
      `select *
       from posts
       ${whereClause}
       order by date desc, id desc
       limit ${limitParam} offset ${offsetParam}`,
      dataValues
    );

    return res.status(200).json({
      totalPosts,
      totalPages,
      currentPage: page,
      limit,
      posts: result.rows.map(mapPost),
      nextPage: page < totalPages ? page + 1 : null,
    });
  } catch (error) {
    console.error("Read posts error:", error);
    return res.status(500).json({
      message: "Server could not read post because database connection",
    });
  }
});

postsRouter.get("/:postId", async (req, res) => {
  const postId = req.params.postId;

  try {
    const result = await pool.query(`select * from posts where id = $1`, [
      postId,
    ]);

    if (!result.rows[0]) {
      return res.status(404).json({
        message: "Server could not find a requested post",
      });
    }

    return res.status(200).json(mapPost(result.rows[0]));
  } catch (error) {
    console.error("Read post error:", error);
    return res.status(500).json({
      message: "Server could not read post because database connection",
    });
  }
});

postsRouter.put("/:postId", validatePostData, async (req, res) => {
  const postId = req.params.postId;
  const {
    title,
    image,
    category,
    description,
    content,
    status = "published",
    image_position = "center",
    author,
    likes,
    date,
  } = req.body;

  try {
    const result = await pool.query(
      `update posts
       set title = $1,
           image = $2,
           category = $3,
           description = $4,
           content = $5,
           status = $6,
           image_position = $7,
           author = coalesce($8, author),
           likes = coalesce($9, likes),
           date = coalesce($10::date, date)
       where id = $11
       returning *`,
      [
        title,
        image,
        category,
        description,
        content,
        status,
        image_position,
        author ?? null,
        likes ?? null,
        date ?? null,
        postId,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Server could not find a requested post to update",
      });
    }

    return res.status(200).json({
      message: "Updated post sucessfully",
      post: mapPost(result.rows[0]),
    });
  } catch (error) {
    console.error("Update post error:", error);
    return res.status(500).json({
      message: "Server could not update post because database connection",
    });
  }
});

postsRouter.delete("/:postId", async (req, res) => {
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
  } catch (error) {
    console.error("Delete post error:", error);
    return res.status(500).json({
      message: "Server could not delete post because database connection",
    });
  }
});

export default postsRouter;

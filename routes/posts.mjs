import { Router } from "express";
import { pool } from "../utils/db.mjs";
import { supabase } from "../utils/supabase.mjs";
import { validatePostData } from "../middlewares/postValidation.mjs";
import { imageFileUpload } from "../middlewares/upload.mjs";
import protectAdmin from "../middlewares/protectAdmin.mjs";
import protectUser from "../middlewares/protectUser.mjs";
import { uploadImageFile } from "../utils/uploadImage.mjs";
import {
  notifyPostOwners,
  notifyThreadCommenters,
} from "../utils/notifications.mjs";

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

function getUploadedFile(req) {
  return req.files?.imageFile?.[0] ?? null;
}

async function resolveImageUrl(req) {
  const file = getUploadedFile(req);

  if (file) {
    return uploadImageFile(file, "posts");
  }

  return req.body.image;
}

postsRouter.post(
  "/",
  protectAdmin,
  imageFileUpload,
  validatePostData,
  async (req, res) => {
    const {
      title,
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
      const image = await resolveImageUrl(req);

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
        error: error.message,
      });
    }
  }
);

postsRouter.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 6;
    const category = req.query.category;
    const keyword = req.query.keyword;
    const statusParam = req.query.status;
    const status =
      statusParam === undefined || statusParam === ""
        ? "published"
        : statusParam;

    const conditions = [];
    const values = [];

    if (status && status !== "all") {
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

function mapComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    author: row.name || row.username || "User",
    avatar: row.profile_pic || "/icon.png",
    date: row.created_at,
    content: row.comment_text ?? row.content,
  };
}

postsRouter.get("/:postId/comments", async (req, res) => {
  const postId = req.params.postId;

  try {
    const post = await pool.query(`select id from posts where id = $1`, [
      postId,
    ]);

    if (!post.rows[0]) {
      return res.status(404).json({ error: "Post not found" });
    }

    const { rows } = await pool.query(
      `select c.id, c.post_id, c.comment_text, c.created_at,
              u.name, u.username, u.profile_pic
       from comments c
       join users u on u.id = c.user_id
       where c.post_id = $1
       order by c.created_at desc`,
      [postId],
    );

    return res.status(200).json({ comments: rows.map(mapComment) });
  } catch (error) {
    console.error("Read comments error:", error);
    return res.status(500).json({ error: "Failed to load comments" });
  }
});

postsRouter.post("/:postId/comments", protectUser, async (req, res) => {
  const postId = req.params.postId;
  const content =
    typeof req.body?.content === "string" ? req.body.content.trim() : "";

  if (!content) {
    return res.status(400).json({ error: "Comment content is required" });
  }

  if (content.length > 2000) {
    return res.status(400).json({ error: "Comment is too long" });
  }

  try {
    const post = await pool.query(`select id from posts where id = $1`, [
      postId,
    ]);

    if (!post.rows[0]) {
      return res.status(404).json({ error: "Post not found" });
    }

    const { rows } = await pool.query(
      `with inserted as (
         insert into comments (post_id, user_id, comment_text)
         values ($1, $2, $3)
         returning id, post_id, comment_text, created_at, user_id
       )
       select i.id, i.post_id, i.comment_text, i.created_at,
              u.name, u.username, u.profile_pic
       from inserted i
       join users u on u.id = i.user_id`,
      [postId, req.user.id, content],
    );

    await notifyPostOwners({
      actorId: req.user.id,
      postId,
      type: "comment",
      excerpt: content,
    });
    await notifyThreadCommenters({
      actorId: req.user.id,
      postId,
      excerpt: content,
    });

    return res.status(201).json({ comment: mapComment(rows[0]) });
  } catch (error) {
    console.error("Create comment error:", error);
    return res.status(500).json({ error: "Failed to create comment" });
  }
});

postsRouter.get("/:postId/like", async (req, res) => {
  const postId = req.params.postId;
  const token = req.headers.authorization?.split(" ")[1];

  try {
    const post = await pool.query(`select id, likes from posts where id = $1`, [
      postId,
    ]);

    if (!post.rows[0]) {
      return res.status(404).json({ error: "Post not found" });
    }

    let liked = false;

    if (token) {
      const { data, error } = await supabase.auth.getUser(token);

      if (!error && data?.user?.id) {
        const like = await pool.query(
          `select 1 from post_likes where post_id = $1 and user_id = $2`,
          [postId, data.user.id],
        );
        liked = like.rows.length > 0;
      }
    }

    return res.status(200).json({
      likes: post.rows[0].likes ?? 0,
      liked,
    });
  } catch (error) {
    console.error("Read like status error:", error);
    return res.status(500).json({ error: "Failed to load like status" });
  }
});

postsRouter.post("/:postId/like", protectUser, async (req, res) => {
  const postId = req.params.postId;
  const userId = req.user.id;

  try {
    const post = await pool.query(`select id, likes from posts where id = $1`, [
      postId,
    ]);

    if (!post.rows[0]) {
      return res.status(404).json({ error: "Post not found" });
    }

    const existing = await pool.query(
      `select 1 from post_likes where post_id = $1 and user_id = $2`,
      [postId, userId],
    );

    let liked;

    if (existing.rows.length > 0) {
      await pool.query(
        `delete from post_likes where post_id = $1 and user_id = $2`,
        [postId, userId],
      );
      await pool.query(
        `update posts
         set likes = greatest(coalesce(likes, 0) - 1, 0)
         where id = $1`,
        [postId],
      );
      liked = false;
    } else {
      await pool.query(
        `insert into post_likes (post_id, user_id) values ($1, $2)`,
        [postId, userId],
      );
      await pool.query(
        `update posts set likes = coalesce(likes, 0) + 1 where id = $1`,
        [postId],
      );
      liked = true;

      await notifyPostOwners({
        actorId: userId,
        postId,
        type: "like",
      });
    }

    const updated = await pool.query(`select likes from posts where id = $1`, [
      postId,
    ]);

    return res.status(200).json({
      liked,
      likes: updated.rows[0]?.likes ?? 0,
    });
  } catch (error) {
    console.error("Toggle like error:", error);
    return res.status(500).json({ error: "Failed to update like" });
  }
});

postsRouter.put(
  "/:postId",
  protectAdmin,
  imageFileUpload,
  validatePostData,
  async (req, res) => {
    const postId = req.params.postId;
    const {
      title,
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
      const image = await resolveImageUrl(req);

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
        error: error.message,
      });
    }
  }
);

postsRouter.delete("/:postId", protectAdmin, async (req, res) => {
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

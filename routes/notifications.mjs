import { Router } from "express";
import protectUser from "../middlewares/protectUser.mjs";
import { pool } from "../utils/db.mjs";

const notificationsRouter = Router();

function formatNotificationTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  return date
    .toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", " at");
}

function mapNotification(row) {
  const articleTitle = row.post_title || "an article";
  const author = row.actor_name || row.actor_username || "Someone";
  const avatar = row.actor_avatar || "/icon.png";
  const viewTo = row.post_id ? `/post/${row.post_id}` : null;

  if (row.type === "like") {
    return {
      id: row.id,
      type: row.type,
      author,
      avatar,
      action: "liked your article:",
      message: "liked your article.",
      articleTitle,
      excerpt: null,
      time: formatNotificationTime(row.created_at),
      createdAt: row.created_at,
      viewTo,
    };
  }

  if (row.type === "thread_comment") {
    return {
      id: row.id,
      type: row.type,
      author,
      avatar,
      action: "Comment on the article you have commented on.",
      message: "Comment on the article you have commented on.",
      articleTitle,
      excerpt: row.excerpt || null,
      time: formatNotificationTime(row.created_at),
      createdAt: row.created_at,
      viewTo,
    };
  }

  return {
    id: row.id,
    type: row.type,
    author,
    avatar,
    action: "Commented on your article:",
    message: "Commented on your article.",
    articleTitle,
    excerpt: row.excerpt || null,
    time: formatNotificationTime(row.created_at),
    createdAt: row.created_at,
    viewTo,
  };
}

notificationsRouter.get("/", protectUser, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `select n.id, n.type, n.excerpt, n.created_at, n.post_id,
              p.title as post_title,
              u.name as actor_name,
              u.username as actor_username,
              u.profile_pic as actor_avatar
       from notifications n
       left join posts p on p.id = n.post_id
       left join users u on u.id = n.actor_id
       where n.recipient_id = $1
       order by n.created_at desc
       limit 50`,
      [req.user.id],
    );

    return res.status(200).json({
      notifications: rows.map(mapNotification),
    });
  } catch (error) {
    console.error("Read notifications error:", error);
    return res.status(500).json({ error: "Failed to load notifications" });
  }
});

export default notificationsRouter;

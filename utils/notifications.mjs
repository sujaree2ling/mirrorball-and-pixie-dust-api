import { pool } from "./db.mjs";

async function insertNotifications(recipientIds, { actorId, postId, type, excerpt }) {
  const uniqueIds = [...new Set(recipientIds)].filter(
    (id) => id && id !== actorId,
  );

  if (uniqueIds.length === 0) return;

  await pool.query(
    `insert into notifications (recipient_id, actor_id, post_id, type, excerpt)
     select unnest($1::uuid[]), $2, $3, $4, $5`,
    [uniqueIds, actorId, postId, type, excerpt ?? null],
  );
}

export async function notifyPostOwners({ actorId, postId, type, excerpt }) {
  const { rows } = await pool.query(
    `select id from users where role = 'admin'`,
  );

  await insertNotifications(
    rows.map((row) => row.id),
    { actorId, postId, type, excerpt },
  );
}

export async function notifyThreadCommenters({ actorId, postId, excerpt }) {
  const { rows } = await pool.query(
    `select distinct c.user_id as id
     from comments c
     join users u on u.id = c.user_id
     where c.post_id = $1
       and c.user_id is not null
       and c.user_id <> $2
       and coalesce(u.role, 'user') <> 'admin'`,
    [postId, actorId],
  );

  await insertNotifications(
    rows.map((row) => row.id),
    {
      actorId,
      postId,
      type: "thread_comment",
      excerpt,
    },
  );
}

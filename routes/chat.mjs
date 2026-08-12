import { Router } from "express";
import { pool } from "../utils/db.mjs";

const chatRouter = Router();

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY = 8;
const MAX_CONTEXT_POSTS = 8;
const MAX_CONTENT_CHARS = 600;

async function getBlogContext() {
  const { rows } = await pool.query(
    `select id, title, category, description, content
     from posts
     where status = 'published'
     order by date desc nulls last, id desc
     limit $1`,
    [MAX_CONTEXT_POSTS],
  );

  if (!rows.length) {
    return "No published articles are available yet.";
  }

  return rows
    .map((post, index) => {
      const excerpt = (post.content || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_CONTENT_CHARS);

      return [
        `Article ${index + 1}`,
        `ID: ${post.id}`,
        `Title: ${post.title}`,
        `Category: ${post.category}`,
        `Summary: ${post.description || "-"}`,
        `Excerpt: ${excerpt}${excerpt.length >= MAX_CONTENT_CHARS ? "..." : ""}`,
      ].join("\n");
    })
    .join("\n\n");
}

function buildMessages(userMessage, history, blogContext) {
  const systemPrompt = `You are the helpful assistant for LingLingS, a personal blog by Sujaree S. about Taylor Swift and Disney.

Rules:
- Answer based on the blog article context below when possible.
- If the answer is not in the context, say you are not sure and suggest browsing the articles.
- Keep answers concise and friendly (2-6 short sentences).
- Reply in the same language the user uses (Thai or English).
- When relevant, mention article titles and that readers can open /post/{id}.
- Do not invent articles that are not listed.

Blog article context:
${blogContext}`;

  const messages = [{ role: "system", content: systemPrompt }];

  const safeHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY) : [];

  for (const item of safeHistory) {
    if (
      !item ||
      (item.role !== "user" && item.role !== "assistant") ||
      typeof item.content !== "string" ||
      !item.content.trim()
    ) {
      continue;
    }

    messages.push({
      role: item.role,
      content: item.content.trim().slice(0, MAX_MESSAGE_LENGTH),
    });
  }

  messages.push({ role: "user", content: userMessage });
  return messages;
}

chatRouter.post("/", async (req, res) => {
  const { message, history = [] } = req.body ?? {};
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error:
        "Chat is not configured yet. Add OPENAI_API_KEY to the API environment.",
    });
  }

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  const userMessage = message.trim().slice(0, MAX_MESSAGE_LENGTH);

  try {
    const blogContext = await getBlogContext();
    const messages = buildMessages(userMessage, history, blogContext);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages,
        temperature: 0.5,
        max_tokens: 400,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI chat error:", data);
      return res.status(502).json({
        error: data?.error?.message || "Failed to get a reply from the AI",
      });
    }

    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({ error: "Empty reply from the AI" });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Chat route error:", error);
    return res.status(500).json({ error: "Failed to process chat message" });
  }
});

export default chatRouter;

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

function buildSystemPrompt(blogContext) {
  return `You are the helpful assistant for LingLingS, a personal blog by Sujaree S. about Taylor Swift and Disney.

Always reply with the final answer only.
Do not write analysis labels, checklists, "review against rules", or hidden reasoning.
Do not start with labels like "Context-based" or "Rules".

What you can answer:
- Anything about Taylor Swift: songs, lyrics, albums, eras, meanings, interpretations, Easter eggs, tours, and related stories.
- Anything about Disney: movies, characters, songs, themes, and storytelling.
- Questions about this blog and its published articles when relevant.

How to answer:
- You do NOT need to limit answers only to the blog article context below.
- For lyric interpretation or deeper meaning questions, give a thoughtful clear explanation even if the exact lyric is not in the blog.
- If the question relates to a published blog article, you may mention that article and /post/{id}.
- Keep answers friendly and clear. Prefer 3-8 short sentences, or short bullet points when useful.
- Reply in the same language the user uses (Thai or English).
- When answering in Thai, write in a natural neutral tone. Do not use ending particles such as คะ, ค่ะ, ครับ, นะ, อะ, จ้า, or similar polite/chatty endings.
- If you are unsure about a very obscure fact, say so briefly and still share the most likely interpretation.

Optional blog article context (use when helpful, not as a hard limit):
${blogContext}`;
}

function buildGeminiContents(userMessage, history) {
  const contents = [];
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

    contents.push({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content.trim().slice(0, MAX_MESSAGE_LENGTH) }],
    });
  }

  contents.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  return contents;
}

function extractReply(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];

  const text = parts
    .filter((part) => typeof part.text === "string" && !part.thought)
    .map((part) => part.text)
    .join("")
    .trim();

  return text;
}

function looksLikeBadReply(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes("review against rules") ||
    lower.startsWith("context-based") ||
    lower.startsWith("**review") ||
    /^[-*]\s*context/i.test(text)
  );
}

chatRouter.post("/", async (req, res) => {
  const { message, history = [] } = req.body ?? {};
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error:
        "Chat is not configured yet. Add GEMINI_API_KEY to the API environment.",
    });
  }

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  const userMessage = message.trim().slice(0, MAX_MESSAGE_LENGTH);
  const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";

  try {
    const blogContext = await getBlogContext();
    const contents = buildGeminiContents(userMessage, history);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: buildSystemPrompt(blogContext) }],
          },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 800,
          },
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini chat error:", data);
      return res.status(502).json({
        error: data?.error?.message || "Failed to get a reply from the AI",
      });
    }

    const reply = extractReply(data);

    if (!reply || looksLikeBadReply(reply)) {
      console.error("Gemini bad reply:", {
        finishReason: data.candidates?.[0]?.finishReason,
        reply,
      });
      return res.status(502).json({
        error: "The AI returned an incomplete answer. Please try again.",
      });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Chat route error:", error);
    return res.status(500).json({ error: "Failed to process chat message" });
  }
});

export default chatRouter;

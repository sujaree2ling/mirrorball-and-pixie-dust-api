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

Accuracy rules for lyrics / song facts:
- Use Google Search grounding to verify song title and album before answering.
- Never guess a song from theme similarity alone (for example, lyrics about colors or light are NOT automatically from Daylight).
- Match the lyric wording carefully. Similar metaphors across songs are easy to confuse.
- If you cannot verify the song with high confidence, say you are unsure instead of inventing a title.
- After identifying the correct song, explain the meaning clearly.

Blog citation rules:
- Only mention a blog article and /post/{id} if that article clearly discusses the same song, lyric, or topic.
- Never invent a blog source. Never say the answer is "ตามแนวคิดจากบทความ" unless the article truly covers it.
- If no article matches, answer from verified knowledge and skip any /post link.

General style:
- Keep answers friendly and clear. Prefer 3-8 short sentences, or short bullet points when useful.
- Reply in the same language the user uses (Thai or English).
- When answering in Thai, write in a natural neutral tone. Do not use ending particles such as คะ, ค่ะ, ครับ, นะ, อะ, จ้า, or similar polite/chatty endings.

Optional blog article context (secondary reference only):
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

function mapGeminiErrorMessage(message = "", status = 0) {
  const text = String(message);

  if (
    status === 429 ||
    /exceeded your current quota|quota|rate.?limit|resource.?exhausted/i.test(
      text,
    )
  ) {
    return "You exceeded your current quota";
  }

  return text || "Failed to get a reply from the AI";
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
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";

  try {
    const blogContext = await getBlogContext();
    const contents = buildGeminiContents(userMessage, history);

    const requestBody = {
      system_instruction: {
        parts: [{ text: buildSystemPrompt(blogContext) }],
      },
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 800,
      },
      // Ground lyric/song facts with live web search when available
      tools: [{ google_search: {} }],
    };

    let response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    let data = await response.json();

    // Some models/keys may reject google_search — retry without tools
    if (
      !response.ok &&
      typeof data?.error?.message === "string" &&
      /tool|google_search|search/i.test(data.error.message)
    ) {
      delete requestBody.tools;
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        },
      );
      data = await response.json();
    }

    if (!response.ok) {
      console.error("Gemini chat error:", data);
      return res.status(response.status === 429 ? 429 : 502).json({
        error: mapGeminiErrorMessage(
          data?.error?.message,
          response.status,
        ),
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

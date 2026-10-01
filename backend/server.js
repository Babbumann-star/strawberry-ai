require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

const PORT = process.env.PORT || 8000;

const OPENROUTER_MODELS = [
  "stealth/space-bunny-alpha",
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-26b-a4b-it:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "qwen/qwen3.8-27b:free",
  "google/gemma-4-31b-it:free",
  "openrouter/free",
];

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function createOpenRouterClient(apiKey) {
  return new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL, defaultHeaders: { "HTTP-Referer": "https://strawberry-ai.onrender.com", "X-Title": "Nova AI" } });
}

async function callOpenRouter(apiMessages, model) {
  if (!OPENROUTER_API_KEY) throw new Error("OpenRouter key not configured");
  const client = createOpenRouterClient(OPENROUTER_API_KEY);
  try {
    const response = await client.chat.completions.create({
      model,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 4096,
    });
    const content = response.choices[0].message.content;

    if (!content || !content.trim()) {
      throw new Error("Model returned an empty response");
    }

    return { reply: content, usedModel: model, provider: "openrouter" };
  } catch (error) {
    console.warn(`[OpenRouter] Failed for ${model}:`, error.message);
    throw error;
  }
}

async function chatWithFailover(apiMessages) {
  let lastError;

  for (const model of OPENROUTER_MODELS) {
    try {
      console.log(`[Failover] Trying OpenRouter model: ${model}`);
      return await callOpenRouter(apiMessages, model);
    } catch (error) {
      lastError = error;
      console.warn(`[Failover] OpenRouter model ${model} failed`);
    }
  }

  throw lastError;
}

app.use(
  cors({
    origin: [
      "http://127.0.0.1:5500",
      "http://localhost:5500",
      "https://strawberry-ai.onrender.com",
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json({ limit: "2mb" }));

const MAX_MESSAGES = 24;
const MAX_MESSAGE_CHARS = 8000;

function truncateMessages(messages) {
  return messages
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MESSAGES)
    .map(m => ({
      role: m.role,
      content: m.content.length > MAX_MESSAGE_CHARS ? m.content.slice(0, MAX_MESSAGE_CHARS) : m.content,
    }));
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Nova AI Backend with OpenRouter failover",
    openrouterModels: OPENROUTER_MODELS,
    openrouterKey: OPENROUTER_API_KEY ? "configured" : "missing",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    openrouterModels: OPENROUTER_MODELS,
    openrouterKey: OPENROUTER_API_KEY ? "configured" : "missing",
  });
});

app.post("/chat", async (req, res) => {
  try {
    const { messages = [] } = req.body;

    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: "Messages are required" });
    }

    const trimmed = truncateMessages(messages);

    if (!trimmed.length) {
      return res.status(400).json({ error: "No valid messages found" });
    }

    const apiMessages = [
      {
        role: "system",
        content: `
You are Nova AI, a friendly, helpful and intelligent AI assistant.

Always refer to yourself as Nova AI, or as "Nova". Never call yourself Strawberry, and never use the name of another AI assistant.

Rules:
- Give clear and accurate answers.
- Explain difficult concepts simply.
- Help with programming and coding.
- Provide working code when appropriate.
- Use examples when useful.
- Be professional, friendly and concise.
- If the user asks for code, format it properly using Markdown code blocks.
- Do not claim to have capabilities you do not have.
        `,
      },
      ...trimmed,
    ];

    const result = await chatWithFailover(apiMessages);

    res.json({
      reply: result.reply,
      model: result.usedModel,
      provider: result.provider,
    });
  } catch (error) {
    console.error("[ERROR] ALL FAILOVERS FAILED:", error.message);
    res.status(500).json({
      error: "Failed to get AI response after trying all models",
    });
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Conversation too long. Please start a new chat." });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  console.error("[ERROR]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Nova AI backend running at: http://localhost:${PORT}`);
  console.log(`OpenRouter free models: ${OPENROUTER_MODELS.join(", ")}`);
  console.log(`OpenRouter key: ${OPENROUTER_API_KEY ? "configured" : "missing"}`);
});
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

const PORT = process.env.PORT || 8000;

const MODELS = [
  "deepseek-v4-flash-vision-exp",
  "deepseek-v4.1-flash",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "deepseek-v4-flash-0731",
];

const API_KEYS = (process.env.KIRA_API_KEYS || process.env.KIRA_API_KEY || "")
  .split(",")
  .map(k => k.trim())
  .filter(k => k.length > 0);

const BASE_URL = "https://kiraai.vn/api/v1";

function createClient(apiKey) {
  return new OpenAI({ apiKey, baseURL: BASE_URL });
}

async function callWithFailover(apiMessages, model) {
  let lastError;

  for (const apiKey of API_KEYS) {
    const client = createClient(apiKey);
    try {
      const response = await client.chat.completions.create({
        model,
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 4096,
      });
      return { reply: response.choices[0].message.content || "", usedKey: apiKey.slice(-8), usedModel: model };
    } catch (error) {
      lastError = error;
      console.warn(`Key ${apiKey.slice(-8)} failed for model ${model}:`, error.message);
    }
  }

  throw lastError;
}

async function chatWithFailover(apiMessages) {
  let lastError;

  for (const model of MODELS) {
    try {
      return await callWithFailover(apiMessages, model);
    } catch (error) {
      lastError = error;
      console.warn(`Model ${model} failed on all keys:`, error.message);
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

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Strawberry AI Backend running with DeepSeek V4 Flash (multi-key failover)",
    models: MODELS,
    keysConfigured: API_KEYS.length,
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    models: MODELS,
    keysConfigured: API_KEYS.length,
  });
});

app.post("/chat", async (req, res) => {
  try {
    const { messages = [] } = req.body;

    if (!messages.length) {
      return res.status(400).json({ error: "Messages are required" });
    }

    const apiMessages = [
      {
        role: "system",
        content: `
You are Strawberry AI, a friendly, helpful and intelligent AI assistant.

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
      ...messages,
    ];

    const result = await chatWithFailover(apiMessages);

    res.json({
      reply: result.reply,
      model: result.usedModel,
      key: result.usedKey,
    });
  } catch (error) {
    console.error("ALL FAILOVERS FAILED:", error);
    res.status(500).json({
      error: "Failed to get AI response after trying all models and keys",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Strawberry AI backend running at: http://localhost:${PORT}`);
  console.log(`Models: ${MODELS.join(", ")}`);
  console.log(`API Keys configured: ${API_KEYS.length}`);
});
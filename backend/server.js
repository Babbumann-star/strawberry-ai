require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const crypto = require("crypto");

const app = express();

// ===============================
// CONFIGURATION
// ===============================

const PORT = process.env.PORT || 8000;
const API_SECRET = process.env.API_SECRET;

if (!API_SECRET) {
  console.error("FATAL: API_SECRET environment variable is not set!");
  process.exit(1);
}

// Kira AI uses an OpenAI-compatible API
const client = new OpenAI({
  apiKey: process.env.KIRA_API_KEY,
  baseURL: "https://kiraai.vn/api/v1"
});

// ===============================
// RATE LIMITING (in-memory)
// ===============================

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 20;

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }

  const entry = rateLimitMap.get(ip);

  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({
      error: "Too many requests. Please try again later."
    });
  }

  next();
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ===============================
// SECURITY: API KEY AUTH MIDDLEWARE
// ===============================

function authenticate(req, res, next) {
  const providedKey = req.headers["x-api-key"];

  if (!providedKey) {
    return res.status(401).json({ error: "Unauthorized: Missing API key" });
  }

  const valid = crypto.timingSafeEqual(
    Buffer.from(providedKey, "utf8"),
    Buffer.from(API_SECRET, "utf8")
  );

  if (!valid) {
    return res.status(403).json({ error: "Forbidden: Invalid API key" });
  }

  next();
}

// ===============================
// MIDDLEWARE
// ===============================

app.set("trust proxy", 1);

app.use(
  cors({
    origin: [
      "http://127.0.0.1:5500",
      "http://localhost:5500",
      "http://localhost:3000",
      "https://deepseek-chatbot-nine.vercel.app"
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-api-key"],
    maxAge: 86400
  })
);

app.use(express.json({ limit: "10kb" }));

// Security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.removeHeader("X-Powered-By");
  next();
});

// ===============================
// HOME ROUTE
// ===============================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Strawberry AI Backend is running"
  });
});

// ===============================
// HEALTH CHECK
// ===============================

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

// ===============================
// CHAT API (Protected)
// ===============================

app.post("/chat", rateLimit, authenticate, async (req, res) => {

  try {

    const { messages = [] } = req.body;

    // Validate message count
    if (!messages.length) {
      return res.status(400).json({ error: "Messages are required" });
    }

    if (messages.length > 50) {
      return res.status(400).json({ error: "Too many messages (max 50)" });
    }

    // Validate each message
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return res.status(400).json({ error: "Invalid message format" });
      }
      if (!["user", "assistant", "system"].includes(msg.role)) {
        return res.status(400).json({ error: "Invalid message role" });
      }
      if (typeof msg.content !== "string" || msg.content.length > 10000) {
        return res.status(400).json({ error: "Message content too long (max 10000 chars)" });
      }
    }

    // Build conversation
    const apiMessages = [
      {
        role: "system",
        content: `You are Strawberry AI, a friendly, helpful and intelligent AI assistant.
Rules:
- Give clear and accurate answers.
- Explain difficult concepts simply.
- Help with programming and coding.
- Provide working code when appropriate.
- Use examples when useful.
- Be professional, friendly and concise.
- If the user asks for code, format it properly using Markdown code blocks.
- Do not claim to have capabilities you do not have.`
      },
      ...messages
    ];

    // Call AI API
    const response = await client.chat.completions.create({
      model: "kira-auto",
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 4096
    });

    const reply = response.choices[0].message.content || "";

    res.json({ reply });

  } catch (error) {

    console.error("AI ERROR:", error.message);

    res.status(500).json({
      error: "Failed to get AI response"
    });

  }

});

// ===============================
// CATCH-ALL: Block unknown routes
// ===============================

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

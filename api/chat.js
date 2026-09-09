const OpenAI = require("openai");
const crypto = require("crypto");

const client = new OpenAI({
  apiKey: process.env.KIRA_API_KEY,
  baseURL: "https://kiraai.vn/api/v1"
});

const API_SECRET = process.env.API_SECRET;

const SYSTEM_PROMPT = `You are Strawberry AI, a friendly, helpful and intelligent AI assistant.
Rules:
- Give clear and accurate answers.
- Explain difficult concepts simply.
- Help with programming and coding.
- Provide working code when appropriate.
- Use examples when useful.
- Be professional, friendly and concise.
- If the user asks for code, format it properly using Markdown code blocks.
- Do not claim to have capabilities you do not have.`;

// In-memory rate limiting
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const window = 60 * 1000;
  const max = 20;

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + window });
    return true;
  }

  const entry = rateLimitMap.get(ip);
  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + window;
    return true;
  }

  entry.count++;
  return entry.count <= max;
}

module.exports = async function handler(req, res) {

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "https://deepseek-chatbot-nine.vercel.app");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Access-Control-Allow-Origin", "https://deepseek-chatbot-nine.vercel.app");

  // Rate limiting
  const ip = req.headers["x-forwarded-for"] || "unknown";
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }

  // API key authentication
  const providedKey = req.headers["x-api-key"];
  if (!API_SECRET) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  if (!providedKey) {
    return res.status(401).json({ error: "Unauthorized: Missing API key" });
  }

  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(providedKey, "utf8"),
      Buffer.from(API_SECRET, "utf8")
    );
    if (!valid) {
      return res.status(403).json({ error: "Forbidden: Invalid API key" });
    }
  } catch {
    return res.status(403).json({ error: "Forbidden: Invalid API key" });
  }

  try {
    const { messages = [] } = req.body || {};

    if (!messages.length) {
      return res.status(400).json({ error: "Messages are required" });
    }

    if (messages.length > 50) {
      return res.status(400).json({ error: "Too many messages (max 50)" });
    }

    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return res.status(400).json({ error: "Invalid message format" });
      }
      if (!["user", "assistant", "system"].includes(msg.role)) {
        return res.status(400).json({ error: "Invalid message role" });
      }
      if (typeof msg.content !== "string" || msg.content.length > 10000) {
        return res.status(400).json({ error: "Message content too long" });
      }
    }

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages
    ];

    const response = await client.chat.completions.create({
      model: "kira-auto",
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 4096
    });

    const reply = response.choices[0].message.content || "";

    return res.json({ reply });
  } catch (error) {
    console.error("AI ERROR:", error.message);
    return res.status(500).json({ error: "Failed to get AI response" });
  }
};

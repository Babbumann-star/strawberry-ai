const OpenAI = require("openai");

function createClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.APP_URL || "https://strawberry-ai.onrender.com",
      "X-Title": "Nova AI",
    }
  });
}

const MODEL = "openrouter/free";

const SYSTEM_PROMPT = `
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

Mathematics:

- Write formulas in LaTeX, never inside code blocks.
- Inline math uses single dollar signs: $E = mc^2$
- Display math uses double dollar signs on their own lines.
- Use $...$ inside a sentence and $$...$$ on its own line.
- You may also use \\(...\\) and \\[...\\].
- Use \\begin{pmatrix} for matrices and \\begin{aligned} for multi-line derivations.
- Do not wrap LaTeX in triple backticks.
`;

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { messages = [] } = req.body || {};

    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: "Messages are required" });
    }

    const client = createClient();

    const trimmed = messages
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-24)
      .map(m => ({
        role: m.role,
        content: m.content.length > 8000 ? m.content.slice(0, 8000) : m.content,
      }));

    if (!trimmed.length) {
      return res.status(400).json({ error: "No valid messages found" });
    }

    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...trimmed
    ];

    const response = await client.chat.completions.create({
      model: MODEL,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 4096
    });

    const reply = response.choices[0].message.content;

    if (!reply || !reply.trim()) {
      return res.status(502).json({ error: "Model returned an empty response" });
    }

    return res.json({ reply });
  } catch (error) {
    if (String(error.message).includes("OPENROUTER_API_KEY")) {
      return res.status(500).json({ error: "Server is not configured" });
    }

    console.error("OPENROUTER ERROR:", error.message);
    return res.status(500).json({
      error: "Failed to get AI response"
    });
  }
};

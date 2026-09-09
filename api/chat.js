const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.KIRA_API_KEY,
  baseURL: "https://kiraai.vn/api/v1"
});

const SYSTEM_PROMPT = `
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

    if (!messages.length) {
      return res.status(400).json({ error: "Messages are required" });
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
    console.error("DEEPSEEK ERROR:", error);
    return res.status(500).json({
      error: "Failed to get AI response",
      details: error.message
    });
  }
};
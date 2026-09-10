require("dotenv").config();

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

// ===============================
// CONFIGURATION
// ===============================

const PORT = process.env.PORT || 8000;

const MODEL = "qwen3.8-flash-free";

const client = new OpenAI({
  apiKey: process.env.KIRA_API_KEY,
  baseURL: "https://kiraai.vn/api/v1"
});

// ===============================
// MIDDLEWARE
// ===============================

app.use(
  cors({
    origin: [
      "http://127.0.0.1:5500",
      "http://localhost:5500",
      "https://strawberry-ai.onrender.com",
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  })
);

app.use(express.json());


// ===============================
// HOME ROUTE
// ===============================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Strawberry AI Backend is running with DeepSeek V4 Flash"
  });
});


// ===============================
// HEALTH CHECK
// ===============================

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    model: MODEL
  });
});


// ===============================
// CHAT API
// ===============================

app.post("/chat", async (req, res) => {

  try {

    const { messages = [] } = req.body;


    // ===============================
    // VALIDATE MESSAGE
    // ===============================

    if (!messages.length) {

      return res.status(400).json({
        error: "Messages are required"
      });

    }


    // ===============================
    // BUILD CONVERSATION
    // ===============================

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
        `
      },

      ...messages

    ];


    // ===============================
    // CALL DEEPSEEK V4 FLASH
    // ===============================

    const response = await client.chat.completions.create({

      model: MODEL,

      messages: apiMessages,

      temperature: 0.7,

      max_tokens: 4096

    });


    // ===============================
    // GET AI RESPONSE
    // ===============================

    const reply = response.choices[0].message.content || "";


    // ===============================
    // SEND RESPONSE
    // ===============================

    res.json({ reply });

  }


  catch (error) {

    console.error("DEEPSEEK ERROR:", error);

    res.status(500).json({

      error: "Failed to get AI response",

      details: error.message

    });

  }

});


// ===============================
// START SERVER
// ===============================

app.listen(PORT, () => {

  console.log(
    `Strawberry AI DeepSeek backend running at:
http://localhost:${PORT}`
  );

});

import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

const COZE_API_KEY = process.env.COZE_API_KEY;
const BOT_ID = process.env.BOT_ID;

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    const response = await fetch("https://api.coze.cn/open_api/v2/chat", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${COZE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        bot_id: BOT_ID,
        user: "user_" + Date.now(),
        query: userMessage,
        stream: false
      })
    });

    const data = await response.json();
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: "请求失败" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

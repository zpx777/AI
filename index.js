export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/") {
      return new Response(INDEX_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      try {
        const body = await request.json();
        const prompt = body.prompt || "";
        let sessionId = body.session_id || crypto.randomUUID();

        const payload = {
          content: {
            query: {
              prompt: [
                {
                  type: "text",
                  content: {
                    text: prompt
                  }
                }
              ]
            }
          },
          type: "query",
          session_id: sessionId,
          project_id: env.COZE_PROJECT_ID
        };

        const cozeResp = await fetch(env.COZE_STREAM_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.COZE_TOKEN}`,
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
          },
          body: JSON.stringify(payload)
        });

        if (!cozeResp.ok) {
          const errText = await cozeResp.text();
          return new Response(
            JSON.stringify({ error: errText, status: cozeResp.status }),
            {
              status: cozeResp.status,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                ...corsHeaders()
              }
            }
          );
        }

        const stream = new ReadableStream({
          async start(controller) {
            const reader = cozeResp.body.getReader();
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();

            controller.enqueue(encoder.encode(`event: session\ndata: ${JSON.stringify({ session_id: sessionId })}\n\n`));

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              controller.enqueue(encoder.encode(chunk));
            }

            controller.close();
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            ...corsHeaders()
          }
        });

      } catch (err) {
        return new Response(
          JSON.stringify({ error: String(err) }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              ...corsHeaders()
            }
          }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

const INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI 助手</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      background: #f6f7fb;
      color: #111827;
    }
    .app {
      max-width: 860px;
      margin: 0 auto;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 18px;
    }
    .header {
      padding: 16px 0;
      font-size: 24px;
      font-weight: 800;
    }
    .chat {
      flex: 1;
      background: white;
      border-radius: 18px;
      padding: 18px;
      overflow-y: auto;
      box-shadow: 0 10px 30px rgba(0,0,0,.06);
      margin-bottom: 14px;
    }
    .msg {
      max-width: 82%;
      padding: 12px 14px;
      margin: 10px 0;
      border-radius: 14px;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .user {
      margin-left: auto;
      background: #2563eb;
      color: white;
      border-bottom-right-radius: 4px;
    }
    .bot {
      margin-right: auto;
      background: #f1f5f9;
      color: #0f172a;
      border-bottom-left-radius: 4px;
    }
    .bar {
      display: flex;
      gap: 10px;
      background: white;
      border-radius: 18px;
      padding: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.06);
    }
    textarea {
      flex: 1;
      min-height: 48px;
      max-height: 160px;
      resize: none;
      border: none;
      outline: none;
      font-size: 16px;
      line-height: 1.5;
    }
    button {
      width: 88px;
      border: none;
      border-radius: 14px;
      background: #2563eb;
      color: white;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
    }
    button:disabled {
      background: #94a3b8;
      cursor: not-allowed;
    }
    .hint {
      text-align: center;
      font-size: 13px;
      color: #64748b;
      padding: 8px 0 0;
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="header">AI 助手</div>
    <div id="chat" class="chat">
      <div class="msg bot">你好，我是 AI 助手。直接输入问题即可。</div>
    </div>
    <div class="bar">
      <textarea id="input" placeholder="请输入内容，Enter 发送，Shift+Enter 换行"></textarea>
      <button id="send">发送</button>
    </div>
    <div class="hint">无需登录，打开网址即可使用</div>
  </div>

  <script>
    const chat = document.getElementById("chat");
    const input = document.getElementById("input");
    const sendBtn = document.getElementById("send");

    let sessionId = localStorage.getItem("coze_session_id") || crypto.randomUUID();
    localStorage.setItem("coze_session_id", sessionId);

    function addMsg(text, cls) {
      const div = document.createElement("div");
      div.className = "msg " + cls;
      div.textContent = text;
      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
      return div;
    }

    function extractTextFromCozeEvent(obj) {
      const candidates = [
        obj?.content,
        obj?.data?.content,
        obj?.data?.text,
        obj?.text,
        obj?.message?.content,
        obj?.messages?.[0]?.content,
        obj?.answer
      ];

      for (const item of candidates) {
        if (typeof item === "string") return item;
      }

      return "";
    }

    async function sendMessage() {
      const text = input.value.trim();
      if (!text) return;

      addMsg(text, "user");
      input.value = "";
      sendBtn.disabled = true;

      const botDiv = addMsg("", "bot");

      try {
        const resp = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, session_id: sessionId })
        });

        if (!resp.ok) {
          const err = await resp.text();
          botDiv.textContent = "请求失败：" + err;
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\\n\\n");
          buffer = parts.pop();

          for (const part of parts) {
            const lines = part.split("\\n");
            for (const line of lines) {
              if (line.startsWith("data:")) {
                const dataText = line.slice(5).trim();
                if (!dataText || dataText === "[DONE]") continue;

                try {
                  const obj = JSON.parse(dataText);

                  if (obj.session_id) {
                    sessionId = obj.session_id;
                    localStorage.setItem("coze_session_id", sessionId);
                    continue;
                  }

                  const piece = extractTextFromCozeEvent(obj);
                  if (piece) {
                    botDiv.textContent += piece;
                    chat.scrollTop = chat.scrollHeight;
                  }
                } catch {
                  botDiv.textContent += dataText;
                }
              }
            }
          }
        }

        if (!botDiv.textContent.trim()) {
          botDiv.textContent = "已收到响应，但没有解析到文本。需要根据 Coze 返回格式微调 extractTextFromCozeEvent。";
        }

      } catch (err) {
        botDiv.textContent = "网络错误：" + err.message;
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    }

    sendBtn.onclick = sendMessage;

    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  </script>
</body>
</html>`;

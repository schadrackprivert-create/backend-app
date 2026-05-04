const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

app.use(helmet());
app.use(express.json({ limit: "15mb" }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
  })
);

// 🔍 Detectar tipo MIME
function detectarMime(imagen = "") {
  const str = String(imagen).trim();
  const match = str.match(/^data:(image\/\w+);base64,/);
  if (match) return match[1];

  const raw = str.includes("base64,")
    ? str.split("base64,")[1]
    : str;

  if (raw.startsWith("/9j/")) return "image/jpeg";
  if (raw.startsWith("iVBOR")) return "image/png";
  if (raw.startsWith("R0lGO")) return "image/gif";
  if (raw.startsWith("UklGR")) return "image/webp";

  return "image/jpeg";
}

// 🧹 Limpiar base64
function limpiarBase64(imagen = "") {
  const str = String(imagen || "").trim();
  const idx = str.indexOf("base64,");
  return (idx !== -1 ? str.slice(idx + 7) : str).replace(/\s/g, "");
}

// 🧹 Limpiar JSON IA
function limpiarJson(texto = "") {
  return String(texto)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

// 🌐 TEST
app.get("/", (req, res) => {
  res.send("Backend funcionando 🔥");
});

// 🧠 VERIFICAR TEXTO
app.post("/verificar", async (req, res) => {
  try {
    const { texto = "" } = req.body;

    if (!API_KEY) {
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "Sin API key",
      });
    }

    const contenido = texto.trim();

    if (!contenido) {
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "Vacío",
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: { temperature: 0 },
          safetySettings: [
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
          ],
          contents: [
            {
              parts: [
                {
                  text: `
Eres un moderador PERMISIVO.
Bloquea SOLO cosas muy graves.

Responde JSON:
{"bloqueado": false}
o
{"bloqueado": true}
                  `,
                },
                { text: contenido },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      return res.json({ permitido: true, bloqueado: false });
    }

    const data = await response.json();
    const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let json;
    try {
      json = JSON.parse(limpiarJson(textoIA));
    } catch {
      return res.json({ permitido: true, bloqueado: false });
    }

    return res.json({
      permitido: json.bloqueado === false,
      bloqueado: json.bloqueado !== false,
    });

  } catch {
    return res.json({ permitido: true, bloqueado: false });
  }
});

// 🖼️ VERIFICAR IMAGEN
app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen } = req.body;

    if (!API_KEY) {
      return res.json({ permitido: true, bloqueado: false });
    }

    const base64 = limpiarBase64(imagen);

    if (!base64 || base64.length < 1000) {
      return res.json({ permitido: false, bloqueado: true });
    }

    const mimeType = detectarMime(imagen);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: { temperature: 0 },
          safetySettings: [
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          ],
          contents: [
            {
              parts: [
                {
                  text: `
Bloquea SOLO desnudos explícitos.
Permite todo lo demás.
Responde JSON:
{"bloqueado": false}
o
{"bloqueado": true}
                  `,
                },
                {
                  inlineData: {
                    mimeType,
                    data: base64,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      return res.json({ permitido: true, bloqueado: false });
    }

    const data = await response.json();
    const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let json;
    try {
      json = JSON.parse(limpiarJson(textoIA));
    } catch {
      return res.json({ permitido: true, bloqueado: false });
    }

    return res.json({
      permitido: json.bloqueado === false,
      bloqueado: json.bloqueado !== false,
    });

  } catch {
    return res.json({ permitido: true, bloqueado: false });
  }
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});

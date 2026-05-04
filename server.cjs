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
app.use(cors({ origin: "*" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
  })
);

// ===== FUNCIONES =====
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

function limpiarBase64(imagen = "") {
  const str = String(imagen || "").trim();
  return str.includes("base64,")
    ? str.split("base64,")[1].replace(/\s/g, "")
    : str.replace(/\s/g, "");
}

function limpiarJson(texto = "") {
  return String(texto)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

// ===== TEST =====
app.get("/", (req, res) => {
  res.send("Backend funcionando 🔥");
});

// ===== IMAGEN =====
app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen } = req.body;

    if (!imagen) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "No llegó imagen",
      });
    }

    const base64 = limpiarBase64(imagen);
    const mimeType = detectarMime(imagen);

    if (!base64 || base64.length < 1000) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Imagen inválida",
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 120,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_ONLY_HIGH", // 🔥 FIX
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_ONLY_HIGH",
            },
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_ONLY_HIGH",
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_ONLY_HIGH",
            },
          ],
          contents: [
            {
              parts: [
                {
                  text: `
Eres un moderador PERMISIVO.

Responde SOLO JSON:
{"bloqueado": false}
o
{"bloqueado": true}

Bloquea SOLO si hay:
- desnudez real (genitales)
- sexo explícito
- violencia extrema

Permite TODO lo demás (selfies, playa, comida, turismo).
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
      console.log("ERROR HTTP GEMINI");
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "Error Gemini → permitido",
      });
    }

    const data = await response.json();

    if (data?.promptFeedback?.blockReason) {
      return res.json({
        permitido: true, // 🔥 FIX
        bloqueado: false,
        razon: "Google bloqueó → permitido",
      });
    }

    const finishReason = data?.candidates?.[0]?.finishReason;
    const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (finishReason === "SAFETY") {
      return res.json({
        permitido: true, // 🔥 FIX
        bloqueado: false,
        razon: "Filtro Google → permitido",
      });
    }

    if (!textoIA) {
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "IA no respondió → permitido",
      });
    }

    let json;
    try {
      json = JSON.parse(limpiarJson(textoIA));
    } catch {
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "JSON inválido → permitido",
      });
    }

    return res.json({
      permitido: json.bloqueado === false,
      bloqueado: json.bloqueado !== false,
    });

  } catch (error) {
    console.log("ERROR IMAGEN:", error.message);
    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Error técnico → permitido",
    });
  }
});

// ===== START =====
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});

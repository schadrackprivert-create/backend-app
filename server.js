// ===== BACKEND NIVEL DIOS COMPLETO =====
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

app.use(helmet());
app.use(express.json({ limit: "12mb" }));

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
});
app.use(limiter);

// ===== LIMPIAR BASE64 =====
function limpiarBase64(imagen = "") {
  let limpio = String(imagen || "").trim();

  if (limpio.includes(",")) {
    limpio = limpio.split(",").pop() || "";
  }

  return limpio.replace(/\s/g, "");
}

// ===== VERIFICAR IMAGEN =====
app.post("/verificar-imagen", async (req, res) => {
  const { imagen } = req.body;

  const img = limpiarBase64(imagen);

  if (!img || img.length < 1000) {
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Imagen inválida",
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safetySettings: [
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE", // 🔥 IMPORTANTE
            },
          ],
          contents: [
            {
              parts: [
                {
                  text: `
Analiza la imagen.

Responde JSON:
{"bloqueado": true/false}

Bloquea solo desnudos o porno.
`,
                },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: img,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    // 🔥 Google bloqueó
    if (data.promptFeedback?.blockReason === "SAFETY") {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Bloqueado por Google",
      });
    }

    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!texto) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "IA no respondió",
      });
    }

    let bloqueado = true;

    try {
      const limpio = texto.replace(/```json|```/g, "").trim();
      const json = JSON.parse(limpio);
      bloqueado = json.bloqueado === true;
    } catch {
      bloqueado = true;
    }

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      razon: bloqueado ? "Contenido sexual" : "OK",
    });
  } catch {
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error IA",
    });
  }
});

// ===== TEST =====
app.get("/", (req, res) => {
  res.send("Backend funcionando 🚀");
});

app.listen(PORT, () => {
  console.log("Servidor activo en puerto " + PORT);
});

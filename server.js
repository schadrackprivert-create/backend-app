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
app.use(express.json({ limit: "10mb" }));

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60,
}));

// =============================
// 🔧 HELPERS
// =============================
function limpiarBase64(imagen = "") {
  let limpio = String(imagen || "").trim();

  if (limpio.includes(",")) {
    limpio = limpio.split(",").pop() || "";
  }

  return limpio
    .replace(/^data:image\/\w+;base64,/i, "")
    .replace(/\s/g, "");
}

function limpiarJson(texto = "") {
  return String(texto || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

function parseJsonSeguro(texto = "") {
  try {
    return JSON.parse(limpiarJson(texto));
  } catch {
    return null;
  }
}

// =============================
// 🚫 TEXTO
// =============================
const palabrasProhibidas = [
  "xxx",
  "porno",
  "porn",
  "onlyfans",
  "escort",
  "desnudo",
  "nude",
];

function contienePalabrasProhibidas(texto = "") {
  const t = String(texto || "").toLowerCase();
  return palabrasProhibidas.some((p) => t.includes(p));
}

app.post("/verificar", async (req, res) => {
  const { texto } = req.body;

  if (!texto) {
    return res.json({ permitido: true, bloqueado: false });
  }

  if (contienePalabrasProhibidas(texto)) {
    return res.json({ permitido: false, bloqueado: true });
  }

  return res.json({ permitido: true, bloqueado: false });
});

// =============================
// 🔥 IMAGEN (NIVEL DIOS)
// =============================
app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen } = req.body;
    const img = limpiarBase64(imagen);

    if (!img || img.length < 1000) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Imagen inválida",
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safetySettings: [
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_LOW_AND_ABOVE", // 🔥 BLOQUEA TODO LO SEXUAL
            },
          ],
          generationConfig: { temperature: 0 },
          contents: [
            {
              parts: [
                {
                  text: `
Detecta contenido sexual.

Responde SOLO JSON:
{"bloqueado": true}
o
{"bloqueado": false}

Bloquea si hay:
- desnudo
- sexo
- pornografía
- partes íntimas
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
    console.log("IA:", JSON.stringify(data));

    // 🔥 GOOGLE BLOQUEA
    if (data.promptFeedback?.blockReason === "SAFETY") {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Google bloqueó",
      });
    }

    const textoIA =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // 🔥 SI IA NO RESPONDE → BLOQUEA
    if (!textoIA) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "IA no respondió",
      });
    }

    const json = parseJsonSeguro(textoIA);

    // 🔥 SI JSON FALLA → BLOQUEA
    if (!json) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Error parse JSON",
      });
    }

    const bloqueado = json.bloqueado === true;

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      razon: bloqueado ? "Contenido sexual" : "OK",
    });

  } catch (error) {
    console.log("ERROR:", error);

    // 🔥 SI ERROR → BLOQUEA
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error técnico",
    });
  }
});

// =============================
app.get("/", (req, res) => {
  res.send("Backend funcionando 🔥");
});

// =============================
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});

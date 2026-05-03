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

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

// 🔥 Anti spam
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
});
app.use(limiter);

// =============================
// 🔥 PALABRAS PROHIBIDAS
// =============================
const palabrasProhibidas = [
  "xxx",
  "porno",
  "porn",
  "sexo",
  "desnudo",
  "nude",
  "onlyfans",
  "puta",
  "escort",
];

function contienePalabrasProhibidas(texto = "") {
  const t = texto.toLowerCase();
  return palabrasProhibidas.some((p) => t.includes(p));
}

// =============================
// 🔥 VERIFICAR TEXTO
// =============================
app.post("/verificar", async (req, res) => {
  const { texto } = req.body;

  if (contienePalabrasProhibidas(texto)) {
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Texto prohibido detectado",
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: { temperature: 0 },
          contents: [
            {
              parts: [
                {
                  text: `Analiza este texto. 
Bloquea solo si es sexual explícito, odio o violencia.
Responde SOLO JSON: {"bloqueado": true/false}`,
                },
                { text: texto },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    const textoIA =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!textoIA) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "IA no respondió → bloqueado",
      });
    }

    let bloqueado = true;

    try {
      const limpio = textoIA
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const json = JSON.parse(limpio);
      bloqueado = json.bloqueado !== false;
    } catch {
      bloqueado = true;
    }

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      razon: bloqueado ? "Texto no permitido" : "Texto permitido",
    });
  } catch (error) {
    console.log(error);
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error IA → bloqueado",
    });
  }
});

// =============================
// 🔥 VERIFICAR IMAGEN (🔥 PRO REAL)
// =============================
app.post("/verificar-imagen", async (req, res) => {
  const { imagen } = req.body;

  if (!imagen) {
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "No llegó imagen",
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 🔥 Seguridad REAL (IMPORTANTE)
          safetySettings: [
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE",
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE",
            },
          ],

          generationConfig: { temperature: 0 },

          contents: [
            {
              parts: [
                {
                  text: `Analiza esta imagen.

Bloquea SOLO si contiene:
- desnudos
- contenido sexual explícito
- actos sexuales

Responde SOLO JSON:
{"bloqueado": true/false}`,
                },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: imagen,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    console.log("IA imagen:", JSON.stringify(data));

    // 🔥 BLOQUEO POR SEGURIDAD DE GOOGLE
    if (data.promptFeedback?.blockReason) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Bloqueado por seguridad Google",
      });
    }

    const textoIA =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!textoIA) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "IA no respondió → bloqueado",
      });
    }

    let bloqueado = true;

    try {
      const limpio = textoIA
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const json = JSON.parse(limpio);
      bloqueado = json.bloqueado !== false;
    } catch {
      bloqueado = true;
    }

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      razon: bloqueado
        ? "Imagen sexual detectada"
        : "Imagen permitida",
    });
  } catch (error) {
    console.log(error);
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error IA → bloqueado",
    });
  }
});

// =============================
// TEST
// =============================
app.get("/", (req, res) => {
  res.send("Backend funcionando 🚀");
});

// =============================
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

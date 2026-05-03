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

// =============================
// 🔥 MIDDLEWARE
// =============================
app.use(helmet());
app.use(express.json({ limit: "5mb" }));

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
  max: 30,
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
      razon: "Filtro rápido detectó contenido prohibido",
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
                  text: `
Eres un moderador de contenido.

Responde SOLO JSON:
{"bloqueado": true}
o
{"bloqueado": false}

Bloquea si hay:
- contenido sexual
- violencia
- odio

Permite texto normal.
`,
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

    let bloqueado = false;

    try {
      const limpio = textoIA
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const json = JSON.parse(limpio);
      bloqueado = json.bloqueado === true;
    } catch {
      bloqueado = false;
    }

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      razon: bloqueado ? "Texto prohibido" : "Texto permitido",
    });
  } catch {
    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Error IA → permitido",
    });
  }
});

// =============================
// 🔥 VERIFICAR IMAGEN (PRO)
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
          safetySettings: [
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE",
            },
          ],
          generationConfig: { temperature: 0 },
          contents: [
            {
              parts: [
                {
                  text: `
Analiza esta imagen.

Bloquea SOLO si hay:
- desnudos reales
- partes íntimas visibles
- sexo explícito
- pornografía

NO bloquear:
- selfies
- fotos normales
- turismo
- ropa normal

Responde SOLO JSON:
{"bloqueado": true, "razon": "explicación"}
o
{"bloqueado": false, "razon": "foto normal"}
`,
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

    // 🔥 Bloqueo directo por Google
    if (data.promptFeedback?.blockReason === "SAFETY") {
      return res.json({
        permitido: false,
        bloqueado: true,
        nsfw: true,
        razon: "Bloqueado por seguridad Google",
      });
    }

    const textoIA =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!textoIA) {
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "IA no respondió → permitido",
      });
    }

    let bloqueado = false;
    let razon = "Imagen permitida";

    try {
      const limpio = textoIA
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const json = JSON.parse(limpio);

      bloqueado = json.bloqueado === true;
      razon = json.razon || razon;
    } catch {
      bloqueado = false;
      razon = "Respuesta IA inválida → permitido";
    }

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      nsfw: bloqueado,
      razon,
    });
  } catch (error) {
    console.log("ERROR IA:", error);

    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Error IA → permitido",
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

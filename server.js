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
app.use(express.json({ limit: "5mb" }));

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

// 🔥 Protección básica anti spam
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

  // 1. Filtro rápido
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

Bloquea si hay contenido sexual, violencia, odio.
Si tienes duda → bloquea.
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
      razon: bloqueado ? "Texto prohibido" : "Texto permitido",
    });
  } catch {
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error IA → bloqueado",
    });
  }
});

// =============================
// 🔥 VERIFICAR IMAGEN (🔥 ARREGLADO)
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0,
          },
          contents: [
            {
              parts: [
                {
                  text: `
Analiza esta imagen como moderador EXTREMO.

Responde SOLO JSON:
{"bloqueado": true}
o
{"bloqueado": false}

Bloquea si hay:
- desnudos
- senos
- partes íntimas
- porno
- escenas sexuales
- contenido sexual explícito o sugerente
- capturas de videos sexuales
- texto sexual dentro de la imagen

Si dudas → bloquea.
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

    const finishReason =
      data?.candidates?.[0]?.finishReason || "";

    const textoIA =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("IA imagen RAW:", JSON.stringify(data));

    // 🔥 SI FALLA → BLOQUEA
    if (finishReason === "SAFETY" || !textoIA) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Bloqueado por seguridad IA",
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
        ? "Imagen prohibida detectada"
        : "Imagen permitida",
    });
  } catch {
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

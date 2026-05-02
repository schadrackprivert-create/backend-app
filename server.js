import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 10000;
const API_KEY = process.env.GEMINI_API_KEY;

// Seguridad básica
app.use(helmet());
app.use(express.json({ limit: "10mb" }));

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

// Anti spam
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
});
app.use(limiter);



// ==========================================
// 🔥 PALABRAS PROHIBIDAS (RÁPIDO)
// ==========================================
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



// ==========================================
// 🔥 VERIFICAR TEXTO
// ==========================================
app.post("/verificar", async (req, res) => {
  const { texto } = req.body;

  if (!texto) {
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Texto vacío",
    });
  }

  // 🚀 FILTRO RÁPIDO
  if (contienePalabrasProhibidas(texto)) {
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Filtro rápido detectó contenido prohibido",
    });
  }

  // 🤖 IA (Gemini)
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
Eres un moderador de contenido.

Responde SOLO JSON así:
{"bloqueado": true/false}

Bloquea si hay:
- contenido sexual
- pornografía
- desnudos
                  `,
                },
                {
                  text: texto,
                },
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
      const limpio = textoIA.replace("```json", "").replace("```", "").trim();
      const json = JSON.parse(limpio);
      bloqueado = json.bloqueado === true;
    } catch (e) {
      bloqueado = false;
    }

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      razon: bloqueado ? "IA detectó contenido" : "Contenido permitido",
    });
  } catch (error) {
    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Error IA",
    });
  }
});



// ==========================================
// 🔥 VERIFICAR IMAGEN (NUEVO)
// ==========================================
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
          contents: [
            {
              parts: [
                {
                  text: `
Eres un moderador de imágenes.

Responde SOLO JSON así:
{"bloqueado": true/false}

Bloquea si la imagen contiene:
- desnudos
- contenido sexual
- pornografía
- partes íntimas visibles
                  `,
                },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
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

    const textoIA =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let bloqueado = false;

    try {
      const limpio = textoIA.replace("```json", "").replace("```", "").trim();
      const json = JSON.parse(limpio);
      bloqueado = json.bloqueado === true;
    } catch (e) {
      bloqueado = false;
    }

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      razon: bloqueado ? "Imagen prohibida detectada" : "Imagen permitida",
    });
  } catch (error) {
    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Error IA imagen",
    });
  }
});



// ==========================================
// 🚀 SERVIDOR
// ==========================================
app.get("/", (req, res) => {
  res.send("Backend funcionando 🚀");
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

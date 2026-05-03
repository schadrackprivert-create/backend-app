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

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

// 🔥 Anti spam
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 40,
  })
);

// =============================
// 🔥 PALABRAS PROHIBIDAS (solo hardcore)
// =============================
const palabrasProhibidas = [
  "xxx",
  "porno",
  "porn",
  "onlyfans",
  "cp",
];

function contienePalabrasProhibidas(texto = "") {
  return palabrasProhibidas.some((p) =>
    texto.toLowerCase().includes(p)
  );
}

// =============================
// 🔥 VERIFICAR TEXTO (NO TAN ESTRICTO)
// =============================
app.post("/verificar", async (req, res) => {
  const { texto } = req.body;

  if (!texto) return res.json({ permitido: true });

  // filtro rápido
  if (contienePalabrasProhibidas(texto)) {
    return res.json({
      permitido: false,
      bloqueado: true,
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
Responde SOLO JSON:
{"bloqueado": true}
o
{"bloqueado": false}

Bloquea SOLO si hay:
- sexo explícito
- pornografía
- odio grave
- violencia fuerte

Texto normal → permitido
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

    let textoIA =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let bloqueado = false;

    try {
      textoIA = textoIA.replace(/```json/g, "").replace(/```/g, "");
      const json = JSON.parse(textoIA);
      bloqueado = json.bloqueado === true;
    } catch {
      bloqueado = false; // 🔥 SI FALLA → PERMITE
    }

    return res.json({
      permitido: !bloqueado,
      bloqueado,
    });
  } catch {
    return res.json({
      permitido: true, // 🔥 ERROR → PERMITE
      bloqueado: false,
    });
  }
});

// =============================
// 🔥 VERIFICAR IMAGEN (MUCHO MEJOR)
// =============================
app.post("/verificar-imagen", async (req, res) => {
  const { imagen } = req.body;

  if (!imagen) {
    return res.json({
      permitido: false,
      bloqueado: true,
    });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
Responde SOLO JSON:
{"bloqueado": true}
o
{"bloqueado": false}

Bloquea SOLO si hay:
- desnudos completos
- sexo
- porno explícito

NO bloquear:
- selfies
- cara
- ropa normal
- fotos normales
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

    let textoIA =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let bloqueado = false;

    try {
      textoIA = textoIA.replace(/```json/g, "").replace(/```/g, "");
      const json = JSON.parse(textoIA);
      bloqueado = json.bloqueado === true;
    } catch {
      bloqueado = false; // 🔥 SI FALLA → PERMITE
    }

    return res.json({
      permitido: !bloqueado,
      bloqueado,
    });
  } catch {
    return res.json({
      permitido: true, // 🔥 ERROR → PERMITE
      bloqueado: false,
    });
  }
});

// =============================
app.get("/", (req, res) => {
  res.send("Backend IA PRO funcionando 🚀");
});

// =============================
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

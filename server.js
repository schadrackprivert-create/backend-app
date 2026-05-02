⁸import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(express.json({ limit: "20mb" }));
app.use(cors());

// 🔑 TU API KEY (pon la tuya)
const API_KEY = "AIzaSyCqPQqC0ytcTHF1kcCBiTJzdpjIlCYN6T8";

// 🔥 PALABRAS PROHIBIDAS (filtro rápido)
const palabrasProhibidas = [
  "xxx",
  "porno",
  "porn",
  "sexo",
  "desnudo",
  "nude",
  "onlyfans",
  "puta",
  "escort"
];

// 🔍 función filtro rápido
function contienePalabrasProhibidas(texto = "") {
  const t = texto.toLowerCase();
  return palabrasProhibidas.some(p => t.includes(p));
}

// 🚀 ENDPOINT
app.post("/verificar", async (req, res) => {
  const { texto } = req.body;

  // 1. FILTRO RÁPIDO
  if (contienePalabrasProhibidas(texto)) {
    return res.json({
      permitido: false,
      bloqueado: true,
      resultado: "SI",
      razon: "Bloqueado por palabras prohibidas"
    });
  }

  try {
    // 2. IA GEMINI
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
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

Texto: ${texto}
`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    const respuestaIA =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const bloqueado = respuestaIA.includes("true");

    return res.json({
      permitido: !bloqueado,
      bloqueado: bloqueado,
      resultado: bloqueado ? "SI" : "NO",
      razon: "Evaluado por IA"
    });

  } catch (error) {
    return res.json({
      permitido: true,
      bloqueado: false,
      resultado: "NO",
      razon: "Error IA, permitido por seguridad"
    });
  }
});

// 🟢 PUERTO (Render usa este)
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

// 🔐 TU API KEY (ponla en Render luego)
const API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json());

// 🔥 PALABRAS PROHIBIDAS
const palabras = [
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

// 🔍 FILTRO RÁPIDO
function contieneProhibido(texto = "") {
  const t = texto.toLowerCase();
  return palabras.some(p => t.includes(p));
}

// 🚀 ENDPOINT
app.post("/verificar", async (req, res) => {
  const { texto } = req.body;

  if (!texto) {
    return res.json({
      permitido: false,
      error: "No hay texto"
    });
  }

  // 🔥 1. FILTRO RÁPIDO
  if (contieneProhibido(texto)) {
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Filtro rápido detectó contenido prohibido"
    });
  }

  try {
    // 🤖 2. IA GEMINI
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

Texto:
${texto}
`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    let bloqueado = false;

    try {
      const textoIA = data.candidates[0].content.parts[0].text;
      const json = JSON.parse(textoIA);
      bloqueado = json.bloqueado;
    } catch (e) {
      console.log("Error interpretando IA");
    }

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      resultado: bloqueado ? "NO" : "SI",
      razon: bloqueado ? "IA detectó contenido" : "Contenido limpio"
    });

  } catch (error) {
    console.log(error);

    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Error IA, permitido por seguridad básica"
    });
  }
});

// 🌐 SERVER
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});

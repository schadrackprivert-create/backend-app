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
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
  })
);

function detectarMime(imagen = "") {
  const str = String(imagen).trim();
  const match = str.match(/^data:(image\/\w+);base64,/);
  if (match) return match[1];

  const raw = str.includes("base64,") ? str.split("base64,")[1] : str;

  if (raw.startsWith("/9j/")) return "image/jpeg";
  if (raw.startsWith("iVBOR")) return "image/png";
  if (raw.startsWith("R0lGO")) return "image/gif";
  if (raw.startsWith("UklGR")) return "image/webp";

  return "image/jpeg";
}

function limpiarBase64(imagen = "") {
  const str = String(imagen || "").trim();
  const idx = str.indexOf("base64,");
  return (idx !== -1 ? str.slice(idx + 7) : str).replace(/\s/g, "");
}

function limpiarJson(texto = "") {
  return String(texto)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

app.get("/", (req, res) => {
  res.send("Backend funcionando 🔥");
});

app.post("/verificar", async (req, res) => {
  try {
    const { texto = "" } = req.body;

    if (!API_KEY) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Falta GEMINI_API_KEY",
      });
    }

    const contenido = String(texto || "").trim();

    if (!contenido) {
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "Texto vacío permitido",
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
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
          ],
          contents: [
            {
              parts: [
                {
                  text: `
Eres un moderador de una app social turística.

Responde SOLO JSON válido:
{"bloqueado": false, "razon": "permitido"}
o
{"bloqueado": true, "razon": "motivo"}

Bloquea SOLO si el texto contiene claramente:
- pornografía o contenido sexual explícito
- amenazas directas
- odio extremo
- venta de drogas ilegales o armas
- violencia extrema

Si tienes duda, responde bloqueado false.
                  `,
                },
                { text: contenido },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini HTTP error texto:", response.status, err);

      return res.json({
        permitido: false,
        bloqueado: true,
        razon: `Error Gemini texto ${response.status}`,
      });
    }

    const data = await response.json();

    if (data?.promptFeedback?.blockReason) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Texto bloqueado por seguridad de Google",
      });
    }

    const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!textoIA) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "IA texto no respondió",
      });
    }

    let json;
    try {
      json = JSON.parse(limpiarJson(textoIA));
    } catch {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Respuesta IA texto inválida",
      });
    }

    return res.json({
      permitido: json.bloqueado === false,
      bloqueado: json.bloqueado !== false,
      razon: json.razon || "Evaluación completada",
    });
  } catch (error) {
    console.error("ERROR TEXTO:", error.message);

    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error técnico texto",
    });
  }
});

app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen, tipo = "post" } = req.body;

    if (!API_KEY) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Falta GEMINI_API_KEY",
      });
    }

    if (!imagen) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "No llegó imagen",
      });
    }

    const base64 = limpiarBase64(imagen);

    if (!base64 || base64.length < 1000) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Imagen inválida o muy pequeña",
      });
    }

    const mimeType = detectarMime(imagen);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 150,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
          ],
          contents: [
            {
              parts: [
                {
                  text: `
Eres un moderador de imágenes para una app social turística.

Responde SOLO JSON válido:
{"bloqueado": false, "razon": "permitido"}
o
{"bloqueado": true, "razon": "motivo"}

BLOQUEA SOLO si hay claramente:
- genitales visibles
- pezones femeninos expuestos
- acto sexual
- pornografía
- desnudez explícita real
- violencia gore extrema
- drogas ilegales visibles
- armas apuntando a personas

PERMITE:
- selfies normales
- personas con ropa normal
- playa, bikini o traje de baño sin desnudez explícita
- comida
- paisajes
- turismo
- fotos familiares
- hoteles
- ciudades

Regla clave:
Si tienes duda, responde bloqueado false.

Tipo de imagen: ${tipo}
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
      const err = await response.text();
      console.error("Gemini HTTP error imagen:", response.status, err);

      return res.json({
        permitido: false,
        bloqueado: true,
        razon: `Error Gemini imagen ${response.status}`,
      });
    }

    const data = await response.json();

    if (data?.promptFeedback?.blockReason) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Imagen bloqueada por seguridad de Google",
      });
    }

    const finishReason = data?.candidates?.[0]?.finishReason || "";
    const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("IA imagen:", textoIA);
    console.log("finishReason:", finishReason);

    if (finishReason === "SAFETY") {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Imagen bloqueada por filtros de seguridad",
      });
    }

    if (!textoIA) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "IA imagen no respondió",
      });
    }

    let json;
    try {
      json = JSON.parse(limpiarJson(textoIA));
    } catch {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Respuesta IA imagen inválida",
      });
    }

    return res.json({
      permitido: json.bloqueado === false,
      bloqueado: json.bloqueado !== false,
      razon: json.razon || "Evaluación completada",
    });
  } catch (error) {
    console.error("ERROR IMAGEN:", error.message);

    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error técnico imagen",
    });
  }
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});

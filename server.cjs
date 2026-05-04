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

// ✅ CORREGIDO: detecta el tipo MIME real de la imagen
function detectarMime(imagen = "") {
  const str = String(imagen).trim();
  const match = str.match(/^data:(image\/\w+);base64,/);
  if (match) return match[1];
  const raw = str.indexOf("base64,") !== -1
    ? str.slice(str.indexOf("base64,") + 7)
    : str;
  if (raw.startsWith("/9j/"))   return "image/jpeg";
  if (raw.startsWith("iVBOR")) return "image/png";
  if (raw.startsWith("R0lGO")) return "image/gif";
  if (raw.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

// ✅ CORREGIDO: lógica simplificada sin duplicación
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

// ✅ IA REAL PARA TEXTO
app.post("/verificar", async (req, res) => {
  try {
    const { texto = "" } = req.body;

    if (!API_KEY) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Falta GEMINI_API_KEY en Render",
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
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: { temperature: 0, maxOutputTokens: 100 },
          safetySettings: [
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
          contents: [
            {
              parts: [
                {
                  text: `
Eres un moderador de una app social turística.

Responde SOLO JSON válido:
{"bloqueado": true, "razon": "motivo"}
o
{"bloqueado": false, "razon": "permitido"}

Bloquea si el texto contiene:
- contenido sexual explícito
- pornografía
- venta sexual
- acoso
- odio
- amenazas
- violencia extrema
- drogas o armas
- insultos graves

No bloquees saludos, turismo, viajes, fotos normales o comentarios normales.
                  `,
                },
                { text: contenido },
              ],
            },
          ],
        }),
      }
    );

    // ✅ CORREGIDO: verificar status HTTP antes de parsear
    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini HTTP error (texto):", response.status, err);
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: `Error Gemini ${response.status}`,
      });
    }

    const data = await response.json();

    if (data?.promptFeedback?.blockReason) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Bloqueado por seguridad de Google",
      });
    }

    const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!textoIA) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "IA no respondió",
      });
    }

    let json;
    try {
      json = JSON.parse(limpiarJson(textoIA));
    } catch {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Respuesta IA inválida",
      });
    }

    return res.json({
      permitido: json.bloqueado === false,
      bloqueado: json.bloqueado !== false,
      razon: json.razon || "Evaluación completada",
    });

  } catch (error) {
    // ✅ CORREGIDO: solo loggear el mensaje, no el objeto completo
    console.error("ERROR TEXTO:", error.message);
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error técnico IA texto",
    });
  }
});

// ✅ IA REAL PARA IMAGEN
app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen, tipo = "post" } = req.body;

    if (!API_KEY) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Falta GEMINI_API_KEY en Render",
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

    // ✅ CORREGIDO: detectar el tipo MIME real
    const mimeType = detectarMime(imagen);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: { temperature: 0, maxOutputTokens: 120 },
          safetySettings: [
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
          contents: [
            {
              parts: [
                {
                  text: `
Analiza esta imagen para una app social turística.

Responde SOLO JSON válido:
{"bloqueado": true, "razon": "motivo"}
o
{"bloqueado": false, "razon": "permitido"}

Bloquea si la imagen contiene:
- desnudez explícita
- pornografía
- acto sexual
- partes íntimas visibles
- violencia gráfica
- sangre extrema
- armas usadas para amenazar
- drogas ilegales
- odio o símbolos extremistas

No bloquees:
- selfies normales
- paisajes
- comida
- playas sin desnudez explícita
- ropa normal
- fotos familiares
- fotos turísticas normales

Tipo de imagen: ${tipo}
                  `,
                },
                {
                  inlineData: {
                    mimeType: mimeType,   // ✅ CORREGIDO: tipo real, no fijo
                    data: base64,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    // ✅ CORREGIDO: verificar status HTTP antes de parsear
    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini HTTP error (imagen):", response.status, err);
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: `Error Gemini ${response.status}`,
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
        razon: "IA no respondió",
      });
    }

    let json;
    try {
      json = JSON.parse(limpiarJson(textoIA));
    } catch {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Respuesta IA inválida",
      });
    }

    return res.json({
      permitido: json.bloqueado === false,
      bloqueado: json.bloqueado !== false,
      razon: json.razon || "Evaluación completada",
    });

  } catch (error) {
    // ✅ CORREGIDO: solo loggear el mensaje, no el objeto completo
    console.error("ERROR IMAGEN:", error.message);
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error técnico IA imagen",
    });
  }
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});

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

// âœ… Detecta el tipo MIME real de la imagen
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

// âœ… Limpia el base64 quitando prefijo data URI
function limpiarBase64(imagen = "") {
  const str = String(imagen || "").trim();
  const idx = str.indexOf("base64,");
  return (idx !== -1 ? str.slice(idx + 7) : str).replace(/\s/g, "");
}

// âœ… Limpia backticks de markdown que Gemini a veces agrega
function limpiarJson(texto = "") {
  return String(texto)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

app.get("/", (req, res) => {
  res.send("Backend funcionando ðŸ”¥");
});

// âœ… VERIFICAR TEXTO
app.post("/verificar", async (req, res) => {
  try {
    const { texto = "" } = req.body;

    if (!API_KEY) {
      return res.json({
        permitido: true,           // âœ… FIX: si no hay API key, permitir
        bloqueado: false,
        razon: "Sin API key, se permite por defecto",
      });
    }

    const contenido = String(texto || "").trim();

    if (!contenido) {
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "Texto vacÃ­o permitido",
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
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" }, // âœ… FIX: menos restrictivo
            { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
          ],
          contents: [
            {
              parts: [
                {
                  text: `
Eres un moderador MUY permisivo de una app social turÃ­stica.
Tu trabajo es SOLO bloquear contenido CLARAMENTE inapropiado.
En caso de DUDA, siempre responde bloqueado: false.

Responde SOLO este JSON sin texto extra, sin markdown, sin explicaciÃ³n:
{"bloqueado": false, "razon": "permitido"}
o solo si hay algo CLARAMENTE explÃ­cito:
{"bloqueado": true, "razon": "motivo especÃ­fico"}

BLOQUEA SOLO si el texto contiene de forma MUY CLARA:
- pornografÃ­a o contenido sexual explÃ­cito
- venta sexual o prostituciÃ³n
- amenazas directas de violencia
- odio racial o discriminaciÃ³n extrema
- venta de drogas ilegales o armas

NO BLOQUEES (esto es normal y debe pasar siempre):
- saludos y comentarios normales
- descripciones de viajes y turismo
- opiniones sobre lugares
- comentarios sobre comida o restaurantes
- fotos y descripciones de paisajes
- cualquier texto cotidiano o turÃ­stico
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
      console.error("Gemini HTTP error (texto):", response.status, err);
      return res.json({
        permitido: true,           // âœ… FIX: error tÃ©cnico â†’ permitir
        bloqueado: false,
        razon: "Error tÃ©cnico Gemini, se permite por defecto",
      });
    }

    const data = await response.json();

    if (data?.promptFeedback?.blockReason) {
      console.warn("Texto bloqueado por Google Safety:", data.promptFeedback.blockReason);
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Bloqueado por seguridad de Google",
      });
    }

    const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("Respuesta IA texto:", textoIA); // âœ… Log para depurar

    if (!textoIA) {
      return res.json({
        permitido: true,           // âœ… FIX: sin respuesta â†’ permitir
        bloqueado: false,
        razon: "IA sin respuesta, se permite por defecto",
      });
    }

    let json;
    try {
      json = JSON.parse(limpiarJson(textoIA));
    } catch {
      console.warn("JSON invÃ¡lido de IA texto:", textoIA);
      return res.json({
        permitido: true,           // âœ… FIX: JSON invÃ¡lido â†’ permitir
        bloqueado: false,
        razon: "Respuesta IA no parseable, se permite por defecto",
      });
    }

    return res.json({
      permitido: json.bloqueado === false,
      bloqueado: json.bloqueado !== false,
      razon: json.razon || "EvaluaciÃ³n completada",
    });

  } catch (error) {
    console.error("ERROR TEXTO:", error.message);
    return res.json({
      permitido: true,             // âœ… FIX: excepciÃ³n â†’ permitir
      bloqueado: false,
      razon: "Error tÃ©cnico, se permite por defecto",
    });
  }
});

// âœ… VERIFICAR IMAGEN
app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen, tipo = "post" } = req.body;

    if (!API_KEY) {
      return res.json({
        permitido: true,           // âœ… FIX: sin API key â†’ permitir
        bloqueado: false,
        razon: "Sin API key, se permite por defecto",
      });
    }

    if (!imagen) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "No llegÃ³ imagen",
      });
    }

    const base64 = limpiarBase64(imagen);
    console.log("Base64 length:", base64.length); // âœ… Log para depurar

    if (!base64 || base64.length < 1000) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Imagen invÃ¡lida o muy pequeÃ±a",
      });
    }

    const mimeType = detectarMime(imagen);
    console.log("MIME detectado:", mimeType); // âœ… Log para depurar

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: { temperature: 0, maxOutputTokens: 120 },
          safetySettings: [
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" }, // âœ… FIX: menos restrictivo
            { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
          ],
          contents: [
            {
              parts: [
                {
                  text: `
Eres un moderador MUY permisivo de una app de turismo familiar.
Tu trabajo es SOLO bloquear contenido CLARAMENTE inapropiado.
En caso de DUDA, siempre responde bloqueado: false.

Responde SOLO este JSON sin texto extra, sin markdown, sin explicaciÃ³n:
{"bloqueado": false, "razon": "permitido"}
o solo si hay algo CLARAMENTE explÃ­cito:
{"bloqueado": true, "razon": "motivo especÃ­fico"}

BLOQUEA SOLO si ves CLARAMENTE:
- pornografÃ­a o actos sexuales explÃ­citos
- genitales expuestos sin contexto mÃ©dico
- violencia gore con sangre extrema
- sÃ­mbolos de odio extremista muy claros

NO BLOQUEES bajo ninguna circunstancia (esto es NORMAL y debe pasar):
- personas vestidas normalmente
- selfies y fotos personales
- paisajes, playas, montaÃ±as, ciudades
- comida y restaurantes
- hoteles, calles, edificios
- fotos familiares o grupales
- cualquier foto turÃ­stica o cotidiana
- personas en traje de baÃ±o en playa
- ropa deportiva o casual

Tipo de imagen: ${tipo}
                  `,
                },
                {
                  inlineData: {
                    mimeType: mimeType,
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
      console.error("Gemini HTTP error (imagen):", response.status, err);
      return res.json({
        permitido: true,           // âœ… FIX: error HTTP â†’ permitir
        bloqueado: false,
        razon: "Error tÃ©cnico Gemini, se permite por defecto",
      });
    }

    const data = await response.json();

    if (data?.promptFeedback?.blockReason) {
      console.warn("Imagen bloqueada por Google Safety:", data.promptFeedback.blockReason);
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Imagen bloqueada por seguridad de Google",
      });
    }

    const finishReason = data?.candidates?.[0]?.finishReason || "";
    const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("Respuesta IA imagen:", textoIA); // âœ… Log para depurar
    console.log("finishReason:", finishReason);   // âœ… Log para depurar

    if (finishReason === "SAFETY") {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Imagen bloqueada por filtros de seguridad",
      });
    }

    if (!textoIA) {
      return res.json({
        permitido: true,           // âœ… FIX: sin respuesta â†’ permitir
        bloqueado: false,
        razon: "IA sin respuesta, se permite por defecto",
      });
    }

    let json;
    try {
      json = JSON.parse(limpiarJson(textoIA));
    } catch {
      console.warn("JSON invÃ¡lido de IA imagen:", textoIA);
      return res.json({
        permitido: true,           // âœ… FIX: JSON invÃ¡lido â†’ permitir
        bloqueado: false,
        razon: "Respuesta IA no parseable, se permite por defecto",
      });
    }

    return res.json({
      permitido: json.bloqueado === false,
      bloqueado: json.bloqueado !== false,
      razon: json.razon || "EvaluaciÃ³n completada",
    });

  } catch (error) {
    console.error("ERROR IMAGEN:", error.message);
    return res.json({
      permitido: true,             // âœ… FIX: excepciÃ³n â†’ permitir
      bloqueado: false,
      razon: "Error tÃ©cnico, se permite por defecto",
    });
  }
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});

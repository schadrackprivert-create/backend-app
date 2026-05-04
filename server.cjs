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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
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

// âœ… Control de rate limit para Gemini imagen (mÃ¡x 1 request cada 2s)
let ultimaLlamadaImagen = 0;
const DELAY_MINIMO_MS = 2000;

// âœ… Helper: esperar si es necesario antes de llamar a Gemini
async function esperarRateLimit() {
  const ahora = Date.now();
  const tiempoDesdeUltima = ahora - ultimaLlamadaImagen;
  if (tiempoDesdeUltima < DELAY_MINIMO_MS) {
    await new Promise(r => setTimeout(r, DELAY_MINIMO_MS - tiempoDesdeUltima));
  }
  ultimaLlamadaImagen = Date.now();
}

// âœ… Helper: llamar a Gemini con reintentos si hay 429
async function llamarGeminiConRetry(url, body, maxIntentos = 3) {
  for (let intento = 1; intento <= maxIntentos; intento++) {
    await esperarRateLimit();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status !== 429) return response;
    const espera = intento * 3000; // 3s, 6s, 9s
    console.warn(`429 Rate limit, reintentando en ${espera}ms (intento ${intento}/${maxIntentos})`);
    await new Promise(r => setTimeout(r, espera));
  }
  // Si agotÃ³ reintentos, devolver el Ãºltimo 429
  return { ok: false, status: 429, text: async () => "Rate limit agotado" };
}


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

    const response = await llamarGeminiConRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        generationConfig: { temperature: 0, maxOutputTokens: 120 },
          safetySettings: [
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_LOW_AND_ABOVE" }, // âœ… Estricto para sexual
            { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
          ],
          contents: [
            {
              parts: [
                {
                  text: `
Eres un moderador de contenido para una app social turÃ­stica familiar.

Responde SOLO este JSON sin texto extra, sin markdown, sin explicaciÃ³n:
{"bloqueado": false, "razon": "permitido"}
o:
{"bloqueado": true, "razon": "motivo especÃ­fico"}

BLOQUEA SIEMPRE si la imagen contiene:
- genitales masculinos o femeninos visibles (pene, vagina, ano)
- pechos femeninos con pezones expuestos
- actos sexuales de cualquier tipo (penetraciÃ³n, sexo oral, masturbaciÃ³n)
- pornografÃ­a o contenido erÃ³tico explÃ­cito
- personas desnudas en poses sexuales
- violencia gore: sangre extrema, mutilaciones, cadÃ¡veres
- drogas ilegales siendo consumidas o vendidas
- armas apuntando a personas

PERMITE sin dudar:
- personas con ropa normal o casual
- traje de baÃ±o o bikini en contexto de playa o piscina
- ropa deportiva o interior si no es sexual
- selfies y retratos normales
- paisajes, playas, montaÃ±as, ciudades
- comida, restaurantes, hoteles
- fotos familiares o grupales
- cualquier foto turÃ­stica

REGLA CLAVE: traje de baÃ±o NO es desnudez. Bikini en playa = PERMITIDO.
Solo bloquea desnudez real (genitales o pechos con pezones expuestos).

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
        }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini HTTP error (imagen):", response.status, err);

      // 429 = rate limit agotado â†’ permitir para no bloquear fotos normales
      if (response.status === 429) {
        return res.json({
          permitido: true,
          bloqueado: false,
          razon: "LÃ­mite de velocidad alcanzado, se permite por defecto",
        });
      }

      // Otros errores (400, 403, 500) â†’ bloquear
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: `Imagen rechazada por Gemini (error ${response.status})`,
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
      permitido: false,            // âœ… FIX: excepciÃ³n en imagen â†’ bloquear por seguridad
      bloqueado: true,
      razon: "Error tÃ©cnico, imagen bloqueada por seguridad",
    });
  }
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});

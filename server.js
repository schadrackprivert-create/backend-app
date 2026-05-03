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

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"],
}));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60,
}));

function limpiarBase64(imagen = "") {
  let limpio = String(imagen || "").trim();

  if (limpio.includes(",")) {
    limpio = limpio.split(",").pop() || "";
  }

  return limpio
    .replace(/^data:image\/\w+;base64,/i, "")
    .replace(/\s/g, "");
}

function limpiarJson(texto = "") {
  return String(texto || "")
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

function parseJsonSeguro(texto = "") {
  try {
    return JSON.parse(limpiarJson(texto));
  } catch {
    return null;
  }
}

const palabrasProhibidas = [
  "xxx",
  "porno",
  "porn",
  "onlyfans",
  "escort",
  "desnudo",
  "desnuda",
  "nude",
  "nudes",
];

function contienePalabrasProhibidas(texto = "") {
  const t = String(texto || "").toLowerCase();
  return palabrasProhibidas.some((p) => t.includes(p));
}

app.post("/verificar", async (req, res) => {
  const { texto } = req.body;

  if (!texto || !String(texto).trim()) {
    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Texto vacío permitido",
    });
  }

  if (contienePalabrasProhibidas(texto)) {
    return res.json({
      permitido: false,
      bloqueado: true,
      esSexual: true,
      razon: "Texto prohibido",
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
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
          ],
          generationConfig: { temperature: 0 },
          contents: [
            {
              parts: [
                {
                  text: `
Analiza este texto para una red social turística.

Responde SOLO JSON válido:
{"bloqueado": true, "razon": "motivo"}
o
{"bloqueado": false, "razon": "texto permitido"}

Bloquea si hay contenido sexual explícito, pornografía, odio grave, amenazas o violencia extrema.
No bloquees conversación normal, turismo, amistad, familia o texto inocente.
`,
                },
                { text: String(texto) },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (data.promptFeedback?.blockReason === "SAFETY") {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Texto bloqueado por seguridad Google",
      });
    }

    const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const json = parseJsonSeguro(textoIA);

    if (!json) {
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "IA no respondió JSON válido, texto permitido",
      });
    }

    const bloqueado = json.bloqueado === true;

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      razon: json.razon || (bloqueado ? "Texto bloqueado" : "Texto permitido"),
    });
  } catch (error) {
    console.log("Error IA texto:", error);

    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Error IA texto, permitido",
    });
  }
});

app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen, tipo } = req.body;
    const imagenLimpia = limpiarBase64(imagen);

    console.log("Imagen recibida length:", imagenLimpia.length, "tipo:", tipo || "general");

    if (!imagenLimpia || imagenLimpia.length < 1000) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Imagen inválida o demasiado pequeña",
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safetySettings: [
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_LOW_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
          ],
          generationConfig: { temperature: 0 },
          contents: [
            {
              parts: [
                {
                  text: `
Analiza esta imagen de forma objetiva para una red social turística.

Responde SOLO JSON válido:
{"bloqueado": true, "razon": "motivo"}
o
{"bloqueado": false, "razon": "imagen permitida"}

Bloquea si hay:
- desnudez
- genitales visibles
- acto sexual
- pornografía
- senos claramente desnudos
- contenido sexual explícito
- texto sexual explícito dentro de la imagen

No bloquees:
- selfies normales
- rostro normal
- turismo
- paisaje
- comida
- familia
- ropa normal
- playa normal sin desnudez
- foto de perfil normal
`,
                },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: imagenLimpia,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    console.log("RESPUESTA IA IMAGEN:", JSON.stringify(data));

    if (data.promptFeedback?.blockReason === "SAFETY") {
      return res.json({
        permitido: false,
        bloqueado: true,
        nsfw: true,
        adulto: true,
        esSexual: true,
        razon: "Bloqueado por seguridad Google",
      });
    }

    const finishReason = data?.candidates?.[0]?.finishReason || "";
    const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (finishReason === "SAFETY") {
      return res.json({
        permitido: false,
        bloqueado: true,
        nsfw: true,
        adulto: true,
        esSexual: true,
        razon: "Bloqueado por seguridad IA",
      });
    }

    if (!textoIA) {
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "IA no respondió → permitido",
      });
    }

    const json = parseJsonSeguro(textoIA);

    if (!json) {
      const texto = String(textoIA).toLowerCase();

      const esSexual =
        texto.includes("desnudo") ||
        texto.includes("desnuda") ||
        texto.includes("sexual") ||
        texto.includes("porn") ||
        texto.includes("genital") ||
        texto.includes("nude") ||
        texto.includes("explicit");

      return res.json({
        permitido: !esSexual,
        bloqueado: esSexual,
        nsfw: esSexual,
        adulto: esSexual,
        esSexual,
        razon: esSexual ? "Contenido sexual detectado" : "Imagen permitida",
      });
    }

    const razon = String(json.razon || "").toLowerCase();

    const bloqueado =
      json.bloqueado === true ||
      razon.includes("sexual") ||
      razon.includes("desnudo") ||
      razon.includes("desnuda") ||
      razon.includes("porn") ||
      razon.includes("genital") ||
      razon.includes("senos") ||
      razon.includes("acto sexual") ||
      razon.includes("adulto");

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      nsfw: bloqueado,
      adulto: bloqueado,
      esSexual: bloqueado,
      razon: json.razon || (bloqueado ? "Imagen bloqueada" : "Imagen permitida"),
    });
  } catch (error) {
    console.log("ERROR IA IMAGEN:", error);

    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Error técnico → permitido",
    });
  }
});

app.get("/", (req, res) => {
  res.send("Backend Glopost funcionando 🚀");
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

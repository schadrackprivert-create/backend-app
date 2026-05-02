import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(helmet());
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    permitido: false,
    bloqueado: true,
    resultado: "SI",
    razon: "Demasiadas solicitudes. Intenta de nuevo en 1 minuto.",
  },
});

app.use(limiter);

app.get("/", (req, res) => {
  res.json({
    ok: true,
    mensaje: "Backend Glopost funcionando con HTTPS en Render",
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    status: "healthy",
  });
});

app.post("/verificar", async (req, res) => {
  try {
    const { texto } = req.body;

    if (!texto || typeof texto !== "string") {
      return res.json({
        permitido: true,
        bloqueado: false,
        resultado: "NO",
        razon: "Sin texto para revisar",
      });
    }

    const textoLimpio = texto.trim();

    if (textoLimpio.length > 1000) {
      return res.status(400).json({
        permitido: false,
        bloqueado: true,
        resultado: "SI",
        razon: "Texto demasiado largo",
      });
    }

    const palabrasBloqueadas = [
      "sexo explícito",
      "sexo explicito",
      "pornografía",
      "pornografia",
      "desnudo completo",
      "desnuda completa",
      "violación",
      "violacion",
      "droga ilegal",
      "matar",
      "suicidio",
      "hackear",
      "robar contraseña",
      "robar contrasena"
    ];

    const textoMinuscula = textoLimpio.toLowerCase();

    const contienePalabraBloqueada = palabrasBloqueadas.some((p) =>
      textoMinuscula.includes(p)
    );

    if (contienePalabraBloqueada) {
      return res.json({
        permitido: false,
        bloqueado: true,
        resultado: "SI",
        razon: "Contenido bloqueado por reglas de seguridad",
      });
    }

    if (!GEMINI_API_KEY) {
      return res.json({
        permitido: true,
        bloqueado: false,
        resultado: "NO",
        razon: "Sin GEMINI_API_KEY configurada. Pasó solo revisión básica.",
      });
    }

    const prompt = `
Eres un sistema de moderación para una app social turística llamada Glopost.

Responde SOLO con JSON válido.

Analiza este texto:
"${textoLimpio}"

Bloquea si contiene:
- contenido sexual explícito
- desnudez completa
- acoso grave
- amenazas
- violencia explícita
- instrucciones de hacking o fraude
- spam peligroso
- contenido ilegal

No bloquees:
- turismo
- playa con ropa de baño
- comida
- viajes
- comentarios normales
- mensajes amistosos

Formato obligatorio:
{
  "permitido": true o false,
  "resultado": "NO" si permitido o "SI" si bloqueado,
  "razon": "motivo corto"
}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    const textoRespuesta =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const limpio = textoRespuesta
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let resultadoIA;

    try {
      resultadoIA = JSON.parse(limpio);
    } catch {
      resultadoIA = {
        permitido: true,
        resultado: "NO",
        razon: "No se pudo interpretar IA, permitido por seguridad básica",
      };
    }

    return res.json({
      permitido: resultadoIA.permitido === true,
      bloqueado: resultadoIA.permitido !== true,
      resultado: resultadoIA.resultado || (resultadoIA.permitido ? "NO" : "SI"),
      razon: resultadoIA.razon || "Revisión completada",
    });
  } catch (error) {
    console.error("Error /verificar:", error);

    return res.status(500).json({
      permitido: true,
      bloqueado: false,
      resultado: "NO",
      razon: "Error del servidor, permitido temporalmente",
    });
  }
});

app.post("/verificar-imagen", async (req, res) => {
  return res.json({
    permitido: true,
    bloqueado: false,
    resultado: "NO",
    razon:
      "Endpoint listo. Para detectar desnudez real en imágenes/videos necesitas Vision API, AWS Rekognition o Google SafeSearch.",
  });
});

app.listen(PORT, () => {
  console.log(`Servidor Glopost corriendo en puerto ${PORT}`);
});

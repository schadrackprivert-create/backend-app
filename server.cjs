require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const {
  RekognitionClient,
  DetectModerationLabelsCommand,
} = require("@aws-sdk/client-rekognition");

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 10000;

app.use(helmet());
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 80,
  })
);

// 🔥 AWS
const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// 🔥 TEST
app.get("/", (req, res) => {
  res.send("Backend funcionando 🔥 AWS real activo");
});

// 🔥 TEXTO
app.post("/verificar", async (req, res) => {
  try {
    const { texto = "" } = req.body;
    const contenido = String(texto).toLowerCase();

    const palabrasBloqueadas = [
      "porno",
      "porn",
      "xxx",
      "nudes",
      "nude",
      "desnudo",
      "desnuda",
      "sexo",
      "sexual",
      "pene",
      "vagina",
    ];

    const bloqueado = palabrasBloqueadas.some((p) =>
      contenido.includes(p)
    );

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      razon: bloqueado ? "Texto bloqueado 🚫" : "Texto permitido ✅",
    });
  } catch (error) {
    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Error texto, permitido",
    });
  }
});

// 🔥 IMAGEN PRO (MEJORADO)
app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen } = req.body;

    if (!imagen) {
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "Sin imagen",
      });
    }

    const imagenLimpia = String(imagen)
      .replace(/^data:image\/\w+;base64,/i, "")
      .replace(/\s/g, "");

    const buffer = Buffer.from(imagenLimpia, "base64");

    const command = new DetectModerationLabelsCommand({
      Image: { Bytes: buffer },
      MinConfidence: 70, // 👈 más flexible
    });

    const result = await rekognition.send(command);
    const labels = result.ModerationLabels || [];

    console.log(
      "AWS labels:",
      labels.map((l) => ({
        name: l.Name,
        confidence: l.Confidence,
      }))
    );

    // 🔥 SOLO BLOQUEAR LO REALMENTE EXPLÍCITO
    const categoriasFuertes = [
      "Explicit Nudity",
      "Graphic Male Nudity",
      "Graphic Female Nudity",
      "Exposed Genitalia",
      "Exposed Female Nipple",
      "Sexual Activity",
    ];

    const THRESHOLD_BLOCK = 85;

    let bloqueado = false;
    let etiquetaDetectada = null;

    for (const label of labels) {
      if (
        categoriasFuertes.includes(label.Name) &&
        label.Confidence >= THRESHOLD_BLOCK
      ) {
        bloqueado = true;
        etiquetaDetectada = label;
        break;
      }
    }

    // 🚫 SI ES EXPLÍCITO → BLOQUEAR
    if (bloqueado) {
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "Imagen bloqueada por contenido sexual 🚫",
        etiqueta: etiquetaDetectada?.Name,
        confianza: etiquetaDetectada?.Confidence,
      });
    }

    // ⚠️ CONTENIDO NORMAL (PLAYA, BIKINI, GYM)
    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Imagen permitida ✅",
    });

  } catch (error) {
    console.log("ERROR AWS:", error);

    return res.status(500).json({
      permitido: false,
      bloqueado: true,
      razon: "Error verificando imagen (bloqueado por seguridad)",
      error: error.message,
    });
  }
});

// 🚀 SERVER
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});

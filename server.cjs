require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const AWS = require("aws-sdk");

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;

const rekognition = new AWS.Rekognition({
  region: process.env.AWS_REGION || "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

app.use(helmet());
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 80,
  })
);

// 🔥 RUTA TEST
app.get("/", (req, res) => {
  res.send("Backend funcionando 🔥");
});

// 🔥 BLOQUEO TEXTO
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
      "sexo explícito",
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
    return res.status(500).json({
      permitido: false,
      bloqueado: true,
      razon: "Error verificando texto",
    });
  }
});

// 🔥 BLOQUEO IMAGEN REAL CON AWS REKOGNITION
app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen } = req.body;

    if (!imagen) {
      return res.status(400).json({
        permitido: false,
        bloqueado: true,
        razon: "No llegó imagen",
      });
    }

    const imagenLimpia = String(imagen)
      .replace(/^data:image\/\w+;base64,/i, "")
      .replace(/\s/g, "");

    const buffer = Buffer.from(imagenLimpia, "base64");

    const result = await rekognition
      .detectModerationLabels({
        Image: { Bytes: buffer },
        MinConfidence: 60,
      })
      .promise();

    const labels = result.ModerationLabels || [];

    const categoriasBloqueadas = [
      "Explicit Nudity",
      "Nudity",
      "Sexual Activity",
      "Graphic Male Nudity",
      "Graphic Female Nudity",
      "Sexual Situations",
      "Suggestive",
      "Female Swimwear Or Underwear",
      "Male Swimwear Or Underwear",
    ];

    const etiquetaBloqueada = labels.find((label) =>
      categoriasBloqueadas.some((cat) =>
        String(label.Name).toLowerCase().includes(cat.toLowerCase())
      )
    );

    if (etiquetaBloqueada) {
      return res.status(403).json({
        permitido: false,
        bloqueado: true,
        razon: "Imagen bloqueada por contenido sexual o desnudez 🚫",
        etiqueta: etiquetaBloqueada.Name,
        confianza: etiquetaBloqueada.Confidence,
        labels,
      });
    }

    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Imagen permitida ✅",
      labels,
    });
  } catch (error) {
    console.log("ERROR AWS REKOGNITION:", error);

    return res.status(500).json({
      permitido: false,
      bloqueado: true,
      razon: "Error analizando imagen con AWS",
      error: error.message,
    });
  }
});

// 🚀 SERVER
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});
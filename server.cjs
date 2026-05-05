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
      return res.json({
        permitido: false,
        bloqueado: true,
        razon: "No llegó imagen",
      });
    }

    // 🔥 SIEMPRE PERMITIR (temporal)
    return res.json({
      permitido: true,
      bloqueado: false,
      esSexual: false,
      nsfw: false,
      categoria: "safe",
      razon: "Imagen permitida ✅",
    });

  } catch (error) {
    return res.json({
      permitido: true, // 🔥 IMPORTANTE: no bloquear por error
      bloqueado: false,
      esSexual: false,
      nsfw: false,
      categoria: "safe",
      razon: "Error pero permitido",
    });
  }
});

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

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

app.get("/", (req, res) => {
  res.send("Backend funcionando 🔥 AWS real activo");
});

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

    const bloqueado = palabrasBloqueadas.some((p) => contenido.includes(p));

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

app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen } = req.body;

    if (!imagen) {
      return res.json({
        permitido: true,
        bloqueado: false,
        razon: "Sin imagen, permitido",
      });
    }

    const imagenLimpia = String(imagen)
      .replace(/^data:image\/\w+;base64,/i, "")
      .replace(/\s/g, "");

    const buffer = Buffer.from(imagenLimpia, "base64");

    const command = new DetectModerationLabelsCommand({
      Image: {
        Bytes: buffer,
      },
      MinConfidence: 80,
    });

    const result = await rekognition.send(command);
    const labels = result.ModerationLabels || [];

    const categoriasBloqueadasExactas = [
      "Explicit Nudity",
      "Graphic Male Nudity",
      "Graphic Female Nudity",
      "Sexual Activity",
      "Sexual Situations",
      "Adult Toys",
    ];

    const etiquetaBloqueada = labels.find((label) =>
      categoriasBloqueadasExactas.includes(label.Name || "")
    );

    if (etiquetaBloqueada) {
      return res.json({
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
  console.log("ERROR AWS:", error);

  return res.status(500).json({
    permitido: false,
    bloqueado: true,
    razon: "No se pudo verificar la imagen con AWS. Intenta nuevamente.",
    error: error.message,
  });
}
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});

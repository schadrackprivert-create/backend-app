require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
<<<<<<< HEAD
require("dotenv").config();
=======
const multer = require("multer");

const {
  RekognitionClient,
  DetectModerationLabelsCommand,
} = require("@aws-sdk/client-rekognition");

const { createClient } = require("@supabase/supabase-js");
>>>>>>> fcec130 (add aws rekognition supabase upload)

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;

app.use(helmet());
<<<<<<< HEAD
app.use(express.json({ limit: "10mb" }));
app.use(cors({ origin: "*" }));
=======
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "20mb" }));
>>>>>>> fcec130 (add aws rekognition supabase upload)

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 80,
  })
);

<<<<<<< HEAD
// 🔥 RUTA TEST
=======
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

>>>>>>> fcec130 (add aws rekognition supabase upload)
app.get("/", (req, res) => {
  res.send("Backend funcionando 🔥");
});

<<<<<<< HEAD
// 🔥 BLOQUEO TEXTO
=======
>>>>>>> fcec130 (add aws rekognition supabase upload)
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
<<<<<<< HEAD
      "sexo explícito",
=======
>>>>>>> fcec130 (add aws rekognition supabase upload)
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

<<<<<<< HEAD
// 🔥 BLOQUEO IMAGEN (SIMPLIFICADO PARA RENDER)
app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen } = req.body;

    if (!imagen) {
      return res.json({
=======
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
>>>>>>> fcec130 (add aws rekognition supabase upload)
        permitido: false,
        bloqueado: true,
        razon: "No llegó imagen",
      });
    }

<<<<<<< HEAD
    // ⚠️ Simulación ligera (evita caída del servidor)
    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Imagen permitida (modo ligero)",
    });

  } catch (error) {
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error analizando imagen",
    });
  }
});

// 🚀 SERVER
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
=======
    const command = new DetectModerationLabelsCommand({
      Image: {
        Bytes: file.buffer,
      },
      MinConfidence: 60,
    });

    const response = await rekognition.send(command);
    const labels = response.ModerationLabels || [];

    const categoriasBloqueadas = [
      "Explicit Nudity",
      "Nudity",
      "Graphic Male Nudity",
      "Graphic Female Nudity",
      "Sexual Activity",
      "Illustrated Explicit Nudity",
      "Adult Toys",
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

    const extension = file.mimetype?.includes("png") ? "png" : "jpg";
    const fileName = `posts/${Date.now()}-${Math.round(
      Math.random() * 999999
    )}.${extension}`;

    const { error } = await supabase.storage
      .from("imagenes")
      .upload(fileName, file.buffer, {
        contentType: file.mimetype || "image/jpeg",
        upsert: false,
      });

    if (error) {
      return res.status(500).json({
        permitido: false,
        bloqueado: true,
        razon: "Error subiendo imagen a Supabase",
        error: error.message,
      });
    }

    const { data } = supabase.storage.from("imagenes").getPublicUrl(fileName);

    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Imagen permitida y subida correctamente ✅",
      url: data.publicUrl,
      fileName,
      labels,
    });
  } catch (error) {
    console.error("ERROR UPLOAD:", error);

    return res.status(500).json({
      permitido: false,
      bloqueado: true,
      razon: "Error analizando imagen con IA",
      error: error.message,
    });
  }
>>>>>>> fcec130 (add aws rekognition supabase upload)
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nsfw = require("nsfwjs");
const tf = require("@tensorflow/tfjs");
const { Image } = require("canvas");
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(express.json({ limit: "15mb" }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
  })
);

let modeloNSFW = null;

async function cargarModelo() {
  if (!modeloNSFW) {
    modeloNSFW = await nsfw.load();
    console.log("Modelo NSFW local cargado ✅");
  }
  return modeloNSFW;
}

function limpiarBase64(imagen = "") {
  const str = String(imagen || "").trim();
  const idx = str.indexOf("base64,");
  return (idx !== -1 ? str.slice(idx + 7) : str).replace(/\s/g, "");
}

function base64ATensor(base64) {
  const buffer = Buffer.from(base64, "base64");
  const img = new Image();
  img.src = buffer;
  return tf.browser.fromPixels(img);
}

app.get("/", (req, res) => {
  res.send("Backend funcionando 🔥");
});

app.post("/verificar-imagen", async (req, res) => {
  let tensor = null;

  try {
    const { imagen } = req.body;

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
        razon: "Imagen inválida",
      });
    }

    const modelo = await cargarModelo();
    tensor = base64ATensor(base64);

    const predicciones = await modelo.classify(tensor);

    const porn =
      predicciones.find((p) => p.className === "Porn")?.probability || 0;

    const hentai =
      predicciones.find((p) => p.className === "Hentai")?.probability || 0;

    const sexy =
      predicciones.find((p) => p.className === "Sexy")?.probability || 0;

    const bloqueado = porn >= 0.65 || hentai >= 0.65 || sexy >= 0.85;

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      razon: bloqueado ? "Imagen NSFW detectada" : "Imagen permitida",
      scores: {
        porn: Number(porn.toFixed(3)),
        hentai: Number(hentai.toFixed(3)),
        sexy: Number(sexy.toFixed(3)),
      },
      predicciones,
    });
  } catch (error) {
    console.error("ERROR NSFW LOCAL:", error.message);

    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error analizando imagen local",
    });
  } finally {
    if (tensor) tensor.dispose();
  }
});

app.post("/verificar", async (req, res) => {
  try {
    const { texto = "" } = req.body;
    const contenido = String(texto || "").toLowerCase();

    const palabrasBloqueadas = [
      "porno",
      "porn",
      "xxx",
      "nudes",
      "desnudo",
      "desnuda",
      "pene",
      "vagina",
      "sexo explícito",
    ];

    const bloqueado = palabrasBloqueadas.some((p) => contenido.includes(p));

    return res.json({
      permitido: !bloqueado,
      bloqueado,
      razon: bloqueado ? "Texto bloqueado" : "Texto permitido",
    });
  } catch (error) {
    return res.json({
      permitido: false,
      bloqueado: true,
      razon: "Error verificando texto",
    });
  }
});

app.listen(PORT, async () => {
  try {
    await cargarModelo();
  } catch (error) {
    console.error("No se pudo cargar modelo NSFW:", error.message);
  }

  console.log("Servidor corriendo en puerto " + PORT);
});
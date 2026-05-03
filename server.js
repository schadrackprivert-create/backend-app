const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

// Seguridad
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(cors({ origin: "*" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
  })
);

// Limpiar base64
function limpiarBase64(imagen = "") {
  let limpio = String(imagen || "").trim();

  if (limpio.includes(",")) {
    limpio = limpio.split(",").pop();
  }

  return limpio.replace(/^data:image\/\w+;base64,/, "");
}

// 🔥 TEST
app.get("/", (req, res) => {
  res.send("Servidor funcionando 🚀");
});

// 🔥 VALIDAR TEXTO
app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen } = req.body;

    if (!imagen) {
      return res.json({ permitido: false });
    }

    // 🔥 Aquí puedes conectar IA después
    return res.json({
      permitido: true,
    });

  } catch (error) {
    console.log(error);
    res.json({ permitido: false });
  }
});

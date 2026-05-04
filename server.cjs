const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(cors({ origin: "*" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
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

    const bloqueado = palabrasBloqueadas.some((p) =>
      contenido.includes(p)
    );

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

// 🔥 BLOQUEO IMAGEN (SIMPLIFICADO PARA RENDER)
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
});

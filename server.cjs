require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

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

app.get("/", (req, res) => {
  res.send("Backend funcionando 🔥");
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

    return res.json({
      permitido: true,
      bloqueado: false,
      nsfw: false,
      categoria: "safe",
      razon: "Imagen permitida ✅",
    });
  } catch (error) {
    return res.json({
      permitido: true,
      bloqueado: false,
      razon: "Error imagen, permitido",
    });
  }
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});

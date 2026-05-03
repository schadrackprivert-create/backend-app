const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;

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

// TEST
app.get("/", (req, res) => {
  res.send("Servidor funcionando 🚀");
});

// TEXTO
app.post("/verificar", async (req, res) => {
  try {
    return res.json({ permitido: true });
  } catch {
    res.json({ permitido: false });
  }
});

// IMAGEN
app.post("/verificar-imagen", async (req, res) => {
  try {
    const { imagen } = req.body;

    if (!imagen) {
      return res.json({ permitido: false });
    }

    return res.json({ permitido: true });
  } catch {
    res.json({ permitido: false });
  }
});

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});

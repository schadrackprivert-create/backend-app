import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

// Middlewares
app.use(helmet());
app.use(express.json({ limit: "10mb" })); // Aumentamos límite para imágenes pesadas
app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
}));

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
});
app.use(limiter);

// =============================
// 🔥 VERIFICAR TEXTO
// =============================
const palabrasProhibidas = ["xxx", "porno", "porn", "sexo", "puta", "escort"];

function contienePalabrasProhibidas(texto = "") {
    const t = texto.toLowerCase();
    return palabrasProhibidas.some((p) => t.includes(p));
}

app.post("/verificar", async (req, res) => {
    const { texto } = req.body;

    if (contienePalabrasProhibidas(texto)) {
        return res.json({ permitido: false, bloqueado: true, razon: "Palabra prohibida detectada" });
    }

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    generationConfig: { temperature: 0 },
                    contents: [{ parts: [{ text: `Analiza si este texto es sexual o violento. Responde SOLO JSON: {"bloqueado": boolean}. Texto: ${texto}` }] }],
                }),
            }
        );

        const data = await response.json();
        const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        const match = textoIA.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error("Formato de respuesta inválido");
        }

        const json = JSON.parse(match[0]);

        return res.json({ permitido: !json.bloqueado, bloqueado: json.bloqueado, razon: json.bloqueado ? "Contenido inapropiado" : "OK" });
    } catch (e) {
        console.error("Error en verificación de texto:", e);
        return res.json({ permitido: false, bloqueado: true, razon: "Error en IA" });
    }
});

// =============================
// 🔥 VERIFICAR IMAGEN
// =============================
app.post("/verificar-imagen", async (req, res) => {
    const { imagen, tipo } = req.body;

    if (!imagen) {
        return res.json({
            permitido: false,
            bloqueado: true,
            razon: "No se proporcionó la imagen",
        });
    }

    try {
        // Limpiamos el base64 por si viene con el prefijo "data:image/jpeg;base64,"
        let base64Limpio = imagen;
        if (base64Limpio.includes(",")) {
            base64Limpio = base64Limpio.split(",")[1];
        }
        base64Limpio = base64Limpio.replace(/\s/g, "");

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    generationConfig: { temperature: 0.1 },
                    contents: [
                        {
                            parts: [
                                {
                                    text: "Analiza la imagen. Detecta si contiene contenido sexual, desnudez explícita, gore o contenido violento. Responde SOLO JSON: {\"bloqueado\": boolean, \"razon\": \"string\"}.",
                                },
                                {
                                    inlineData: {
                                        mimeType: "image/jpeg",
                                        data: base64Limpio,
                                    },
                                },
                            ],
                        },
                    ],
                }),
            }
        );

        const data = await response.json();
        const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        const match = textoIA.match(/\{[\s\S]*\}/);
        if (!match) {
            throw new Error("Formato de respuesta inválido desde la IA");
        }

        const json = JSON.parse(match[0]);

        return res.json({
            permitido: !json.bloqueado,
            bloqueado: json.bloqueado,
            razon: json.bloqueado ? json.razon : "OK",
        });
    } catch (e) {
        console.error("Error en verificación de imagen:", e);
        return res.json({
            permitido: false,
            bloqueado: true,
            razon: "Error al evaluar la imagen con IA",
        });
    }
});

app.get("/", (req, res) => res.send("Backend activo 🚀"));

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

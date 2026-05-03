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
app.use(express.json({ limit: "5mb" })); // Suficiente para imágenes base64
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
        const limpio = textoIA.replace(/```json/g, "").replace(/```/g, "").trim();
        const json = JSON.parse(limpio);

        return res.json({ permitido: !json.bloqueado, bloqueado: json.bloqueado, razon: json.bloqueado ? "Contenido inapropiado" : "OK" });
    } catch {
        return res.json({ permitido: false, bloqueado: true, razon: "Error en IA" });
    }
});

// =============================
// 🔥 VERIFICAR IMAGEN (OPTIMIZADO Y ESTRICTO)
// =============================
app.post("/verificar-imagen", async (req, res) => {
    const { imagen } = req.body;

    if (!imagen) return res.json({ permitido: false, bloqueado: true, razon: "Falta imagen" });

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    // 🔥 Nivel estricto para bloquear contenido sexual
                    safetySettings: [
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
                    ],
                    generationConfig: { temperature: 0 },
                    contents: [{
                        parts: [
                            { text: `Analiza esta imagen. ¿Contiene desnudez explícita o actos sexuales? Responde SOLO JSON: {"bloqueado": boolean, "razon": string}. Si es una foto normal, bloqueado: false.` },
                            { inlineData: { mimeType: "image/jpeg", data: imagen } },
                        ],
                    }],
                }),
            }
        );

        const data = await response.json();

        // Verificar si Google bloqueó la petición antes de intentar parsear
        if (data.promptFeedback?.blockReason === "SAFETY") {
            return res.json({ permitido: false, bloqueado: true, razon: "Imagen bloqueada por filtros de seguridad" });
        }

        const textoIA = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!textoIA) {
            return res.json({ permitido: false, bloqueado: true, razon: "La IA no pudo evaluar la imagen o fue filtrada" });
        }

        const limpio = textoIA.replace(/```json/g, "").replace(/```/g, "").trim();
        const json = JSON.parse(limpio);

        return res.json({
            permitido: !json.bloqueado,
            bloqueado: json.bloqueado,
            razon: json.razon || "Evaluación completada"
        });

    } catch (e) {
        return res.json({ permitido: false, bloqueado: true, razon: "Error al procesar imagen" });
    }
});

app.get("/", (req, res) => res.send("Backend activo 🚀"));

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

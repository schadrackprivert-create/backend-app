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
// 🔥 VERIFICAR IMAGEN
// =============================
app.post("/verificar-imagen", async (req, res) => {
    let { imagen } = req.body;

    if (!imagen) return res.json({ permitido: false, bloqueado: true, razon: "Falta imagen" });

    try {
        // 1. Limpiar el prefijo data:image/png;base64 o data:image/jpeg;base64 si lo trae
        if (imagen.includes(",")) {
            imagen = imagen.split(",")[1];
        }

        // 2. Detectar el tipo de archivo de la imagen
        let mimeType = "image/jpeg";
        if (imagen.startsWith("iVBOR")) { // Firma típica de PNG
            mimeType = "image/png";
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    safetySettings: [
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
                    ],
                    generationConfig: { temperature: 0 },
                    contents: [{
                        parts: [
                            { text: "Analiza esta imagen. ¿Contiene desnudez explícita o actos sexuales? Responde SOLO JSON: {\"bloqueado\": boolean, \"razon\": string}. Si es una foto normal, bloqueado: false." },
                            { inlineData: { mimeType: mimeType, data: imagen } },
                        ],
                    }],
                }),
            }
        );

        const data = await response.json();

        // 3. Revisar si hay un bloqueo en el prompt de la petición
        if (data.promptFeedback?.blockReason) {
            return res.json({ 
                permitido: false, 
                bloqueado: true, 
                razon: `Imagen bloqueada por filtros de seguridad: ${data.promptFeedback.blockReason}` 
            });
        }

        // 4. Revisar si Gemini rechazó el candidato por seguridad
        const candidate = data?.candidates?.[0];
        if (candidate?.finishReason && candidate.finishReason !== "STOP") {
            return res.json({ 
                permitido: false, 
                bloqueado: true, 
                razon: `La evaluación fue bloqueada por la IA (Motivo: ${candidate.finishReason})` 
            });
        }

        const textoIA = candidate?.content?.parts?.[0]?.text || "";
        if (!textoIA) {
            return res.json({ 
                permitido: false, 
                bloqueado: true, 
                razon: "La respuesta de la IA llegó vacía o fue filtrada" 
            });
        }

        const limpio = textoIA.replace(/```json/g, "").replace(/```/g, "").trim();
        const json = JSON.parse(limpio);

        return res.json({
            permitido: !json.bloqueado,
            bloqueado: json.bloqueado,
            razon: json.razon || "Evaluación completada"
        });

    } catch (e) {
        console.error("Error al procesar la imagen:", e);
        return res.json({ permitido: false, bloqueado: true, razon: "Error al procesar imagen" });
    }
});

app.get("/", (req, res) => res.send("Backend activo 🚀"));

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

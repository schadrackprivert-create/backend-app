# Glopost Backend Nivel Dios

Backend seguro para Glopost.

## Archivos
- server.js
- package.json
- .env.example

## En Render
Build Command:
npm install

Start Command:
node server.js

## Variable de entorno en Render
Nombre:
GEMINI_API_KEY

Valor:
Pega tu API key de Gemini

## Rutas
GET /
GET /health
POST /verificar

## En tu index.tsx cambia:
const IA_API_URL = "https://TU-BACKEND.onrender.com/verificar";

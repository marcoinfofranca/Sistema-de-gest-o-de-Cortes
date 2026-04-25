import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware para desenvolvimento com Vite
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa", // O modo SPA já cuida do roteamento para o index.html
    });
    
    app.use(vite.middlewares);
  } else {
    // Em produção, serve os arquivos estáticos da pasta dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // REDIRECIONAMENTO CRÍTICO: Todas as rotas desconhecidas vão para o index.html
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();

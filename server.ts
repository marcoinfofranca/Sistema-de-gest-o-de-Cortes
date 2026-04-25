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
      appType: "custom", // Mudamos para custom para controlar o fallback
    });
    
    app.use(vite.middlewares);

    // No modo dev, se a requisição chegar aqui e for HTML, servimos o index.html transformado
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;

      // Ignora requisições que parecem ser arquivos estáticos (com extensão)
      if (url.includes('.') && !url.endsWith('.html')) {
        return next();
      }

      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        // Transforma o index.html para injetar o cliente do Vite (HMR, etc)
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
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

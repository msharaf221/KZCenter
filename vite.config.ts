import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function projectBackupApiPlugin(): Plugin {
  const handler = (req: any, res: any, next: any) => {
    if (req.url?.startsWith('/__api/backup/save') && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const today = new Date().toISOString().split('T')[0];
          const filename = parsed.filename || `backup_${today}.json`;
          const backupsDir = path.resolve(__dirname, 'backups');
          if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
          }
          const content = typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data, null, 2);
          const targetFile = path.join(backupsDir, filename);
          fs.writeFileSync(targetFile, content, 'utf-8');

          // Always ensure backup_YYYY-MM-DD.json is created/updated
          const dateFile = path.join(backupsDir, `backup_${today}.json`);
          if (targetFile !== dateFile) {
            fs.writeFileSync(dateFile, content, 'utf-8');
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            filename,
            path: targetFile,
            size: Buffer.byteLength(content, 'utf-8'),
            savedAt: new Date().toISOString(),
          }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: String(err) }));
        }
      });
      return;
    }
    next();
  };

  return {
    name: 'project-backup-api',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), projectBackupApiPlugin()],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});

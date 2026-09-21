import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ────────────────────────────────────────────────────────────
//  Плагин «Yandex Disk» — хранит бэкапы данных в папке
//  ~/Yandex.Disk.localized/Goalie Stats Backups/
//  (Яндекс.Диск сам синхронизирует эту папку в облако).
//  Папка задаётся переменной окружения GOALIE_BACKUP_DIR.
//
//  Эндпоинты dev-сервера:
//    POST /api/disk-backup   body {name?, data}  → сохранить
//    GET  /api/disk-backup/list                  → список бэкапов
//    GET  /api/disk-backup?file=<name>           → прочитать
//    DELETE /api/disk-backup?file=<name>         → удалить
// ────────────────────────────────────────────────────────────

const BACKUP_DIR =
  process.env.GOALIE_BACKUP_DIR ||
  path.join(os.homedir(), 'Yandex.Disk.localized', 'Goalie Stats Backups');

function yandexDiskBackup() {
  return {
    name: 'yandex-disk-backup',
    configureServer(server: any) {
      const dir = BACKUP_DIR;

      const safeFile = (name: string | null): string | null => {
        if (!name || !/^[\w\-. ]+\.json$/.test(name) || name.includes('..')) return null;
        return path.join(dir, name);
      };

      const json = (res: any, code: number, obj: unknown) => {
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(obj));
      };

      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = new URL(req.url || '', 'http://localhost');
        if (!url.pathname.startsWith('/api/disk-backup')) return next();

        try {
          if (req.method === 'POST') {
            let body = '';
            for await (const chunk of req) body += chunk;
            const parsed = JSON.parse(body);
            if (!parsed.data || !Array.isArray(parsed.data.games)) {
              return json(res, 400, { ok: false, error: 'invalid data' });
            }
            fs.mkdirSync(dir, { recursive: true });
            const d = new Date();
            const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
            const name = `${parsed.name || 'goalie-backup'}-${ts}.json`;
            fs.writeFileSync(path.join(dir, name), JSON.stringify(parsed.data, null, 2), 'utf-8');
            // всегда держим актуальный «latest» для автобэкапа
            fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(parsed.data, null, 2), 'utf-8');
            return json(res, 200, { ok: true, file: name });
          }

          if (req.method === 'GET' && url.pathname.endsWith('/list')) {
            let files: { name: string; size: number; mtime: number }[] = [];
            if (fs.existsSync(dir)) {
              files = fs.readdirSync(dir)
                .filter(f => f.endsWith('.json'))
                .map(f => {
                  const st = fs.statSync(path.join(dir, f));
                  return { name: f, size: st.size, mtime: st.mtimeMs };
                })
                .sort((a, b) => b.mtime - a.mtime)
                .slice(0, 50);
            }
            return json(res, 200, { ok: true, dir, files });
          }

          if (req.method === 'GET') {
            const fp = safeFile(url.searchParams.get('file'));
            if (!fp || !fs.existsSync(fp)) return json(res, 404, { ok: false, error: 'not found' });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.end(fs.readFileSync(fp, 'utf-8'));
          }

          if (req.method === 'DELETE') {
            const fp = safeFile(url.searchParams.get('file'));
            if (!fp || !fs.existsSync(fp)) return json(res, 404, { ok: false, error: 'not found' });
            fs.unlinkSync(fp);
            return json(res, 200, { ok: true });
          }

          return json(res, 405, { ok: false, error: 'method not allowed' });
        } catch (e: any) {
          return json(res, 500, { ok: false, error: String(e?.message || e) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), yandexDiskBackup()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // Порт и host задаются через CLI: npm run dev -- --host 0.0.0.0 --port 7100
  server: { open: false },
});

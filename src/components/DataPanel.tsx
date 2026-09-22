import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { checkDiskApi, saveToDisk, listDiskBackups, loadDiskBackup, deleteDiskBackup, DiskBackupInfo, DiskStatus } from '../utils/diskSync';
import * as gist from '../utils/gist';
import * as yndx from '../utils/yndx';
import { encryptJSON } from '../utils/crypto';
import { getSessionPassword } from '../utils/auth';
import type { AppState } from '../types';

export default function DataPanel() {
  const importData = useStore(s => s.importData);
  const mergeData = useStore(s => s.mergeData);
  const autoDiskSync = useStore(s => !!s.autoDiskSync);
  const setAutoDiskSync = useStore(s => s.setAutoDiskSync);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');

  // ── Yandex Disk ──────────────────────────────────────────
  const [disk, setDisk] = useState<DiskStatus | null>(null);
  const [backups, setBackups] = useState<DiskBackupInfo[]>([]);
  const [showBackups, setShowBackups] = useState(false);
  const [busy, setBusy] = useState(false);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 4000);
  };

  useEffect(() => {
    checkDiskApi().then(setDisk);
  }, []);

  const refreshBackups = async () => {
    try {
      setBackups(await listDiskBackups());
    } catch { /* dev-сервер недоступен */ }
  };

  const handleDiskSave = async () => {
    const raw = localStorage.getItem('goalieZoneStatsV2');
    if (!raw) { flash('❌ Нет данных для сохранения'); return; }
    setBusy(true);
    try {
      const parsed = JSON.parse(raw);
      const data = (parsed.state && parsed.state.games ? parsed.state : parsed) as AppState;
      const saved = await saveToDisk(data, 'goalie-backup');
      flash(`✅ Сохранено на Яндекс.Диск: ${saved?.name}`);
      setBackups(await listDiskBackups());
    } catch (e: any) {
      flash(`❌ Ошибка сохранения: ${e?.message || e}`);
    }
    setBusy(false);
  };

  const handleDiskRestore = async (f: DiskBackupInfo) => {
    if (!confirm(`Восстановить данные из «${f.name}»? Текущие данные будут заменены.`)) return;
    setBusy(true);
    try {
      const data = await loadDiskBackup(f.name);
      importData(data);
      flash(`✅ Восстановлено из Яндекс.Диска: ${f.name}`);
    } catch (e: any) {
      flash(`❌ Ошибка: ${e?.message || e}`);
    }
    setBusy(false);
  };

  const handleDiskDelete = async (f: DiskBackupInfo) => {
    if (!confirm(`Удалить бэкап «${f.name}»?`)) return;
    await deleteDiskBackup(f.name);
    setBackups(await listDiskBackups());
  };

  const toggleBackups = () => {
    const next = !showBackups;
    setShowBackups(next);
    if (next) refreshBackups();
  };

  // ── Облако: GitHub Gist ─────────────────────────────────
  // Чтение — без токена (raw-URL). Запись — токен GitHub с правом gist.
  const [ghToken, setGhToken] = useState(gist.getGhToken());
  const [ghInput, setGhInput] = useState('');
  const [ghLogin, setGhLogin] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  useEffect(() => {
    if (!ghToken) return;
    gist.checkGhToken()
      .then(login => setGhLogin(login))
      .catch(() => { setGhLogin(null); });
  }, [ghToken]);

  const handleGhConnect = async () => {
    if (!ghInput.trim()) return;
    setCloudBusy(true);
    try {
      gist.setGhToken(ghInput);
      const login = await gist.checkGhToken();
      setGhToken(gist.getGhToken());
      setGhLogin(login);
      setGhInput('');
      flash(`✅ Запись в облако включена: ${login}`);
    } catch (e: any) {
      gist.setGhToken(null);
      setGhToken(null);
      flash(`❌ ${e?.message || e}`);
    }
    setCloudBusy(false);
  };

  const handleGhDisconnect = () => {
    gist.setGhToken(null);
    setGhToken(null);
    setGhLogin(null);
    flash('Токен записи удалён из этого браузера');
  };

  const readLocalState = (): AppState | null => {
    const raw = localStorage.getItem('goalieZoneStatsV2');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return ((parsed.state && parsed.state.games ? parsed.state : parsed) as AppState) || null;
  };

  const handleCloudSave = async () => {
    const data = readLocalState();
    if (!data) { flash('❌ Нет данных для сохранения'); return; }
    if (!ghToken) { flash('❌ Нужен токен GitHub с правом gist (поле выше)'); return; }
    setCloudBusy(true);
    try {
      await gist.writeSync(data);
      flash('✅ Записано в облако (GitHub Gist)');
    } catch (e: any) {
      flash(`❌ Ошибка: ${e?.message || e}`);
    }
    setCloudBusy(false);
  };

  const handleCloudLoad = async () => {
    setCloudBusy(true);
    try {
      const data = await gist.readSync();
      if (!data) { flash('В облаке пока нет данных'); setCloudBusy(false); return; }
      if (!confirm(`Заменить локальные данные данными из облака (${data.games.length} игр)?`)) { setCloudBusy(false); return; }
      importData(data);
      flash(`✅ Загружено из облака: ${data.games.length} игр`);
    } catch (e: any) {
      flash(`❌ Ошибка: ${e?.message || e}`);
    }
    setCloudBusy(false);
  };

  const handleCloudMerge = async () => {
    setCloudBusy(true);
    try {
      const data = await gist.readSync();
      if (!data) { flash('В облаке пока нет данных'); setCloudBusy(false); return; }
      const result = mergeData(data);
      flash(`✅ Объединено: +${result.added} игр, +${result.goaliesAdded} вратарей`);
    } catch (e: any) {
      flash(`❌ Ошибка: ${e?.message || e}`);
    }
    setCloudBusy(false);
  };


  // ── Автобэкап: debounce 10 сек после любого изменения ────
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!autoDiskSync) return;
    const unsub = useStore.subscribe((s, prev) => {
      if (!s.autoDiskSync) return;
      if (s.games === prev.games && s.goalies === prev.goalies && s.media === prev.media) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const state = { ...useStore.getState() } as AppState;
        // Приоритет: гист (GitHub-токен) → Яндекс.Диск (OAuth-токен) → локальный dev-сервер
        if (gist.getGhToken()) {
          try {
            await gist.writeSync(state);
          } catch { /* нет сети — попробуем после следующего изменения */ }
        } else if (yndx.getToken()) {
          try {
            // Как и гист: шифруем AES-256-GCM паролем сайта (если пароль сессии есть)
            const pwd = getSessionPassword();
            const content = pwd ? await encryptJSON(state, pwd) : JSON.stringify(state, null, 2);
            await yndx.uploadFile(`${yndx.FOLDER}/${yndx.SYNC_FILE}`, content);
          } catch { /* нет сети — попробуем после следующего изменения */ }
        } else if (disk?.available) {
          try {
            await saveToDisk(state, 'goalie-auto');
          } catch { /* сервер мог перезапуститься — попробуем позже */ }
        }
      }, 10_000);
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoDiskSync, disk]);

  // ── Обычный экспорт/импорт файлом ────────────────────────
  const handleExport = () => {
    const raw = localStorage.getItem('goalieZoneStatsV2');
    if (!raw) { flash('No data to export'); return; }
    try {
      const parsed = JSON.parse(raw);
      const data = parsed.state || parsed;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const ts = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
      a.href = url;
      a.download = `goalie-backup-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
      flash('✅ Backup downloaded');
    } catch {
      flash('❌ Export failed');
    }
  };

  const handleImportClick = (m: 'replace' | 'merge') => {
    setMode(m);
    fileRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!data || !Array.isArray(data.games)) {
          flash('❌ Invalid file format');
          return;
        }
        if (mode === 'replace') {
          if (!confirm(`Replace ALL current data with ${data.games.length} game(s) from file?`)) return;
          importData(data);
          flash(`✅ Imported ${data.games.length} game(s), ${data.goalies?.length || 0} goalie(s)`);
        } else {
          const result = mergeData(data);
          flash(`✅ Merged: +${result.added} game(s), +${result.goaliesAdded} goalie(s)`);
        }
      } catch {
        flash('❌ Could not parse JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const fmtDate = (ms: number) => new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtSize = (b: number) => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b > 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap gap-3 items-center">
        <span className="font-bold text-sm">💾 Data</span>
        <span className="text-xs text-mut flex-1">Auto-saved in browser · Drag & drop .json to import</span>
        <button onClick={handleExport} className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold border transition">
          ⬇ Quick Backup
        </button>
        <button onClick={() => handleImportClick('replace')} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line hover:bg-slate-50 transition">
          📂 Import (replace)
        </button>
        <button onClick={() => handleImportClick('merge')} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line hover:bg-slate-50 transition" title="Add games from file, merge goalies by name">
          🔀 Import (merge)
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
      </div>

      {/* ── Yandex Disk ── */}
      <div className="mt-3 pt-3 border-t border-line/60">
        <div className="flex flex-wrap gap-3 items-center">
          <span className="font-bold text-sm">☁️ Яндекс.Диск</span>
          {disk === null && <span className="text-xs text-mut">…</span>}
          {disk && !disk.available && (
            <span className="text-xs text-mut">Недоступно (работает через dev-сервер start.sh)</span>
          )}
          {disk?.available && (
            <>
              <button
                onClick={handleDiskSave}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line hover:bg-slate-50 transition disabled:opacity-50"
                title={disk.dir}
              >
                ☁️ Сохранить на диск
              </button>
              <button
                onClick={toggleBackups}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line hover:bg-slate-50 transition"
              >
                🗂 Бэкапы {backups.length ? `(${backups.length})` : ''} {showBackups ? '▴' : '▾'}
              </button>
              <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none" title="Через 10 секунд после каждого изменения данные пишутся в папку Яндекс.Диска «Goalie Stats Backups»">
                <input
                  type="checkbox"
                  checked={autoDiskSync}
                  onChange={e => setAutoDiskSync(e.target.checked)}
                  className="accent-current"
                />
                Автобэкап
              </label>
            </>
          )}
          {msg && <span className="text-xs font-semibold text-acc animate-in fade-in">{msg}</span>}
        </div>

        {showBackups && disk?.available && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line/60 divide-y divide-line/40">
            {!backups.length && <div className="p-3 text-xs text-mut">Бэкапов пока нет</div>}
            {backups.map(b => (
              <div key={b.name} className="flex items-center gap-2 px-3 py-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate" title={b.name}>{b.name}</div>
                  <div className="text-mut">{fmtDate(b.mtime)} · {fmtSize(b.size)}</div>
                </div>
                <button onClick={() => handleDiskRestore(b)} disabled={busy}
                  className="px-2 py-1 rounded-md border border-line hover:bg-slate-50 font-semibold disabled:opacity-50">
                  Восстановить
                </button>
                {b.name.startsWith('goalie-') && (
                  <button onClick={() => handleDiskDelete(b)} disabled={busy}
                    className="px-2 py-1 rounded-md border border-line hover:bg-red-50 text-red-500 disabled:opacity-50" title="Удалить файл с диска">✕</button>
                )}
              </div>
            ))}
            {disk.dir && <div className="px-3 py-2 text-[10px] text-mut break-all">Папка: {disk.dir}</div>}
          </div>
        )}
      </div>

      {/* ── Облако: GitHub Gist (чтение без токена, запись по токену) ── */}
      <div className="mt-3 pt-3 border-t border-line/60">
        <div className="flex flex-wrap gap-3 items-center">
          <span className="font-bold text-sm">🌐 Облако (все устройства)</span>
          <span className="text-xs text-mut" title="Архив читается с GitHub Gist автоматически на любом устройстве">
            Чтение — без токена
          </span>
          {ghToken && ghLogin && (
            <span className="text-xs text-green-600 font-semibold">✓ запись: {ghLogin}</span>
          )}
          {ghToken && !ghLogin && (
            <span className="text-xs text-mut">Проверка токена…</span>
          )}
          {!ghToken && (
            <>
              <input
                type="password"
                value={ghInput}
                onChange={e => setGhInput(e.target.value)}
                placeholder="GitHub-токен (только для записи, право gist)"
                className="flex-1 min-w-[220px] rounded-lg border border-line px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-slate-200"
              />
              <button
                onClick={handleGhConnect}
                disabled={cloudBusy || !ghInput.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 transition disabled:opacity-50"
              >
                Подключить запись
              </button>
              <span className="text-[10px] text-mut w-full">Токен: github.com/settings/tokens/new → имя «goalie-sync», галка только «gist» → Generate. Хранится только в этом браузере.</span>
            </>
          )}
          {ghToken && (
            <>
              <button
                onClick={handleCloudSave}
                disabled={cloudBusy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line hover:bg-slate-50 transition disabled:opacity-50"
                title="Записать текущие данные в GitHub Gist"
              >
                ⬆ В облако
              </button>
              <button
                onClick={handleGhDisconnect}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line hover:bg-red-50 text-red-500 transition"
              >
                Забыть токен
              </button>
            </>
          )}
          <button
            onClick={handleCloudLoad}
            disabled={cloudBusy}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line hover:bg-slate-50 transition disabled:opacity-50"
          >
            ⬇ Из облака (заменить)
          </button>
          <button
            onClick={handleCloudMerge}
            disabled={cloudBusy}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-line hover:bg-slate-50 transition disabled:opacity-50"
            title="Добавить игры из облака к локальным, вратари объединяются по имени"
          >
            🔀 Объединить
          </button>
          {msg && <span className="text-xs font-semibold text-acc animate-in fade-in">{msg}</span>}
        </div>
      </div>
    </div>
  );
}

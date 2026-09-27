import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import * as yndx from '../utils/yndx';
import { encryptJSON, decryptJSON } from '../utils/crypto';
import { getSessionPassword } from '../utils/auth';
import type { AppState } from '../types';

const BTN = 'px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/20 text-mut hover:text-ink hover:bg-white/5 transition disabled:opacity-50';
const MICRO = 'text-[10px] uppercase tracking-[0.14em] text-mut font-semibold';

export default function DataPanel() {
  const importData = useStore(s => s.importData);
  const mergeData = useStore(s => s.mergeData);
  const autoDiskSync = useStore(s => !!s.autoDiskSync);
  const setAutoDiskSync = useStore(s => s.setAutoDiskSync);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const modeRef = useRef<'replace' | 'merge'>('replace');

  // ── Яндекс.Диск (REST API — работает везде, сервер не нужен) ──
  const [token, setToken] = useState(yndx.getToken());
  const [tokenInput, setTokenInput] = useState('');
  const [login, setLogin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 4000);
  };

  useEffect(() => {
    if (!token) return;
    yndx.checkToken()
      .then(setLogin)
      .catch(() => setLogin(null));
  }, [token]);

  const handleConnect = async () => {
    if (!tokenInput.trim()) return;
    setBusy(true);
    try {
      yndx.setToken(tokenInput);
      const l = await yndx.checkToken();
      setToken(yndx.getToken());
      setLogin(l);
      setTokenInput('');
      flash(`✅ Яндекс.Диск подключён: ${l}`);
    } catch (e: any) {
      yndx.setToken(null);
      setToken(null);
      flash(`❌ ${e?.message || e}`);
    }
    setBusy(false);
  };

  const handleDisconnect = () => {
    yndx.setToken(null);
    setToken(null);
    setLogin(null);
    setAutoDiskSync(false);
    flash('Токен удалён из этого браузера');
  };

  const readLocalState = (): AppState | null => {
    const raw = localStorage.getItem('goalieZoneStatsV2');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return ((parsed.state && parsed.state.games ? parsed.state : parsed) as AppState) || null;
  };

  // Файл на диске зашифрован паролем сайта (legacy plain JSON проходит как есть)
  const decryptCloudText = async (text: string): Promise<any> => {
    try {
      return await decryptJSON(text, getSessionPassword() ?? '');
    } catch {
      const p = typeof prompt === 'function' ? prompt('Файл на диске зашифрован. Введите пароль сайта:') : null;
      if (!p) throw new Error('Нужен пароль сайта');
      return await decryptJSON(text, p);
    }
  };

  const uploadToDisk = async (): Promise<void> => {
    const state = readLocalState();
    if (!state) throw new Error('Нет данных для сохранения');
    const pwd = getSessionPassword();
    const content = pwd ? await encryptJSON(state, pwd) : JSON.stringify(state, null, 2);
    await yndx.uploadFile(`${yndx.FOLDER}/${yndx.SYNC_FILE}`, content);
  };

  const handleUpload = async () => {
    setBusy(true);
    try {
      await uploadToDisk();
      flash('✅ Записано на Яндекс.Диск');
    } catch (e: any) {
      flash(`❌ ${e?.message || e}`);
    }
    setBusy(false);
  };

  const handleDownload = async (merge: boolean) => {
    setBusy(true);
    try {
      const text = await yndx.downloadFile(`${yndx.FOLDER}/${yndx.SYNC_FILE}`);
      if (!text) { flash('На диске пока нет файла синхронизации'); setBusy(false); return; }
      const data = await decryptCloudText(text);
      if (!data || !Array.isArray(data.games)) throw new Error('Файл синхронизации повреждён');
      if (merge) {
        const result = mergeData(data);
        flash(`✅ Объединено: +${result.added} игр, +${result.goaliesAdded} вратарей`);
      } else {
        if (!confirm(`Заменить локальные данные данными с диска (${data.games.length} игр)?`)) { setBusy(false); return; }
        importData(data);
        flash(`✅ Загружено с диска: ${data.games.length} игр`);
      }
    } catch (e: any) {
      flash(`❌ ${e?.message || e}`);
    }
    setBusy(false);
  };

  // ── Автобэкап: debounce 10 сек после любого изменения ────
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!autoDiskSync) return;
    const unsub = useStore.subscribe((s, prev) => {
      if (!s.autoDiskSync) return;
      if (s.games === prev.games && s.goalies === prev.goalies && s.media === prev.media && s.seasons === prev.seasons && s.teams === prev.teams && s.activeSeasonId === prev.activeSeasonId) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        try {
          await uploadToDisk();
        } catch { /* нет сети — попробуем после следующего изменения */ }
      }, 10_000);
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDiskSync]);

  // ── Обычный экспорт/импорт файлом ────────────────────────
  const handleExport = () => {
    const raw = localStorage.getItem('goalieZoneStatsV2');
    if (!raw) { flash('Нет данных для экспорта'); return; }
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
      flash('✅ Бэкап скачан');
    } catch {
      flash('❌ Ошибка экспорта');
    }
  };

  const handleImportClick = (m: 'replace' | 'merge') => {
    modeRef.current = m;
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
          flash('❌ Неверный формат файла');
          return;
        }
        if (modeRef.current === 'replace') {
          if (!confirm(`Заменить ВСЕ текущие данные данными из файла (${data.games.length} игр)?`)) return;
          importData(data);
          flash(`✅ Импортировано: ${data.games.length} игр, ${data.goalies?.length || 0} вратарей`);
        } else {
          const result = mergeData(data);
          flash(`✅ Объединено: +${result.added} игр, +${result.goaliesAdded} вратарей`);
        }
      } catch {
        flash('❌ Не удалось прочитать JSON');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="card p-4 space-y-4">
      {/* ── Локальный файл ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className={MICRO + ' mr-1'}>Файл</span>
        <button onClick={handleExport} className="btn-primary px-3 py-1.5 rounded-lg text-xs font-bold transition">
          ⬇ Скачать бэкап
        </button>
        <button onClick={() => handleImportClick('replace')} className={BTN}>
          📂 Импорт (заменить)
        </button>
        <button onClick={() => handleImportClick('merge')} className={BTN} title="Добавить игры из файла, вратари объединяются по имени">
          🔀 Импорт (объединить)
        </button>
        <span className="text-[10px] text-mut/70 ml-auto">можно просто перетащить .json на страницу</span>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFileChange} />
      </div>

      {/* ── Яндекс.Диск ── */}
      <div className="pt-3 border-t border-line/10 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <span className={MICRO + ' mr-1'}>☁ Яндекс.Диск</span>
          {token && login && <span className="text-xs text-ok font-semibold">✓ {login}</span>}
          {token && !login && <span className="text-xs text-mut">Проверка токена…</span>}
          {!token && (
            <>
              <input
                type="password"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="OAuth-токен Яндекс.Диска"
                className="flex-1 min-w-[220px] rounded-lg bg-panel2/70 border border-line/20 px-3 py-1.5 text-xs text-ink outline-none focus:ring-2 focus:ring-acc/40"
              />
              <button
                onClick={handleConnect}
                disabled={busy || !tokenInput.trim()}
                className="btn-primary px-3 py-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50"
              >
                Подключить
              </button>
            </>
          )}
          {token && (
            <>
              <button onClick={handleUpload} disabled={busy} className={BTN} title="Записать текущие данные в папку «Goalie Stats Backups» (зашифрованы паролем сайта)">
                ⬆ На диск
              </button>
              <button onClick={() => handleDownload(false)} disabled={busy} className={BTN}>
                ⬇ С диска (заменить)
              </button>
              <button onClick={() => handleDownload(true)} disabled={busy} className={BTN} title="Добавить игры с диска к локальным, вратари объединяются по имени">
                🔀 Объединить
              </button>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-mut cursor-pointer select-none" title="Через 10 секунд после каждого изменения данные пишутся на Яндекс.Диск">
                <input
                  type="checkbox"
                  checked={autoDiskSync}
                  onChange={e => setAutoDiskSync(e.target.checked)}
                  className="accent-current"
                />
                Автобэкап
              </label>
              <button onClick={handleDisconnect} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-goal/30 text-goal hover:bg-goal/10 transition">
                Забыть токен
              </button>
            </>
          )}
        </div>
        {!token && (
          <div className="text-[10px] text-mut/70">Токен: yandex.ru/dev → «Полигон Яндекс.Диска» → OAuth-токен с правом cloud:disk. Хранится только в этом браузере.</div>
        )}
      </div>

      {msg && <div className="text-xs font-semibold text-acc animate-in fade-in">{msg}</div>}
    </div>
  );
}

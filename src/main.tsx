import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import LockScreen from './components/LockScreen';
import { isUnlocked, getSessionPassword } from './utils/auth';
import * as yndx from './utils/yndx';
import { decryptJSON } from './utils/crypto';
import { useStore } from './store';
import './index.css';

function Root() {
  const [unlocked, setUnlocked] = useState(isUnlocked());
  const [note, setNote] = useState('');

  // Автозагрузка из Яндекс.Диска: только если на устройстве нет локальных
  // данных и в этом браузере сохранён токен. Файл зашифрован паролем сайта.
  useEffect(() => {
    if (!unlocked) return;
    (async () => {
      try {
        if (!yndx.getToken()) return;
        const raw = localStorage.getItem('goalieZoneStatsV2');
        const parsed = raw ? JSON.parse(raw) : null;
        const games = parsed?.state?.games ?? parsed?.games ?? [];
        if (games.length > 0) return; // локальные данные есть — не трогаем
        const text = await yndx.downloadFile(`${yndx.FOLDER}/${yndx.SYNC_FILE}`);
        if (!text) return;
        const data = await decryptJSON(text, getSessionPassword() ?? '');
        if (!data || !Array.isArray(data.games) || !data.games.length) return;
        useStore.getState().importData(data);
        setNote(`☁️ Загружено с Яндекс.Диска: ${data.games.length} игр`);
      } catch { /* нет сети или неверный пароль — молча пропускаем */ }
    })();
  }, [unlocked]);

  return (
    <React.StrictMode>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        {unlocked ? <App /> : <LockScreen onUnlock={() => setUnlocked(true)} />}
        {note && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-panel2 border border-line/20 text-ink text-xs font-semibold px-4 py-2.5 shadow-lg">
            {note}
          </div>
        )}
      </BrowserRouter>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);

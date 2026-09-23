import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import LockScreen from './components/LockScreen';
import { isUnlocked } from './utils/auth';
import * as gist from './utils/gist';
import { useStore } from './store';
import './index.css';

function Root() {
  const [unlocked, setUnlocked] = useState(isUnlocked());
  const [note, setNote] = useState('');

  // Автозагрузка архива из облака: только если на устройстве нет локальных данных.
  // Чтение гиста не требует токена — работает на любом новом устройстве.
  useEffect(() => {
    if (!unlocked) return;
    (async () => {
      try {
        const raw = localStorage.getItem('goalieZoneStatsV2');
        const parsed = raw ? JSON.parse(raw) : null;
        const games = parsed?.state?.games ?? parsed?.games ?? [];
        if (games.length > 0) return; // локальные данные есть — не трогаем
        const data = await gist.readSync();
        if (!data || !data.games?.length) return;
        useStore.getState().importData(data);
        setNote(`☁️ Загружено из облака: ${data.games.length} игр`);
      } catch { /* нет сети — молча пропускаем */ }
    })();
  }, [unlocked]);

  return (
    <React.StrictMode>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        {unlocked ? <App /> : <LockScreen onUnlock={() => setUnlocked(true)} />}
        {note && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 shadow-lg">
            {note}
          </div>
        )}
      </BrowserRouter>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);

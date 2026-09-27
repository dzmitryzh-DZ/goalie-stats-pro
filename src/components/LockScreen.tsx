import React, { useState } from 'react';
import { checkPassword } from '../utils/auth';

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const ok = await checkPassword(password);
    setBusy(false);
    if (ok) {
      onUnlock();
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-panel2/70 rounded-2xl shadow-lg border border-line/20 p-8"
      >
        <div className="flex items-center gap-3 mb-1">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="2" y="7" width="20" height="13" rx="2" stroke="rgb(var(--acc))" strokeWidth="1.6" />
            <path d="M8 7V5a4 4 0 0 1 8 0v2" stroke="rgb(var(--acc))" strokeWidth="1.6" />
            <circle cx="12" cy="13.5" r="1.6" fill="rgb(var(--acc))" />
          </svg>
          <h1 className="text-xl font-bold text-ink">Goalie Stats Pro</h1>
        </div>
        <p className="text-sm text-mut mb-2">Доступ ограничен. Введите пароль.</p>
        <p className="text-xs text-mut/70 mb-6">Пароль администратора — полный доступ, пароль зрителя — только просмотр.</p>
        <label className="block text-sm font-medium text-ink mb-1" htmlFor="lock-password">
          Пароль
        </label>
        <input
          id="lock-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(false); }}
          className={`w-full rounded-lg border px-3 py-2 text-ink outline-none focus:ring-2 ${
            error
              ? 'border-goal/50 focus:ring-goal/30'
              : 'border-line/25 focus:border-acc focus:ring-acc/30'
          }`}
        />
        {error && (
          <p className="mt-2 text-sm text-red-600">Неверный пароль. Попробуйте ещё раз.</p>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-5 w-full rounded-lg bg-acc px-4 py-2.5 text-[#0a0f1c] font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Проверка…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}

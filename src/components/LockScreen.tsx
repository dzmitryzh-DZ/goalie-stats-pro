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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-200 p-8"
      >
        <div className="flex items-center gap-3 mb-1">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="2" y="7" width="20" height="13" rx="2" stroke="#0f172a" strokeWidth="1.6" />
            <path d="M8 7V5a4 4 0 0 1 8 0v2" stroke="#0f172a" strokeWidth="1.6" />
            <circle cx="12" cy="13.5" r="1.6" fill="#0f172a" />
          </svg>
          <h1 className="text-xl font-bold text-slate-900">Goalie Stats Pro</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">Доступ ограничен. Введите пароль.</p>

        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="lock-password">
          Пароль
        </label>
        <input
          id="lock-password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(false); }}
          className={`w-full rounded-lg border px-3 py-2 text-slate-900 outline-none focus:ring-2 ${
            error
              ? 'border-red-400 focus:ring-red-200'
              : 'border-slate-300 focus:border-slate-400 focus:ring-slate-200'
          }`}
        />
        {error && (
          <p className="mt-2 text-sm text-red-600">Неверный пароль. Попробуйте ещё раз.</p>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-white font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Проверка…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}

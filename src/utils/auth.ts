// Клиентская защита входа (GitHub Pages — статический хостинг,
// серверной авторизации нет; пароль проверяется по SHA-256-хэшу).

const STORAGE_KEY = 'gspro_unlocked';
const PWD_KEY = 'gspro_unlock_pwd';
// SHA-256 пароля (пароль задаётся при настройке, хранится только хэш)
const PASSWORD_HASH = '1608f0cf592931eb84b2271930584798a4f8d5488f579909486c6c4185919cb6';

export const isUnlocked = (): boolean =>
  sessionStorage.getItem(STORAGE_KEY) === '1';

// Пароль текущей сессии (вкладка) — нужен для расшифровки облачного архива.
// Живёт в sessionStorage: исчезает при закрытии вкладки.
export const getSessionPassword = (): string | null =>
  sessionStorage.getItem(PWD_KEY);

export async function checkPassword(password: string): Promise<boolean> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  if (hex === PASSWORD_HASH) {
    sessionStorage.setItem(STORAGE_KEY, '1');
    sessionStorage.setItem(PWD_KEY, password);
    return true;
  }
  return false;
}

export function lock(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(PWD_KEY);
}

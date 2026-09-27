// Клиентская защита входа (GitHub Pages — статический хостинг,
// серверной авторизации нет; пароли проверяются по SHA-256-хэшам).
//
// Две учётные записи (роли):
//   admin  — полный доступ: ввод и редактирование данных, импорт, синхронизация.
//   viewer — только просмотр: все элементы редактирования скрыты/заблокированы.
//
// Пароли задаются при настройке, хранятся только хэши.
// Чтобы сменить пароль роли — замените соответствующий хэш ниже
// (SHA-256 от нового пароля).

export type Role = 'admin' | 'viewer';

const STORAGE_KEY = 'gspro_unlocked'; // хранит роль текущей сессии
const PWD_KEY = 'gspro_unlock_pwd';

// SHA-256 пароля администратора (текущий пароль сайта)
const ADMIN_HASH = '1608f0cf592931eb84b2271930584798a4f8d5488f579909486c6c4185919cb6';
// SHA-256 пароля зрителя
const VIEWER_HASH = 'd35ca5051b82ffc326a3b0b6574a9a3161dee16b9478a199ee39cd803ce5b799';

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Роль текущей сессии (вкладки); null — вход не выполнен
export const getRole = (): Role | null => {
  const r = sessionStorage.getItem(STORAGE_KEY);
  return r === 'admin' || r === 'viewer' ? r : null;
};

export const isUnlocked = (): boolean => getRole() !== null;
export const isAdmin = (): boolean => getRole() === 'admin';

// Пароль текущей сессии (вкладка) — нужен для расшифровки облачного архива.
// Живёт в sessionStorage: исчезает при закрытии вкладки.
export const getSessionPassword = (): string | null =>
  sessionStorage.getItem(PWD_KEY);

// Проверка пароля → роль (null при неверном пароле)
export async function checkPassword(password: string): Promise<Role | null> {
  const hex = await sha256(password);
  const role: Role | null = hex === ADMIN_HASH ? 'admin' : hex === VIEWER_HASH ? 'viewer' : null;
  if (role) {
    sessionStorage.setItem(STORAGE_KEY, role);
    sessionStorage.setItem(PWD_KEY, password);
  }
  return role;
}

export function lock(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(PWD_KEY);
}

// Клиентская защита входа (GitHub Pages — статический хостинг,
// серверной авторизации нет; учётные записи проверяются по SHA-256-хэшам).
//
// Две роли:
//   admin  — полный доступ: ввод и редактирование данных, импорт, синхронизация.
//   viewer — только просмотр: все элементы редактирования скрыты/заблокированы.
//
// Учётные записи (3 администратора + 3 зрителя) — в таблице ACCOUNTS ниже,
// хранятся только хэши вида SHA-256("login:password").
// Чтобы добавить/изменить учётную запись — посчитайте хэш от "логин:пароль"
// и обновите строку в ACCOUNTS.

export type Role = 'admin' | 'viewer';

interface Account {
  login: string;
  role: Role;
  hash: string; // SHA-256 от "login:password"
}

// ── Учётные записи ──────────────────────────────────────────
// Администраторы: dmitry, coach, manager
// Зрители:        scout, analyst, guest
const ACCOUNTS: Account[] = [
  { login: 'dmitry', role: 'admin', hash: 'd4f8216012909dc2c73985c1cf3410a2245cc687c7501a3a71608f52b188f22c' },
  { login: 'coach', role: 'admin', hash: 'dc0bdebd5df9743b761f3c084bd541c205cfdc5675552d63545ab4c16dbee277' },
  { login: 'manager', role: 'admin', hash: '88df4031c6e86eca1f1df864ca9e3dec2e2eea07ae35fe6e31dabbaf7cbbed77' },
  { login: 'scout', role: 'viewer', hash: '5db6f6ca24251b668f6ca6457fb42ab62e8b6269a1c42618baccfb600e455de0' },
  { login: 'analyst', role: 'viewer', hash: '464373191b6e60eca0134b2a971a0ef7a1170d4bb7ed3838f87baa04aa02819b' },
  { login: 'guest', role: 'viewer', hash: '36599759decf32bd8a1bf4f039bd3aa732e3c63d0e80f0cf9752aa009999e7b1' },
];

const STORAGE_KEY = 'gspro_unlocked'; // роль текущей сессии
const LOGIN_KEY = 'gspro_user';       // логин текущей сессии

// Общий ключ шифрования облачного архива: одинаков для всех учётных записей,
// чтобы любой администратор мог читать бэкап, записанный другим.
// (Хранится в коде — уровень защиты тот же, что у хэшей паролей выше.)
const CLOUD_SYNC_KEY = 'gspro-cloud-sync:v2:shared-key';

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

// Логин текущей сессии (для отображения в шапке)
export const getLogin = (): string | null => sessionStorage.getItem(LOGIN_KEY);

export const isUnlocked = (): boolean => getRole() !== null;
export const isAdmin = (): boolean => getRole() === 'admin';

// Ключ шифрования облачного архива — доступен любой вошедшей учётной записи.
export const getSessionPassword = (): string | null =>
  getRole() ? CLOUD_SYNC_KEY : null;

// Проверка логина и пароля → роль (null, если пара не найдена)
export async function checkCredentials(login: string, password: string): Promise<Role | null> {
  const hex = await sha256(`${login.trim().toLowerCase()}:${password}`);
  const acc = ACCOUNTS.find(a => a.hash === hex);
  if (acc) {
    sessionStorage.setItem(STORAGE_KEY, acc.role);
    sessionStorage.setItem(LOGIN_KEY, acc.login);
    return acc.role;
  }
  return null;
}

export function lock(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(LOGIN_KEY);
}

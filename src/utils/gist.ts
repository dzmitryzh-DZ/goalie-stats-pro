// Синхронизация через GitHub Gist.
// Чтение — по секретному raw-URL без токена (CORS открыт, работает на любом устройстве).
// Запись — через GitHub API, нужен токен с правом gist (хранится в браузере устройства).

const GIST_ID = '49af630a9a5d762017b7c67c7b197a6b';
const FILE = 'goalie-stats-sync.json';
const TOKEN_KEY = 'gspro_gh_token';

// Канонический raw-URL (без хэша коммита) — gist ID не подбирается, а секретный
// гист доступен только по ссылке. Учитывайте: кто знает ID — может читать файл.
export const RAW_URL =
  `https://gist.githubusercontent.com/dzmitryzh-DZ/${GIST_ID}/raw/${FILE}`;

// ── Токен (только для записи) ─────────────────────────────

export const getGhToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export function setGhToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token.trim());
  else localStorage.removeItem(TOKEN_KEY);
}

export async function checkGhToken(): Promise<string> {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${getGhToken()}` },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Токен недействителен — проверьте право gist');
    throw new Error(`GitHub: HTTP ${res.status}`);
  }
  const info = await res.json();
  return info?.login || 'ок';
}

// ── Чтение (без токена) ───────────────────────────────────

// Возвращает объект данных или null; throws при сетевых ошибках
export async function readSync(): Promise<any | null> {
  const res = await fetch(RAW_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Чтение гиста: HTTP ${res.status}`);
  const text = await res.text();
  if (!text || !text.trim()) return null;
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.games)) throw new Error('Файл синхронизации повреждён');
  return data;
}

// ── Запись (нужен токен с gist) ───────────────────────────

export async function writeSync(data: unknown): Promise<void> {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${getGhToken()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: { [FILE]: { content: JSON.stringify(data, null, 2) } },
    }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Токен недействителен или нет права gist');
    if (res.status === 403) throw new Error('Лимит запросов GitHub — попробуйте позже');
    throw new Error(`Запись в гист: HTTP ${res.status}`);
  }
}

// Клиентская синхронизация с Яндекс.Диском через REST API.
// Работает прямо из браузера (GitHub Pages, любое устройство) —
// сервер не нужен. Токен OAuth хранится в localStorage устройства.

const API = 'https://cloud-api.yandex.net/v1/disk';
const TOKEN_KEY = 'gspro_yndx_token';

// Папка на Диске (в корне). Совпадает с папкой локального dev-бэкапа.
export const FOLDER = '/Goalie Stats Backups';
// Основной файл синхронизации (последнее состояние)
export const SYNC_FILE = 'sync-data.json';

// ── Токен ─────────────────────────────────────────────────

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token.trim());
  else localStorage.removeItem(TOKEN_KEY);
}

// ── Базовый запрос ────────────────────────────────────────

async function api(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  if (!token) throw new Error('Не задан токен Яндекс.Диска');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `OAuth ${token}`, ...(init?.headers || {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      if (err?.message) msg = err.message;
      else if (err?.error) msg = `${err.error}: ${err?.description || ''}`;
    } catch { /* не JSON */ }
    if (res.status === 401) throw new Error('Токен недействителен — получите новый на Полигоне Яндекса');
    throw new Error(msg);
  }
  return res;
}

// Проверка токена → логин пользователя
export async function checkToken(): Promise<string> {
  const res = await api('/');
  const info = await res.json();
  return info?.user?.login || 'ок';
}

// ── Файлы ─────────────────────────────────────────────────

async function ensureFolder(): Promise<void> {
  const res = await fetch(
    `${API}/resources?path=${encodeURIComponent(FOLDER)}`,
    { method: 'PUT', headers: { Authorization: `OAuth ${getToken()}` } }
  );
  if (!res.ok && res.status !== 409) { // 409 = уже существует
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json())?.message || msg; } catch { /* */ }
    throw new Error(msg);
  }
}

// Загрузка содержимого на Диск
export async function uploadFile(diskPath: string, content: string): Promise<void> {
  await ensureFolder();
  const res = await api(`/resources/upload?path=${encodeURIComponent(diskPath)}&overwrite=true`);
  const { href } = await res.json();
  const put = await fetch(href, { method: 'PUT', body: content });
  if (!put.ok) throw new Error(`Ошибка загрузки файла: HTTP ${put.status}`);
}

// Скачивание содержимого; null если файла нет
export async function downloadFile(diskPath: string): Promise<string | null> {
  const res = await api(`/resources/download?path=${encodeURIComponent(diskPath)}`);
  const { href } = await res.json();
  const get = await fetch(href);
  if (!get.ok) throw new Error(`Ошибка скачивания: HTTP ${get.status}`);
  return get.text();
}

export async function deleteFile(diskPath: string): Promise<void> {
  await api(`/resources?path=${encodeURIComponent(diskPath)}`, { method: 'DELETE' });
}

export interface CloudFile {
  name: string;
  path: string;
  size: number;
  modified: string;
}

// Список *.json в папке бэкапов
export async function listCloudFiles(): Promise<CloudFile[]> {
  const res = await api(`/resources?path=${encodeURIComponent(FOLDER)}&limit=200`);
  const data = await res.json();
  const items = data?._embedded?.items || [];
  return items
    .filter((i: any) => i.type === 'file' && i.name.endsWith('.json'))
    .map((i: any) => ({ name: i.name, path: i.path, size: i.size, modified: i.modified }))
    .sort((a: CloudFile, b: CloudFile) => b.modified.localeCompare(a.modified));
}

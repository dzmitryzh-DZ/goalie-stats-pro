// Клиент к dev-серверному API /api/disk-backup (см. vite.config.ts).
// Файлы пишутся в ~/Yandex.Disk.localized/Goalie Stats Backups/ —
// Яндекс.Диск синхронизирует эту папку в облако.

import type { AppState } from '../types';

export interface DiskBackupInfo {
  name: string;
  size: number;
  mtime: number;
}

export interface DiskStatus {
  available: boolean;
  dir?: string;
}

let cachedStatus: DiskStatus | null = null;

// Доступно ли дисковое API (в prod-сборке без dev-сервера — нет)
export async function checkDiskApi(): Promise<DiskStatus> {
  if (cachedStatus) return cachedStatus;
  try {
    const r = await fetch('/api/disk-backup/list', { method: 'GET' });
    if (!r.ok) throw new Error();
    const j = await r.json();
    cachedStatus = { available: !!j.ok, dir: j.dir };
  } catch {
    cachedStatus = { available: false };
  }
  return cachedStatus!;
}

// Сохранить состояние в бэкап на Яндекс.Диске. name — префикс файла.
export async function saveToDisk(data: AppState, name?: string): Promise<DiskBackupInfo | null> {
  const r = await fetch('/api/disk-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, data }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'save failed');
  return { name: j.file, size: 0, mtime: Date.now() };
}

export async function listDiskBackups(): Promise<DiskBackupInfo[]> {
  const r = await fetch('/api/disk-backup/list');
  const j = await r.json();
  return j.ok ? j.files : [];
}

export async function loadDiskBackup(fileName: string): Promise<AppState> {
  const r = await fetch(`/api/disk-backup?file=${encodeURIComponent(fileName)}`);
  if (!r.ok) throw new Error('not found');
  const text = await r.text();
  const parsed = JSON.parse(text);
  const data = parsed.state && parsed.state.games ? parsed.state : parsed;
  if (!data || !Array.isArray(data.games)) throw new Error('invalid file format');
  return data as AppState;
}

export async function deleteDiskBackup(fileName: string): Promise<void> {
  await fetch(`/api/disk-backup?file=${encodeURIComponent(fileName)}`, { method: 'DELETE' });
}

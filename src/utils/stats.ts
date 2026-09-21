import type { Event } from '../types';
import { ZONES } from '../types';

export interface ZoneStats { s: number; g: number; }
export type StatsMap = Record<number, ZoneStats>;

export function aggEvents(events: Event[]): StatsMap {
  const m: StatsMap = {};
  for (const e of events) {
    if (!m[e.z]) m[e.z] = { s: 0, g: 0 };
    m[e.z].s++;
    if (e.t === 'goal') m[e.z].g++;
  }
  return m;
}

export function totals(m: StatsMap) {
  let s = 0, g = 0;
  for (const k in m) { s += m[k].s; g += m[k].g; }
  return { s, g };
}

export function selTotals(m: StatsMap) {
  let s = 0, g = 0;
  for (const k in m) {
    const z = ZONES.find(z => z.id === +k);
    if (z?.tier === 'sel') { s += m[k].s; g += m[k].g; }
  }
  return { s, g };
}

export function pct(a: number, b: number) {
  return b > 0 ? (100 * a / b).toFixed(1) + '%' : '—';
}

export function svClass(saves: number, shots: number) {
  if (!shots) return '';
  const p = 100 * saves / shots;
  return p >= 92 ? 'text-emerald-600 font-bold' : p >= 88 ? 'text-amber-600 font-bold' : 'text-red-600 font-bold';
}

export function gaa(goals: number, toi: number, games: number) {
  if (toi > 0) return (goals * 60 / toi).toFixed(2);
  return games > 0 ? (goals / games).toFixed(2) : '0.00';
}

export function fmtDate(s: string) {
  if (!s) return '—';
  const p = s.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : s;
}

export function normalizeTime(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!m) return null;
  const mm = +m[1], ss = +m[2];
  if (mm > 20 || ss > 59) return null;
  return `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

export function zoneName(id: number) {
  return ZONES.find(z => z.id === id)?.name || `Zone ${id}`;
}

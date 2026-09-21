import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { ZONES, PERIODS, STRENGTHS, TARGETS, PLAYS, STR_GRP_COLORS, STR_GRP_NAMES } from '../types';
import type { Game, Event } from '../types';
import { aggEvents, totals, selTotals, pct, svClass, gaa, fmtDate, zoneName } from '../utils/stats';
import { useNavigate } from 'react-router-dom';

// Aggregate events across multiple games
function aggGames(games: Game[]): Record<number, { s: number; g: number }> {
  const m: Record<number, { s: number; g: number }> = {};
  for (const g of games) {
    const a = aggEvents(g.events);
    for (const k in a) {
      if (!m[+k]) m[+k] = { s: 0, g: 0 };
      m[+k].s += a[+k].s;
      m[+k].g += a[+k].g;
    }
  }
  return m;
}

// Record line (W-L by decision type)
function recordLine(games: Game[]) {
  let w = 0, l = 0;
  const by: Record<string, { w: number; l: number }> = {};
  games.forEach(g => {
    if (!g.result) return;
    const gf = +g.result.gf || 0, ga = +g.result.ga || 0;
    if (gf === ga) return;
    const dec = g.result.dec || 'REG';
    if (!by[dec]) by[dec] = { w: 0, l: 0 };
    if (gf > ga) { w++; by[dec].w++; } else { l++; by[dec].l++; }
  });
  const parts: string[] = [];
  ['REG', 'OT', 'SO'].forEach(d => { if (by[d]) parts.push(`${d} ${by[d].w}-${by[d].l}`); });
  if (!w && !l) return '· no results entered';
  return `· Record: ${w}-${l}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

function resBadge(g: Game) {
  if (!g.result || (g.result.gf == null && g.result.ga == null)) return '—';
  const gf = +g.result.gf || 0, ga = +g.result.ga || 0;
  const cls = gf > ga ? 'bg-emerald-100 text-emerald-800' : gf < ga ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700';
  const lab = gf > ga ? 'W' : gf < ga ? 'L' : 'T';
  return `<span class="${cls} px-2 py-0.5 rounded-full text-xs font-bold">${lab}</span> ${gf}:${ga}${g.result.dec ? ` (${g.result.dec})` : ''}`;
}

export default function PeriodPage() {
  const games = useStore(s => s.games);
  const goalies = useStore(s => s.goalies);
  const setActiveGame = useStore(s => s.setActiveGame);
  const navigate = useNavigate();

  // Date range state
  const sortedGames = useMemo(() => [...games].sort((a, b) => a.date < b.date ? -1 : 1), [games]);
  const [dateFrom, setDateFrom] = useState(sortedGames[0]?.date || '');
  const [dateTo, setDateTo] = useState(sortedGames[sortedGames.length - 1]?.date || '');
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Filter games by date range
  const rangeGames = useMemo(() => {
    return sortedGames.filter(g => (!dateFrom || g.date >= dateFrom) && (!dateTo || g.date <= dateTo));
  }, [sortedGames, dateFrom, dateTo]);

  // Initialize checked state for new games in range
  rangeGames.forEach(g => {
    if (!(g.id in checked)) checked[g.id] = true;
  });

  const selectedGames = rangeGames.filter(g => checked[g.id]);
  const m = aggGames(selectedGames);
  const tt = totals(m);
  const st = selTotals(m);

  // All events and goal events from selected games
  const allEvents = selectedGames.flatMap(g => g.events);
  const goalEvents = allEvents.filter(e => e.t === 'goal');

  // Goalie summary
  const goalieStats = useMemo(() => {
    const per: Record<string, { games: Set<string>; s: number; g: number }> = {};
    selectedGames.forEach(g => {
      g.events.forEach(e => {
        if (!per[e.g]) per[e.g] = { games: new Set(), s: 0, g: 0 };
        per[e.g].games.add(g.id);
        per[e.g].s++;
        if (e.t === 'goal') per[e.g].g++;
      });
    });
    return goalies.map(p => {
      const r = per[p.id];
      const s = r ? r.s : 0, gg = r ? r.g : 0, ng = r ? r.games.size : 0;
      let toi = 0;
      selectedGames.forEach(g => { toi += (g.toi && +g.toi[p.id]) || 0; });
      return { ...p, s, g: gg, ng, toi, gaa: gaa(gg, toi, ng) };
    });
  }, [selectedGames, goalies]);

  // Period breakdown
  const periodStats = useMemo(() => {
    const pm: Record<string, { s: number; g: number }> = {};
    allEvents.forEach(e => {
      const p = e.p || '—';
      if (!pm[p]) pm[p] = { s: 0, g: 0 };
      pm[p].s++;
      if (e.t === 'goal') pm[p].g++;
    });
    return PERIODS.concat(['—']).map(p => ({ period: p, ...(pm[p] || { s: 0, g: 0 }) })).filter(x => x.s > 0);
  }, [allEvents]);

  // Strength breakdown
  const strBreakdown = useMemo(() => {
    const byStr: Record<string, number> = {};
    const byGrp: Record<string, number> = {};
    goalEvents.forEach(e => {
      const s = e.str || '—';
      byStr[s] = (byStr[s] || 0) + 1;
      let grp = 'none';
      const found = STRENGTHS.find(st => st.id === s);
      if (found) grp = found.grp;
      byGrp[grp] = (byGrp[grp] || 0) + 1;
    });
    return { byStr, byGrp };
  }, [goalEvents]);

  // Target breakdown
  const tgtBreakdown = useMemo(() => {
    const c: Record<string, number> = {};
    goalEvents.forEach(e => { const v = e.tgt || '—'; c[v] = (c[v] || 0) + 1; });
    return TARGETS.map(t => ({ name: t, count: c[t] || 0 })).filter(x => x.count > 0)
      .concat(Object.entries(c).filter(([k]) => !TARGETS.includes(k)).map(([k, v]) => ({ name: k, count: v })));
  }, [goalEvents]);

  // Play breakdown
  const playBreakdown = useMemo(() => {
    const c: Record<string, number> = {};
    goalEvents.forEach(e => {
      const vals = Array.isArray(e.play) ? e.play : (e.play ? [e.play] : []);
      if (!vals.length) return;
      vals.forEach(v => { c[v] = (c[v] || 0) + 1; });
    });
    return PLAYS.map(p => ({ name: p, count: c[p] || 0 })).filter(x => x.count > 0)
      .concat(Object.entries(c).filter(([k]) => !PLAYS.includes(k)).map(([k, v]) => ({ name: k, count: v })));
  }, [goalEvents]);

  // Highlights
  const maxZone = useMemo(() => {
    let maxZ: number | null = null, maxS = -1;
    ZONES.filter(z => z.tier === 'sel').forEach(z => {
      const s = (m[z.id] || { s: 0 }).s;
      if (s > maxS) { maxS = s; maxZ = z.id; }
    });
    return { id: maxZ, shots: maxS };
  }, [m]);

  const goalZones = useMemo(() => {
    return ZONES.filter(z => z.tier === 'sel' && (m[z.id]?.g || 0) > 0)
      .map(z => `Z${z.id} (${m[z.id].g})`);
  }, [m]);

  const handleOpenGame = (id: string) => {
    setActiveGame(id);
    navigate('/');
  };

  const toggleCheck = (id: string) => {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAll = () => {
    const nc: Record<string, boolean> = {};
    rangeGames.forEach(g => { nc[g.id] = true; });
    setChecked(nc);
  };

  const selectNone = () => {
    const nc: Record<string, boolean> = {};
    rangeGames.forEach(g => { nc[g.id] = false; });
    setChecked(nc);
  };

  // CSV export
  const exportCsv = () => {
    const rows = [['zone', 'name', 'scope', 'shots', 'goals', 'saves', 'sv_pct', 'conv_pct']];
    ZONES.forEach(z => {
      const c = m[z.id] || { s: 0, g: 0 };
      rows.push([String(z.id), z.name, z.tier === 'sel' ? 'danger' : 'total_only', String(c.s), String(c.g), String(c.s - c.g),
        c.s ? (100 * (c.s - c.g) / c.s).toFixed(1) : '', c.s ? (100 * c.g / c.s).toFixed(1) : '']);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'goalie-period-stats.csv';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  };

  const maxBarS = Math.max(1, ...ZONES.map(z => (m[z.id] || { s: 0 }).s));

  return (
    <div className="space-y-4">
      {/* Date Range & Game Selection */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="text-sm font-semibold text-mut">From:</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white" />
          <label className="text-sm font-semibold text-mut">To:</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white" />
          <button onClick={selectAll} className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold hover:bg-slate-50">All</button>
          <button onClick={selectNone} className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold hover:bg-slate-50">None</button>
          <span className="flex-1" />
          <button onClick={exportCsv} className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold border transition">📊 Export CSV</button>
        </div>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
          {rangeGames.map(g => (
            <label key={g.id} className="flex items-center gap-2 px-3 py-1.5 border border-line rounded-lg bg-white cursor-pointer text-sm hover:bg-slate-50 transition">
              <input type="checkbox" checked={!!checked[g.id]} onChange={() => toggleCheck(g.id)} />
              <span>{fmtDate(g.date)}{g.opponent ? ` · ${g.opponent}` : ''}</span>
              <span className="text-xs text-mut">({g.events.length})</span>
            </label>
          ))}
          {!rangeGames.length && <span className="text-sm text-mut p-2">No games in range.</span>}
        </div>
      </div>

      {/* Aggregated Zone Stats */}
      <div className="card p-4">
        <h3 className="font-bold text-lg mb-3">📊 Sum over {selectedGames.length} game(s)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-mut border-b border-line">
                <th className="py-2 pr-4">Zone</th>
                <th className="py-2 px-2 text-right">Shots</th>
                <th className="py-2 px-2 text-right">Goals</th>
                <th className="py-2 px-2 text-right">Saves</th>
                <th className="py-2 px-2 text-right">SV%</th>
                <th className="py-2 px-2 text-right">Conv%</th>
              </tr>
            </thead>
            <tbody>
              {ZONES.map(z => {
                const c = m[z.id] || { s: 0, g: 0 };
                const isTot = z.tier === 'tot';
                const isMax = z.tier === 'sel' && z.id === maxZone.id && maxZone.shots > 0;
                return (
                  <tr key={z.id} className={`border-b border-line/50 ${isTot ? 'text-mut bg-slate-50/50' : ''} ${isMax ? 'bg-yellow-50' : ''}`}>
                    <td className="py-2 pr-4 font-medium">{z.id}. {z.name}{isTot && <span className="ml-2 text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">total only</span>}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{c.s}<span className="inline-block w-16 h-1.5 bg-slate-100 rounded ml-2 align-middle overflow-hidden"><span className="block h-full bg-save rounded" style={{ width: `${100 * c.s / maxBarS}%` }} /></span></td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold text-goal">{c.g || '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{c.s - c.g}</td>
                    <td className={`py-2 px-2 text-right tabular-nums ${svClass(c.s - c.g, c.s)}`}>{pct(c.s - c.g, c.s)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{pct(c.g, c.s)}</td>
                  </tr>
                );
              })}
              <tr className="font-bold bg-slate-50 border-t-2 border-line">
                <td className="py-2 pr-4">TOTAL</td>
                <td className="py-2 px-2 text-right tabular-nums">{tt.s}</td>
                <td className="py-2 px-2 text-right tabular-nums text-goal">{tt.g || '—'}</td>
                <td className="py-2 px-2 text-right tabular-nums">{tt.s - tt.g}</td>
                <td className={`py-2 px-2 text-right tabular-nums ${svClass(tt.s - tt.g, tt.s)}`}>{pct(tt.s - tt.g, tt.s)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{pct(tt.g, tt.s)}</td>
              </tr>
              <tr className="text-mut bg-slate-50/50">
                <td className="py-2 pr-4">Danger zones only</td>
                <td className="py-2 px-2 text-right tabular-nums">{st.s}</td>
                <td className="py-2 px-2 text-right tabular-nums">{st.g}</td>
                <td className="py-2 px-2 text-right tabular-nums">{st.s - st.g}</td>
                <td className="py-2 px-2 text-right tabular-nums">{pct(st.s - st.g, st.s)}</td>
                <td className="py-2 px-2 text-right tabular-nums">{pct(st.g, st.s)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Bars visualization */}
      <div className="card p-4">
        <h3 className="font-bold text-lg mb-3">Shots & Goals by Zone</h3>
        <div className="flex gap-4 text-xs text-mut mb-2">
          <span><span className="inline-block w-3 h-3 rounded bg-save opacity-60 align-middle mr-1"></span>Shots</span>
          <span><span className="inline-block w-3 h-3 rounded bg-goal align-middle mr-1"></span>Goals</span>
        </div>
        <div className="space-y-1.5">
          {ZONES.map(z => {
            const c = m[z.id] || { s: 0, g: 0 };
            return (
              <div key={z.id} className="grid grid-cols-[180px_1fr_80px] gap-2 items-center text-sm">
                <span className="truncate">{z.id}. {z.name}{z.tier === 'tot' && <span className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded ml-1">total</span>}</span>
                <div className="h-4 bg-slate-100 rounded relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-save opacity-55 rounded" style={{ width: `${100 * c.s / maxBarS}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-goal rounded" style={{ width: `${100 * c.g / maxBarS}%` }} />
                </div>
                <span className="text-right text-xs text-mut tabular-nums">{c.s} / {c.g}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Highlights */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-3 border-l-4 border-l-acc">
          <div className="text-[11px] uppercase tracking-wide text-mut">Most shots (danger)</div>
          <div className="text-sm font-bold mt-1">{maxZone.shots > 0 ? `Z${maxZone.id} · ${zoneName(maxZone.id!)} — ${maxZone.shots}` : 'no data'}</div>
        </div>
        <div className="card p-3 border-l-4 border-l-goal">
          <div className="text-[11px] uppercase tracking-wide text-mut">Goals conceded from</div>
          <div className="text-sm font-bold mt-1">{goalZones.length ? goalZones.join(', ') : 'no goals'}</div>
        </div>
        <div className="card p-3 border-l-4 border-l-acc">
          <div className="text-[11px] uppercase tracking-wide text-mut">Outside danger zones</div>
          <div className="text-sm font-bold mt-1">{tt.s - st.s} shot(s) — total only</div>
          <div className="text-[11px] text-mut mt-1">{tt.s} shots over {selectedGames.length} game(s)</div>
        </div>
        <div className="card p-3 border-l-4 border-l-acc">
          <div className="text-[11px] uppercase tracking-wide text-mut">Record</div>
          <div className="text-sm font-bold mt-1">{recordLine(selectedGames)}</div>
        </div>
      </div>

      {/* Per-game table */}
      <div className="card p-4">
        <h3 className="font-bold text-lg mb-3">📅 Per-game stats <span className="text-sm font-normal text-mut">{recordLine(selectedGames)}</span></h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-mut border-b border-line">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Opponent</th>
                <th className="py-2 pr-3">Result</th>
                <th className="py-2 px-2 text-right">Shots</th>
                <th className="py-2 px-2 text-right">GA</th>
                <th className="py-2 px-2 text-right">SV%</th>
                <th className="py-2 px-2 text-left">Top zone</th>
                <th className="py-2 px-2 text-right">GAA</th>
                <th className="py-2 pl-3"></th>
              </tr>
            </thead>
            <tbody>
              {selectedGames.map(g => {
                const gm = aggEvents(g.events);
                const t = totals(gm);
                let toiG = 0;
                Object.values(g.toi || {}).forEach(v => { toiG += (+v || 0); });
                // Top danger zone by shots
                let topZ: number | null = null, topS = -1;
                ZONES.filter(z => z.tier === 'sel').forEach(z => {
                  const s = (gm[z.id] || { s: 0 }).s;
                  if (s > topS) { topS = s; topZ = z.id; }
                });
                const r = g.result;
                const badge = r ? (() => {
                  const gf = +r.gf || 0, ga = +r.ga || 0;
                  const cls = gf > ga ? 'bg-emerald-100 text-emerald-800' : gf < ga ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700';
                  const lab = gf > ga ? 'W' : gf < ga ? 'L' : 'T';
                  return <span className={`${cls} px-2 py-0.5 rounded-full text-xs font-bold`}>{lab} {gf}:{ga}{r.dec ? ` (${r.dec})` : ''}</span>;
                })() : '—';
                return (
                  <tr key={g.id} className="border-b border-line/50 hover:bg-slate-50">
                    <td className="py-2 pr-3">{fmtDate(g.date)}</td>
                    <td className="py-2 pr-3">{g.opponent || '—'}</td>
                    <td className="py-2 pr-3">{badge}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{t.s}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold text-goal">{t.g || '—'}</td>
                    <td className={`py-2 px-2 text-right tabular-nums ${svClass(t.s - t.g, t.s)}`}>{pct(t.s - t.g, t.s)}</td>
                    <td className="py-2 px-2 text-left text-xs">{topS > 0 ? `Z${topZ} · ${zoneName(topZ!)} (${topS})` : '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{gaa(t.g, toiG, 1)}</td>
                    <td className="py-2 pl-3"><button onClick={() => handleOpenGame(g.id)} className="text-xs px-2 py-1 rounded border border-line hover:bg-slate-100">open</button></td>
                  </tr>
                );
              })}
              {!selectedGames.length && <tr><td colSpan={9} className="py-4 text-center text-mut text-sm">Select games above.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Goalie Summary */}
      <div className="card p-4">
        <h3 className="font-bold text-lg mb-3">🥅 By goalie (selected games)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-mut border-b border-line">
                <th className="py-2 pr-3">Goalie</th>
                <th className="py-2 px-2 text-right">Games</th>
                <th className="py-2 px-2 text-right">Shots</th>
                <th className="py-2 px-2 text-right">GA</th>
                <th className="py-2 px-2 text-right">SV%</th>
                <th className="py-2 px-2 text-right">Minutes</th>
                <th className="py-2 px-2 text-right">GAA</th>
              </tr>
            </thead>
            <tbody>
              {goalieStats.map(p => (
                <tr key={p.id} className="border-b border-line/50">
                  <td className="py-2 pr-3 font-medium flex items-center gap-2">{p.photo && <img src={p.photo} alt="" className="w-6 h-6 rounded-full object-cover bg-gray-200" />}{p.name}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.ng}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.s}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold text-goal">{p.g || '—'}</td>
                  <td className={`py-2 px-2 text-right tabular-nums ${svClass(p.s - p.g, p.s)}`}>{pct(p.s - p.g, p.s)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.toi || '—'}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.gaa}</td>
                </tr>
              ))}
              {!selectedGames.length && <tr><td colSpan={7} className="py-4 text-center text-mut text-sm">Select games above.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Breakdowns */}
      <div className="card p-4">
        <h3 className="font-bold text-lg mb-3">🧾 Goals-against breakdown</h3>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Strength */}
          <div>
            <div className="text-xs uppercase tracking-wide text-mut mb-2">Strength (even / uneven)</div>
            <table className="w-full text-sm">
              <tbody>
                {['even', 'pk', 'pp', 'ea', 'ps'].map(grp => {
                  const cnt = strBreakdown.byGrp[grp];
                  if (!cnt) return null;
                  const grpNames = STR_GRP_NAMES;
                  const grpColors = STR_GRP_COLORS;
                  return (
                    <React.Fragment key={grp}>
                      <tr className="font-bold bg-slate-50">
                        <td className="py-1"><span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: grpColors[grp] }}></span>{grpNames[grp]}</td>
                        <td className="py-1 text-right tabular-nums">{cnt}</td>
                      </tr>
                      {STRENGTHS.filter(s => s.grp === grp && strBreakdown.byStr[s.id]).map(s => (
                        <tr key={s.id}><td className="py-0.5 pl-6 text-mut">{s.id}</td><td className="py-0.5 text-right tabular-nums">{strBreakdown.byStr[s.id]}</td></tr>
                      ))}
                    </React.Fragment>
                  );
                })}
                {!goalEvents.length && <tr><td colSpan={2} className="py-2 text-mut text-xs">no goals conceded</td></tr>}
              </tbody>
            </table>
          </div>
          {/* Target */}
          <div>
            <div className="text-xs uppercase tracking-wide text-mut mb-2">Where the goal went in</div>
            <table className="w-full text-sm">
              <tbody>
                {tgtBreakdown.map(t => (
                  <tr key={t.name}><td className="py-0.5">{t.name}</td><td className="py-0.5 text-right tabular-nums">{t.count}<span className="inline-block w-12 h-1.5 bg-red-100 rounded ml-2 align-middle overflow-hidden"><span className="block h-full bg-goal rounded" style={{ width: `${100 * t.count / Math.max(1, ...tgtBreakdown.map(x => x.count))}%` }} /></span></td></tr>
                ))}
                {!goalEvents.length && <tr><td colSpan={2} className="py-2 text-mut text-xs">no goals conceded</td></tr>}
              </tbody>
            </table>
          </div>
          {/* Play */}
          <div>
            <div className="text-xs uppercase tracking-wide text-mut mb-2">How it was scored (play)</div>
            <table className="w-full text-sm">
              <tbody>
                {playBreakdown.map(p => (
                  <tr key={p.name}><td className="py-0.5">{p.name}</td><td className="py-0.5 text-right tabular-nums">{p.count}<span className="inline-block w-12 h-1.5 bg-red-100 rounded ml-2 align-middle overflow-hidden"><span className="block h-full bg-goal rounded" style={{ width: `${100 * p.count / Math.max(1, ...playBreakdown.map(x => x.count))}%` }} /></span></td></tr>
                ))}
                {!goalEvents.length && <tr><td colSpan={2} className="py-2 text-mut text-xs">no goals conceded</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* By Period */}
      <div className="card p-4">
        <h3 className="font-bold text-lg mb-3">⏱ By period (selected games)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-mut border-b border-line">
              <th className="py-2 pr-4">Period</th>
              <th className="py-2 px-2 text-right">Shots</th>
              <th className="py-2 px-2 text-right">Goals</th>
              <th className="py-2 px-2 text-right">Saves</th>
              <th className="py-2 px-2 text-right">SV%</th>
            </tr>
          </thead>
          <tbody>
            {periodStats.map(p => (
              <tr key={p.period} className="border-b border-line/50">
                <td className="py-2 pr-4 font-medium">{p.period === '—' ? 'not set' : p.period}</td>
                <td className="py-2 px-2 text-right tabular-nums">{p.s}</td>
                <td className="py-2 px-2 text-right tabular-nums font-bold text-goal">{p.g || '—'}</td>
                <td className="py-2 px-2 text-right tabular-nums">{p.s - p.g}</td>
                <td className={`py-2 px-2 text-right tabular-nums ${svClass(p.s - p.g, p.s)}`}>{pct(p.s - p.g, p.s)}</td>
              </tr>
            ))}
            {!allEvents.length && <tr><td colSpan={5} className="py-4 text-center text-mut text-sm">no events</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

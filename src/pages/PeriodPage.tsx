import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { ZONES, PERIODS, STRENGTHS, TARGETS, PLAYS, STR_GRP_COLORS, STR_GRP_NAMES } from '../types';
import type { Game } from '../types';
import { aggEvents, totals, selTotals, pct, svClass, gaa, fmtDate, zoneName } from '../utils/stats';
import { useNavigate } from 'react-router-dom';

// Единый с дашбордом язык: коралл — акцент и худшая зона, тепло и каскады
const ACCENT = 'rgb(255,130,100)';
const INK = '#16181d';
const svColor = (sv: number) => (sv >= 92 ? '#059669' : sv >= 88 ? '#d97706' : '#dc2626');
const MICRO = 'text-[10px] uppercase tracking-[0.14em] text-mut font-semibold';

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

// Record W-L (decision types as sub-line)
function recordParts(games: Game[]) {
  let w = 0, l = 0, t = 0;
  const by: Record<string, { w: number; l: number }> = {};
  games.forEach(g => {
    if (!g.result) return;
    const gf = +g.result.gf || 0, ga = +g.result.ga || 0;
    if (gf === ga) { t++; return; }
    const dec = g.result.dec || 'REG';
    if (!by[dec]) by[dec] = { w: 0, l: 0 };
    if (gf > ga) { w++; by[dec].w++; } else { l++; by[dec].l++; }
  });
  const parts: string[] = [];
  ['REG', 'OT', 'SO'].forEach(d => { if (by[d]) parts.push(`${d} ${by[d].w}-${by[d].l}`); });
  return { w, l, t, hasResults: !!(w || l || t), parts };
}

const badgeStyle = (gf: number, ga: number): [string, string] =>
  gf > ga ? ['W', '#059669'] : gf < ga ? ['L', '#dc2626'] : ['T', '#9ca3af'];

// ── SVG sparkline по всем выбранным играм (1 точка — просто круг) ──
function SeasonSpark({ pts }: { pts: { date: string; sv: number; shots: number; goals: number; opp: string }[] }) {
  const W = 640, H = 56, PAD = 8;
  if (!pts.length) return <div className="h-14" />;
  const lo = Math.min(...pts.map(p => p.sv), 80) - 1.5;
  const hi = Math.max(...pts.map(p => p.sv), 95) + 1.5;
  const x = (i: number) => PAD + i * (W - 2 * PAD) / Math.max(1, pts.length - 1);
  const y = (v: number) => H - PAD - (v - lo) / (hi - lo) * (H - 2 * PAD);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.sv).toFixed(1)}`).join(' ');
  const avg = pts.reduce((a, p) => a + p.sv, 0) / pts.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none" aria-hidden="true">
      {pts.length > 1 && (
        <>
          <path d={`${d} L${x(pts.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`} fill={INK} opacity="0.05" />
          <line x1={PAD} x2={W - PAD} y1={y(avg)} y2={y(avg)} stroke={INK} strokeWidth="0.6" strokeDasharray="3 3" opacity="0.3" />
          <path d={d} fill="none" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        </>
      )}
      {pts.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.sv)} r={pts.length === 1 ? 4 : 3} fill={svColor(p.sv)} stroke="#fff" strokeWidth="1">
          <title>{`${fmtDate(p.date)}${p.opp ? ' vs ' + p.opp : ''}: ${p.shots - p.goals}/${p.shots} — SV ${p.sv.toFixed(1)}%`}</title>
        </circle>
      ))}
    </svg>
  );
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

  const svVal = tt.s > 0 ? 100 * (tt.s - tt.g) / tt.s : null;
  const dsvVal = st.s > 0 ? 100 * (st.s - st.g) / st.s : null;
  const rec = recordParts(selectedGames);

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

  // Sparkline: SV% по ВСЕМ выбранным играм, отдельно по каждому вратарю
  const sparkRows = useMemo(() => {
    return goalies.map(p => {
      const pts: { date: string; sv: number; shots: number; goals: number; opp: string }[] = [];
      selectedGames.forEach(g => {
        let s = 0, gg = 0;
        g.events.forEach(e => { if (e.g === p.id) { s++; if (e.t === 'goal') gg++; } });
        if (s > 0) pts.push({ date: g.date, sv: 100 * (s - gg) / s, shots: s, goals: gg, opp: g.opponent || '' });
      });
      const avg = pts.length ? pts.reduce((a, x) => a + x.sv, 0) / pts.length : null;
      return { ...p, pts, avg };
    }).filter(r => r.pts.length > 0);
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

  // Худшая опасная зона (объём ≥3 по сумме) — коралловое кольцо
  const worstZone = useMemo(() => {
    let worst: number | null = null;
    ZONES.filter(z => z.tier === 'sel').forEach(z => {
      const c = m[z.id] || { s: 0, g: 0 };
      if (c.s >= 3 && (worst === null || c.g / c.s > (m[worst]?.g || 0) / (m[worst]?.s || 1))) worst = z.id;
    });
    return worst;
  }, [m]);

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

  const kpis: [string, string | number, string | undefined][] = [
    ['Games', selectedGames.length, undefined],
    ['Shots', tt.s, undefined],
    ['SV%', svVal !== null ? svVal.toFixed(1) : '—', svVal !== null ? svColor(svVal) : undefined],
    ['Danger SV%', dsvVal !== null ? dsvVal.toFixed(1) : '—', dsvVal !== null ? svColor(dsvVal) : undefined],
    ['Record', rec.hasResults ? `${rec.w}–${rec.l}${rec.t ? `–${rec.t}` : ''}` : '—', undefined],
  ];

  return (
    <div className="space-y-4">
      {/* Scope — дата + выбор игр */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <span className={MICRO}>Season scope</span>
          <span className="flex-1" />
          <label className="text-xs font-semibold text-mut">From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white" />
          <label className="text-xs font-semibold text-mut">To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white" />
          <button onClick={selectAll} className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold hover:bg-slate-50">All</button>
          <button onClick={selectNone} className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold hover:bg-slate-50">None</button>
          <button onClick={exportCsv} className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold border transition">Export CSV</button>
        </div>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
          {rangeGames.map(g => (
            <label key={g.id} className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg cursor-pointer text-sm transition ${checked[g.id] ? 'border-slate-900 bg-white' : 'border-line bg-white opacity-50 hover:opacity-80'}`}>
              <input type="checkbox" checked={!!checked[g.id]} onChange={() => toggleCheck(g.id)} />
              <span>{fmtDate(g.date)}{g.opponent ? ` · ${g.opponent}` : ''}</span>
              <span className="text-xs text-mut">({g.events.length})</span>
            </label>
          ))}
          {!rangeGames.length && <span className="text-sm text-mut p-2">No games in range.</span>}
        </div>
      </div>

      {/* KPI strip — сумма выбранных игр */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(([label, value, color], i) => (
          <div key={label} className="card p-4 fade-row" style={{ ['--i' as any]: i }}>
            <div className="text-2xl font-black tabular-nums leading-none" style={{ color: color || INK }}>{value}</div>
            <div className={MICRO + ' mt-1.5'}>{label}</div>
            {label === 'Record' && rec.parts.length > 0 && <div className="text-[10px] text-mut mt-1 tabular-nums">{rec.parts.join(' · ')}</div>}
          </div>
        ))}
      </div>

      {/* Heat zone table — агрегат по зонам */}
      <div className="card p-4">
        <div className="flex items-baseline gap-3 mb-3">
          <h3 className={MICRO}>Shots by zone · sum over {selectedGames.length} game(s)</h3>
          <span className="text-[10px] text-mut">SV% on heat · ring marks worst zone</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm focus-cascade">
            <thead>
              <tr className="text-left border-b border-line" style={{ opacity: 0.45 }}>
                <th className={`${MICRO} py-2 pr-3 font-semibold`}>Zone</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>Shots</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>GA</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>Saves</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>SV%</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>Conv%</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const maxS = Math.max(1, ...ZONES.map(z => (m[z.id] || { s: 0 }).s));
                return ZONES.map((z, ri) => {
                  const c = m[z.id] || { s: 0, g: 0 };
                  const sv = c.s > 0 ? 100 * (c.s - c.g) / c.s : null;
                  const a = c.s > 0 ? 0.06 + 0.8 * (c.s / maxS) : 0;
                  const dark = a > 0.42;
                  const isWorst = worstZone === z.id;
                  return (
                    <tr key={z.id} className={`border-b border-line/50 fade-row ${z.tier === 'tot' ? 'text-mut' : ''}`} style={{ ['--i' as any]: ri, transition: 'opacity 0.15s' }}>
                      <td className="py-2 pr-3 font-medium whitespace-nowrap">
                        <span className="inline-flex items-center gap-2 rounded-md px-1.5 py-0.5" style={{ boxShadow: isWorst ? `inset 0 0 0 2px ${ACCENT}` : 'none' }}>
                          {z.id}. {z.name}
                          {isWorst && <span className="w-1.5 h-1.5 rounded-full" style={{ background: ACCENT }} />}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {c.s}
                        <span className="inline-block w-16 h-1.5 bg-slate-100 rounded ml-2 align-middle overflow-hidden">
                          <span className="block h-full rounded" style={{ width: `${100 * c.s / maxS}%`, background: isWorst ? ACCENT : 'var(--save)' }} />
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: c.g ? '#dc2626' : undefined }}>{c.g || '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{c.s - c.g}</td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {sv !== null
                          ? <span
                              className="inline-flex items-center justify-center min-w-[3.5rem] h-7 px-2 rounded-md text-xs font-bold"
                              style={{ background: `rgba(22,24,29,${a.toFixed(2)})`, color: dark ? '#fff' : INK }}
                              title={`${c.s} shots / ${c.g} GA`}
                            >{sv.toFixed(1)}</span>
                          : <span className="text-mut">—</span>}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-mut">{pct(c.g, c.s)}</td>
                    </tr>
                  );
                });
              })()}
              <tr className="font-bold border-t-2 border-line">
                <td className="py-2 pr-3">TOTAL</td>
                <td className="py-2 px-2 text-right tabular-nums">{tt.s}</td>
                <td className="py-2 px-2 text-right tabular-nums" style={{ color: tt.g ? '#dc2626' : undefined }}>{tt.g || '—'}</td>
                <td className="py-2 px-2 text-right tabular-nums">{tt.s - tt.g}</td>
                <td className={`py-2 px-2 text-right tabular-nums ${svClass(tt.s - tt.g, tt.s)}`}>{pct(tt.s - tt.g, tt.s)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-mut">{pct(tt.g, tt.s)}</td>
              </tr>
              <tr className="text-mut">
                <td className="py-2 pr-3">Danger zones only</td>
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

      {/* SV% dynamics by game — все выбранные игры */}
      {sparkRows.length > 0 && (
        <div className="card p-4">
          <div className="flex items-baseline gap-3 mb-3">
            <h3 className={MICRO}>SV% by game · all {selectedGames.length} selected</h3>
            <span className="text-[10px] text-mut">dot color = save quality · dashed line = average</span>
          </div>
          <div className="divide-y divide-line/60">
            {sparkRows.map((row, ri) => (
              <div key={row.id} className="py-3 flex items-center gap-4 fade-row" style={{ ['--i' as any]: ri }}>
                <div className="flex items-center gap-2 w-44 shrink-0 min-w-0">
                  {row.photo && <img src={row.photo} alt="" className="w-6 h-6 rounded-full object-cover bg-gray-200 shrink-0" />}
                  <span className="font-bold text-sm truncate">{row.name}</span>
                </div>
                <div className="flex-1 min-w-0"><SeasonSpark pts={row.pts} /></div>
                <div className="text-right shrink-0 w-24">
                  <div className="text-lg font-black tabular-nums leading-none" style={{ color: row.avg !== null ? svColor(row.avg) : undefined }}>
                    {row.avg !== null ? row.avg.toFixed(1) : '—'}
                  </div>
                  <div className={MICRO + ' mt-1'}>avg SV%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Highlights */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          ['Most shots (danger)', maxZone.shots > 0 ? `Z${maxZone.id} · ${zoneName(maxZone.id!)}` : 'no data', `${maxZone.shots} shots`, undefined],
          ['Goals conceded from', goalZones.length ? goalZones.join(', ') : 'no goals', `${tt.g} GA`, '#dc2626'],
          ['Outside danger zones', `${tt.s - st.s} shot(s)`, `${tt.s} total shots`, undefined],
          ['Record', rec.hasResults ? `${rec.w}–${rec.l}${rec.t ? `–${rec.t}` : ''}` : 'no results', rec.parts.join(' · ') || '—', undefined],
        ].map(([label, value, sub, color], i) => (
          <div key={label as string} className="card p-4 fade-row" style={{ ['--i' as any]: i + 2 }}>
            <div className={MICRO}>{label}</div>
            <div className="text-sm font-bold mt-1.5 truncate" style={{ color: color || INK }}>{value}</div>
            <div className="text-[10px] text-mut mt-1 tabular-nums">{sub}</div>
          </div>
        ))}
      </div>

      {/* Per-game table */}
      <div className="card p-4">
        <div className="flex items-baseline gap-3 mb-3">
          <h3 className={MICRO}>Per-game stats</h3>
          <span className="text-[10px] text-mut">{selectedGames.length} game(s) · click row to open</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm focus-cascade">
            <thead>
              <tr className="text-left border-b border-line" style={{ opacity: 0.45 }}>
                <th className={`${MICRO} py-2 pr-3 font-semibold`}>Date</th>
                <th className={`${MICRO} py-2 pr-3 font-semibold`}>Opponent</th>
                <th className={`${MICRO} py-2 pr-3 font-semibold`}>Result</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>Shots</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>GA</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>SV%</th>
                <th className={`${MICRO} py-2 px-2 text-left font-semibold`}>Top zone</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>GAA</th>
                <th className={`${MICRO} py-2 pl-3 font-semibold`}></th>
              </tr>
            </thead>
            <tbody>
              {selectedGames.map((g, ri) => {
                const gm = aggEvents(g.events);
                const t = totals(gm);
                let toiG = 0;
                Object.values(g.toi || {}).forEach(v => { toiG += (+v || 0); });
                let topZ: number | null = null, topS = -1;
                ZONES.filter(z => z.tier === 'sel').forEach(z => {
                  const s = (gm[z.id] || { s: 0 }).s;
                  if (s > topS) { topS = s; topZ = z.id; }
                });
                const gsv = t.s > 0 ? 100 * (t.s - t.g) / t.s : null;
                const r = g.result;
                const [lab, col] = r ? badgeStyle(+r.gf || 0, +r.ga || 0) : ['—', '#9ca3af'];
                return (
                  <tr key={g.id} className="border-b border-line/50 fade-row cursor-pointer" style={{ ['--i' as any]: ri, transition: 'opacity 0.15s' }} onClick={() => handleOpenGame(g.id)}>
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(g.date)}</td>
                    <td className="py-2 pr-3">{g.opponent || '—'}</td>
                    <td className="py-2 pr-3">
                      {r ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-md inline-flex items-center justify-center text-[10px] font-black text-white" style={{ background: col }}>{lab}</span>
                          <span className="text-xs tabular-nums">{+r.gf || 0}:{+r.ga || 0}{r.dec ? ` (${r.dec})` : ''}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{t.s}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: t.g ? '#dc2626' : undefined }}>{t.g || '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: gsv !== null ? svColor(gsv) : undefined }}>{pct(t.s - t.g, t.s)}</td>
                    <td className="py-2 px-2 text-left text-xs text-mut">{topS > 0 ? `Z${topZ} · ${zoneName(topZ!)} (${topS})` : '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{gaa(t.g, toiG, 1)}</td>
                    <td className="py-2 pl-3"><span className="text-[11px] font-semibold pb-0.5 border-b-2" style={{ borderColor: ACCENT, color: INK }}>open</span></td>
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
        <h3 className={MICRO + ' mb-3'}>By goalie · selected games</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm focus-cascade">
            <thead>
              <tr className="text-left border-b border-line" style={{ opacity: 0.45 }}>
                <th className={`${MICRO} py-2 pr-3 font-semibold`}>Goalie</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>Games</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>Shots</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>GA</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>SV%</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>Minutes</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>GAA</th>
              </tr>
            </thead>
            <tbody>
              {goalieStats.map((p, ri) => {
                const gsv = p.s > 0 ? 100 * (p.s - p.g) / p.s : null;
                return (
                  <tr key={p.id} className="border-b border-line/50 fade-row" style={{ ['--i' as any]: ri, transition: 'opacity 0.15s' }}>
                    <td className="py-2 pr-3 font-medium whitespace-nowrap"><div className="flex items-center gap-2">{p.photo && <img src={p.photo} alt="" className="w-6 h-6 rounded-full object-cover bg-gray-200" />}{p.name}</div></td>
                    <td className="py-2 px-2 text-right tabular-nums">{p.ng}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{p.s}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: p.g ? '#dc2626' : undefined }}>{p.g || '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: gsv !== null ? svColor(gsv) : undefined }}>{pct(p.s - p.g, p.s)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{p.toi ? Math.round(p.toi) : '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{p.gaa}</td>
                  </tr>
                );
              })}
              {!selectedGames.length && <tr><td colSpan={7} className="py-4 text-center text-mut text-sm">Select games above.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* GA breakdown — плоские строки с точками-группами, как на дашборде */}
      <div className="card p-4">
        <h3 className={MICRO + ' mb-3'}>Goals-against breakdown</h3>
        <div className="grid md:grid-cols-3 gap-6">
          {/* Strength */}
          <div>
            <div className={MICRO + ' mb-2'}>Strength</div>
            <div className="divide-y divide-line/60">
              {['even', 'pk', 'pp', 'ea', 'ps'].map(grp => {
                const cnt = strBreakdown.byGrp[grp];
                if (!cnt) return null;
                return (
                  <div key={grp} className="py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STR_GRP_COLORS[grp] }} />
                      <span className="font-bold text-sm flex-1">{STR_GRP_NAMES[grp]}</span>
                      <span className="text-sm font-bold tabular-nums">{cnt}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 pl-4">
                      {STRENGTHS.filter(s => s.grp === grp && strBreakdown.byStr[s.id]).map(s => (
                        <span key={s.id} className="text-[11px] text-mut tabular-nums">{s.id} <b className="text-ink">{strBreakdown.byStr[s.id]}</b></span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!goalEvents.length && <div className="py-2 text-mut text-xs">no goals conceded</div>}
            </div>
          </div>
          {/* Target */}
          <div>
            <div className={MICRO + ' mb-2'}>Where the goal went in</div>
            <div className="divide-y divide-line/60">
              {tgtBreakdown.map(t => {
                const maxC = Math.max(1, ...tgtBreakdown.map(x => x.count));
                return (
                  <div key={t.name} className="py-2 flex items-center gap-3 text-sm">
                    <span className="flex-1">{t.name}</span>
                    <span className="w-20 h-1.5 bg-red-100 rounded overflow-hidden shrink-0"><span className="block h-full bg-goal rounded" style={{ width: `${100 * t.count / maxC}%` }} /></span>
                    <span className="font-bold tabular-nums w-6 text-right">{t.count}</span>
                  </div>
                );
              })}
              {!goalEvents.length && <div className="py-2 text-mut text-xs">no goals conceded</div>}
            </div>
          </div>
          {/* Play */}
          <div>
            <div className={MICRO + ' mb-2'}>How it was scored</div>
            <div className="divide-y divide-line/60">
              {playBreakdown.map(p => {
                const maxC = Math.max(1, ...playBreakdown.map(x => x.count));
                return (
                  <div key={p.name} className="py-2 flex items-center gap-3 text-sm">
                    <span className="flex-1">{p.name}</span>
                    <span className="w-20 h-1.5 bg-red-100 rounded overflow-hidden shrink-0"><span className="block h-full bg-goal rounded" style={{ width: `${100 * p.count / maxC}%` }} /></span>
                    <span className="font-bold tabular-nums w-6 text-right">{p.count}</span>
                  </div>
                );
              })}
              {!goalEvents.length && <div className="py-2 text-mut text-xs">no goals conceded</div>}
            </div>
          </div>
        </div>
      </div>

      {/* By Period */}
      <div className="card p-4">
        <h3 className={MICRO + ' mb-3'}>Performance by period</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm focus-cascade">
            <thead>
              <tr className="text-left border-b border-line" style={{ opacity: 0.45 }}>
                <th className={`${MICRO} py-2 pr-4 font-semibold`}>Period</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>Shots</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>GA</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>Saves</th>
                <th className={`${MICRO} py-2 px-2 text-right font-semibold`}>SV%</th>
              </tr>
            </thead>
            <tbody>
              {periodStats.map((p, ri) => {
                const sv = p.s > 0 ? 100 * (p.s - p.g) / p.s : null;
                return (
                  <tr key={p.period} className="border-b border-line/50 fade-row" style={{ ['--i' as any]: ri, transition: 'opacity 0.15s' }}>
                    <td className="py-2 pr-4 font-medium">{p.period === '—' ? 'not set' : p.period}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{p.s}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: p.g ? '#dc2626' : undefined }}>{p.g || '—'}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{p.s - p.g}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: sv !== null ? svColor(sv) : undefined }}>{pct(p.s - p.g, p.s)}</td>
                  </tr>
                );
              })}
              {!allEvents.length && <tr><td colSpan={5} className="py-4 text-center text-mut text-sm">no events</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

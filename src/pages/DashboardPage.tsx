import React, { useMemo } from 'react';
import { useStore } from '../store';
import { ZONES, PERIODS, STRENGTHS, STR_GRP_COLORS, STR_GRP_NAMES } from '../types';
import { pct, gaa, fmtDate } from '../utils/stats';

// Единственный акцент: коралл — интерактив и худшая зона
const ACCENT = 'rgb(255,130,100)';
const INK = '#16181d';

// 7 ступеней: красный → оранжевый → янтарь → жёлтый → зелёный (всё яркое, без серого)
const svColor = (v: number) =>
  v >= 95 ? '#15803d' : // green-700
  v >= 92 ? '#16a34a' : // green-600
  v >= 89 ? '#a16207' : // yellow-700
  v >= 86 ? '#d97706' : // amber-600
  v >= 83 ? '#ea580c' : // orange-600
  v >= 80 ? '#c2410c' : // orange-700
  '#dc2626';           // red-600

const MICRO = 'text-[10px] uppercase tracking-[0.14em] text-mut font-semibold';

// ── Столбчатая диаграмма SV% по периодам: высота = SV%, цвет = шкала, объём подписью ──
function PeriodBars({ pts, avg }: { pts: { period: string; sv: number; s: number; g: number }[]; avg: number | null }) {
  const W = 560, H = 120, PADX = 18, TOP = 20, BOT = 8;
  const n = PERIODS.length;
  const slot = (W - 2 * PADX) / n;
  const bw = Math.min(56, slot * 0.52);
  const lo = Math.max(50, Math.min(72, ...(pts.length ? pts.map(p => p.sv - 8) : [70])));
  const y = (v: number) => TOP + (1 - (v - lo) / (100 - lo)) * (H - TOP - BOT);
  const base = y(lo);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" aria-hidden="true">
        {/* базовая линия */}
        <line x1={PADX - 8} x2={W - PADX + 8} y1={base} y2={base} stroke="#d7dbe2" strokeWidth="1" />
        {/* сезонный SV% вратаря */}
        {avg !== null && avg > lo && (
          <g>
            <line x1={PADX - 8} x2={W - PADX + 8} y1={y(avg)} y2={y(avg)} stroke={INK} strokeWidth="0.9" strokeDasharray="4 3" opacity="0.45" />
            <text x={PADX - 8} y={y(avg) - 3} textAnchor="start" fontSize="9" fontWeight="700" fill={INK} opacity="0.55">season {avg.toFixed(1)}</text>
          </g>
        )}
        {PERIODS.map((per, idx) => {
          const pt = pts.find(p => p.period === per);
          if (!pt) return null;
          const x = PADX + slot * idx + (slot - bw) / 2;
          const col = svColor(pt.sv);
          return (
            <g key={per}>
              <rect x={x} y={y(pt.sv)} width={bw} height={Math.max(2, base - y(pt.sv))} rx="3" fill={col} opacity="0.92">
                <title>{`Period ${per}: ${pt.s - pt.g}/${pt.s} — SV ${pt.sv.toFixed(1)}%`}</title>
              </rect>
              <text x={x + bw / 2} y={y(pt.sv) - 4} textAnchor="middle" fontSize="11" fontWeight="800" fill={col}>{pt.sv.toFixed(0)}</text>
            </g>
          );
        })}
      </svg>
      {/* подписи: период + объём бросков */}
      <div className="relative h-8 mt-0.5">
        {PERIODS.map((per, idx) => {
          const pt = pts.find(p => p.period === per);
          return (
            <span key={per} className="absolute text-center" style={{ left: `${((PADX + slot * (idx + 0.5)) / W * 100).toFixed(2)}%`, transform: 'translateX(-50%)', width: slot }}>
              <span className={`block text-[9px] font-bold ${pt ? 'text-ink' : 'text-mut/50'}`}>{per}</span>
              <span className="block text-[8px] tabular-nums text-mut">{pt ? `${pt.s} sh` : '—'}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const games = useStore(s => s.games);
  const goalies = useStore(s => s.goalies);
  const [filterGoalie, setFilterGoalie] = React.useState('');

  const goalieIds = filterGoalie ? [filterGoalie] : goalies.map(p => p.id);

  // Summary per goalie across ALL games
  const summary = useMemo(() => {
    const per: Record<string, { games: Set<string>; s: number; g: number; toi: number; w: number; l: number; t: number }> = {};
    goalieIds.forEach(id => { per[id] = { games: new Set(), s: 0, g: 0, toi: 0, w: 0, l: 0, t: 0 }; });

    games.forEach(g => {
      g.events.forEach(e => {
        if (!per[e.g]) return;
        per[e.g].games.add(g.id);
        per[e.g].s++;
        if (e.t === 'goal') per[e.g].g++;
      });
      if (g.toi) {
        goalieIds.forEach(id => { if (g.toi[id]) per[id].toi += (+g.toi[id] || 0); });
      }
      if (g.result && g.result.gf != null && g.result.ga != null) {
        const gf = +g.result.gf || 0, ga = +g.result.ga || 0;
        const inGame = new Set(g.events.map(e => e.g));
        goalieIds.forEach(id => {
          if (inGame.has(id)) {
            if (gf > ga) per[id].w++;
            else if (gf < ga) per[id].l++;
            else per[id].t++;
          }
        });
      }
    });

    return goalies.filter(p => goalieIds.includes(p.id)).map(p => {
      const r = per[p.id];
      const ng = r ? r.games.size : 0;
      return { ...p, ...r, ng, gaaVal: gaa(r?.g || 0, r?.toi || 0, ng) };
    });
  }, [games, goalies, goalieIds]);

  // Per-game SV% series for sparklines (last 8 games played)
  const spark = useMemo(() => {
    const sorted = [...games].sort((a, b) => a.date < b.date ? -1 : 1);
    return goalies.filter(p => goalieIds.includes(p.id)).map(p => {
      const pts: { date: string; sv: number | null; shots: number; goals: number; opp: string }[] = [];
      sorted.forEach(g => {
        let s = 0, gg = 0;
        g.events.forEach(e => { if (e.g === p.id) { s++; if (e.t === 'goal') gg++; } });
        if (s > 0) pts.push({ date: g.date, sv: 100 * (s - gg) / s, shots: s, goals: gg, opp: g.opponent || '' });
      });
      return { id: p.id, name: p.name, pts: pts.slice(-8) };
    });
  }, [games, goalies, goalieIds]);

  // Zone grid per goalie (danger zones only) — с тепловой заливкой
  const zoneGrid = useMemo(() => {
    return goalies.filter(p => goalieIds.includes(p.id)).map(p => {
      const zm: Record<number, { s: number; g: number }> = {};
      games.forEach(g => {
        g.events.forEach(e => {
          if (e.g !== p.id) return;
          if (!zm[e.z]) zm[e.z] = { s: 0, g: 0 };
          zm[e.z].s++;
          if (e.t === 'goal') zm[e.z].g++;
        });
      });
      let totalS = 0, totalG = 0, maxS = 0;
      const zones = ZONES.filter(z => z.tier === 'sel').map(z => {
        const c = zm[z.id] || { s: 0, g: 0 };
        totalS += c.s; totalG += c.g;
        maxS = Math.max(maxS, c.s);
        return { ...z, ...c };
      });
      // худшая зона: минимальный SV% среди зон с заметным объёмом (≥3 броска)
      let worst: number | null = null;
      zones.forEach(z => {
        if (z.s >= 3 && (worst === null || z.g / z.s > zones.find(zz => zz.id === worst)!.g / zones.find(zz => zz.id === worst)!.s)) worst = z.id;
      });
      return { name: p.name, id: p.id, zones, totalS, totalG, maxS, worst };
    });
  }, [games, goalies, goalieIds]);

  // Period performance per goalie
  const periodPerf = useMemo(() => {
    return goalies.filter(p => goalieIds.includes(p.id)).map(p => {
      const pm: Record<string, { s: number; g: number }> = {};
      games.forEach(g => {
        g.events.forEach(e => {
          if (e.g !== p.id) return;
          const per = e.p || '—';
          if (!pm[per]) pm[per] = { s: 0, g: 0 };
          pm[per].s++;
          if (e.t === 'goal') pm[per].g++;
        });
      });
      return { name: p.name, id: p.id, photo: p.photo, periods: PERIODS.map(per => ({ period: per, ...(pm[per] || { s: 0, g: 0 }) })) };
    });
  }, [games, goalies, goalieIds]);

  // Recent form (last 5 games per goalie)
  const recentForm = useMemo(() => {
    const sorted = [...games].sort((a, b) => a.date < b.date ? -1 : 1);
    return goalies.filter(p => goalieIds.includes(p.id)).map(p => {
      const goalieGames = sorted.filter(g => g.events.some(e => e.g === p.id)).slice(-5);
      return {
        name: p.name, id: p.id,
        games: goalieGames.map(g => {
          let gs = 0, gg = 0;
          g.events.forEach(e => { if (e.g === p.id) { gs++; if (e.t === 'goal') gg++; } });
          return { date: g.date, opponent: g.opponent, shots: gs, goals: gg, sv: gs > 0 ? 100 * (gs - gg) / gs : null };
        })
      };
    });
  }, [games, goalies, goalieIds]);

  // Breakdown per goalie
  const breakdowns = useMemo(() => {
    return goalies.filter(p => goalieIds.includes(p.id)).map(p => {
      const goalEvents: { str?: string; tgt?: string; play?: string[] }[] = [];
      games.forEach(g => {
        g.events.forEach(e => {
          if (e.g === p.id && e.t === 'goal') goalEvents.push(e);
        });
      });
      const byGrp: Record<string, number> = {};
      goalEvents.forEach(e => {
        let grp = 'none';
        const found = STRENGTHS.find(st => st.id === (e.str || ''));
        if (found) grp = found.grp;
        byGrp[grp] = (byGrp[grp] || 0) + 1;
      });
      return { name: p.name, id: p.id, total: goalEvents.length, byGrp };
    }).filter(x => x.total > 0);
  }, [games, goalies, goalieIds]);

  const empty = games.length === 0;

  // ── SVG sparkline ──────────────────────────────────────
  const Spark = ({ pts }: { pts: { date: string; sv: number | null; shots: number; goals: number; opp: string }[] }) => {
    if (pts.length < 2) return <div className="h-12" />;
    const W = 200, H = 48, PAD = 6;
    const lo = Math.min(...pts.map(p => p.sv ?? 100)) - 2;
    const hi = Math.max(...pts.map(p => p.sv ?? 0)) + 2;
    const x = (i: number) => PAD + i * (W - 2 * PAD) / (pts.length - 1);
    const y = (v: number) => H - PAD - (v - lo) / (hi - lo) * (H - 2 * PAD);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.sv!).toFixed(1)}`).join(' ');
    const avg = pts.reduce((a, p) => a + p.sv!, 0) / pts.length;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" preserveAspectRatio="none" aria-hidden="true">
        <path d={`${d} L${x(pts.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`} fill={INK} opacity="0.06" />
        <line x1={PAD} x2={W - PAD} y1={y(avg)} y2={y(avg)} stroke={INK} strokeWidth="0.7" strokeDasharray="3 3" opacity="0.35" />
        <path d={d} fill="none" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.sv!)} r="2.6" fill={svColor(p.sv!)} stroke="#fff" strokeWidth="1">
            <title>{`${fmtDate(p.date)}${p.opp ? ' vs ' + p.opp : ''}: ${p.shots - p.goals}/${p.shots} — SV ${p.sv!.toFixed(1)}%`}</title>
          </circle>
        ))}
      </svg>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter — пилюли, неактивные на 25% прозрачности */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className={MICRO}>Goalies Dashboard</span>
        <span className="flex-1" />
        {[{ id: '', name: 'All' }, ...goalies].map(p => (
          <button
            key={p.id}
            onClick={() => setFilterGoalie(p.id)}
            className="text-[11px] uppercase tracking-[0.14em] font-semibold pb-1 border-b-2 transition-opacity"
            style={{
              opacity: filterGoalie === p.id ? 1 : 0.25,
              borderColor: filterGoalie === p.id ? ACCENT : 'transparent',
              color: INK,
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {empty && (
        <div className="card p-10 text-center text-sm text-mut">No games recorded yet.<br />Add games on the Game tab to see the dashboard.</div>
      )}

      {!empty && (
        <>
          {/* KPI cards with sparklines */}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            {summary.map((p, i) => {
              const sp = spark.find(s => s.id === p.id);
              const svVal = p.s > 0 ? 100 * (p.s - p.g) / p.s : null;
              return (
                <div key={p.id} className="card p-5 fade-row" style={{ ['--i' as any]: i }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {(p as any).photo
                        ? <img src={(p as any).photo} alt="" className="w-10 h-10 rounded-full object-cover bg-gray-200 shrink-0" />
                        : <span className="w-10 h-10 rounded-full bg-slate-100 border border-line shrink-0" />}
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">{p.name}</div>
                        <div className={MICRO}>Record {p.w + p.l + p.t > 0 ? `${p.w}–${p.l}–${p.t}` : '—'}</div>
                      </div>
                    </div>
                    {svVal !== null && (
                      <div className="text-right shrink-0">
                        <div className="text-4xl font-black tabular-nums leading-none" style={{ color: svVal !== null ? svColor(svVal) : undefined }}>{svVal.toFixed(1)}</div>
                        <div className={MICRO + ' mt-1'}>SV% · {p.s - p.g}/{p.s}</div>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">{sp && <Spark pts={sp.pts} />}</div>
                  <div className="mt-3 pt-3 border-t border-line/60 grid grid-cols-4 gap-2 text-center">
                    {[
                      ['Games', p.ng],
                      ['GAA', p.gaaVal],
                      ['Minutes', p.toi ? Math.round(p.toi) : '—'],
                      ['GA', p.g || '—'],
                    ].map(([l, v]) => (
                      <div key={l as string}>
                        <div className="text-base font-bold tabular-nums">{v}</div>
                        <div className={MICRO + ' mt-0.5'}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zone heat table */}
          <div className="card p-4">
            <div className="flex items-baseline gap-3 mb-3">
              <h3 className={MICRO}>Shots by zone</h3>
              <span className="text-[10px] text-mut">danger zones 1–7 · SV% on heat · ring marks worst zone</span>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm focus-cascade">
              <thead>
                <tr className="text-left border-b border-line" style={{ opacity: 0.45 }}>
                  <th className={`${MICRO} py-2 pr-3 font-semibold`}>Goalie</th>
                  {ZONES.filter(z => z.tier === 'sel').map(z => <th key={z.id} className={`${MICRO} py-2 px-2 text-center font-semibold`}>Z{z.id}</th>)}
                  <th className={`${MICRO} py-2 px-2 text-center font-semibold`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {zoneGrid.map((row, ri) => {
                  const gp = goalies.find(g => g.id === row.id);
                  return (
                    <tr key={row.id} className="border-b border-line/50 fade-row" style={{ ['--i' as any]: ri + 2, transition: 'opacity 0.15s' }}>
                      <td className="py-2 pr-3 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {gp?.photo && <img src={gp.photo} alt="" className="w-6 h-6 rounded-full object-cover bg-gray-200" />}
                          {row.name}
                        </div>
                      </td>
                      {row.zones.map(z => {
                        const sv = z.s > 0 ? 100 * (z.s - z.g) / z.s : null;
                        const col = sv !== null ? svColor(sv) : INK;
                        const a = row.maxS > 0 ? 0.08 + 0.22 * (z.s / row.maxS) : 0;
                        const isWorst = row.worst === z.id;
                        return (
                          <td key={z.id} className="p-1 text-center tabular-nums">
                            <span
                              className="inline-flex items-center justify-center w-14 h-7 rounded-md text-xs font-bold"
                              style={{
                                background: z.s > 0 ? `${col}${Math.round(a * 255).toString(16).padStart(2, '0')}` : 'transparent',
                                color: z.s > 0 ? col : 'var(--mut)',
                                boxShadow: isWorst ? `inset 0 0 0 2px ${ACCENT}` : (z.s > 0 ? `inset 0 0 0 1px ${col}55` : 'none'),
                              }}
                              title={z.s > 0 ? `${z.s} shots / ${z.g} GA — SV ${sv!.toFixed(1)}%` : 'No shots'}
                            >
                              {z.s > 0 ? sv!.toFixed(0) : '—'}
                            </span>
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center tabular-nums font-bold whitespace-nowrap">
                        {row.totalS ? `${pct(row.totalS - row.totalG, row.totalS)} (${row.totalS - row.totalG}/${row.totalS})` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>

          {/* GA breakdown */}
          {breakdowns.length > 0 && (
            <div className="card p-4">
              <h3 className={MICRO + ' mb-3'}>Goals-against breakdown</h3>
              <div className="divide-y divide-line/60">
                {breakdowns.map(bd => (
                  <div key={bd.id} className="py-2.5 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    <span className="font-bold text-sm w-40 truncate">{bd.name}</span>
                    <span className="text-xs text-mut tabular-nums">{bd.total} GA</span>
                    <span className="flex flex-wrap gap-x-5">
                      {['even', 'pk', 'pp', 'ea', 'ps'].map(grp => {
                        if (!bd.byGrp[grp]) return null;
                        return (
                          <span key={grp} className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums">
                            <span className="w-2 h-2 rounded-full" style={{ background: STR_GRP_COLORS[grp] }} />
                            {STR_GRP_NAMES[grp]} <span className="font-bold">{bd.byGrp[grp]}</span>
                          </span>
                        );
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Period Performance */}
          <div className="card p-4">
            <h3 className={MICRO + ' mb-3'}>Performance by period</h3>
            <div className="overflow-x-auto"><table className="w-full text-sm focus-cascade">
              <thead>
                <tr className="text-left border-b border-line" style={{ opacity: 0.45 }}>
                  <th className={`${MICRO} py-2 pr-3 font-semibold`}>Goalie</th>
                  {PERIODS.map(p => <th key={p} className={`${MICRO} py-2 px-2 text-center font-semibold`}>{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {periodPerf.map((row, ri) => (
                  <tr key={row.id} className="border-b border-line/50 fade-row" style={{ ['--i' as any]: ri + 3, transition: 'opacity 0.15s' }}>
                    <td className="py-2 pr-3 font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {row.photo && <img src={row.photo} alt="" className="w-6 h-6 rounded-full object-cover bg-gray-200" />}
                        {row.name}
                      </div>
                    </td>
                    {row.periods.map(p => {
                      const sv = p.s > 0 ? 100 * (p.s - p.g) / p.s : null;
                      return (
                        <td key={p.period} className="py-2 px-2 text-center tabular-nums">
                          {p.s > 0
                            ? <span className="font-bold" style={{ color: svColor(sv!) }}>{sv!.toFixed(1)}</span>
                            : <span className="text-mut">—</span>}
                          <span className="text-[10px] text-mut ml-1.5">{p.s ? `${p.s - p.g}/${p.s}` : ''}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          {/* SV% by period — столбчатая диаграмма за сезон */}
          <div className="card p-4">
            <div className="flex items-baseline gap-3 mb-3">
              <h3 className={MICRO}>SV% by period · season</h3>
              <span className="text-[10px] text-mut">bar = SV% in period · under = shots faced · dashed = season SV%</span>
            </div>
            <div className="divide-y divide-line/60">
              {periodPerf.map((row, ri) => {
                const pts = row.periods
                  .filter(p => p.s > 0)
                  .map(p => ({ period: p.period, s: p.s, g: p.g, sv: 100 * (p.s - p.g) / p.s }));
                const summ = summary.find(s => s.id === row.id);
                const overallSv = summ && summ.s > 0 ? 100 * (summ.s - summ.g) / summ.s : null;
                return (
                  <div key={row.id} className="py-3 flex items-start gap-4 fade-row" style={{ ['--i' as any]: ri }}>
                    <div className="flex items-center gap-2 w-44 shrink-0 min-w-0 pt-1">
                      {row.photo && <img src={row.photo} alt="" className="w-6 h-6 rounded-full object-cover bg-gray-200 shrink-0" />}
                      <span className="font-bold text-sm truncate">{row.name}</span>
                    </div>
                    <div className="flex-1 min-w-0"><PeriodBars pts={pts} avg={overallSv} /></div>
                    <div className="text-right shrink-0 w-24 pt-1">
                      <div className="text-lg font-black tabular-nums leading-none" style={{ color: overallSv !== null ? svColor(overallSv) : undefined }}>
                        {overallSv !== null ? overallSv.toFixed(1) : '—'}
                      </div>
                      <div className={MICRO + ' mt-1'}>season SV%</div>
                    </div>
                  </div>
                );
              })}
              {!periodPerf.length && <div className="text-sm text-mut py-2">No goalies.</div>}
            </div>
          </div>

          {/* Recent form — полоса игровых квадратов */}
          <div className="card p-4">
            <h3 className={MICRO + ' mb-3'}>Recent form · last 5 games</h3>
            <div className="divide-y divide-line/60">
              {recentForm.map(row => (
                <div key={row.id} className="py-2.5 flex items-center gap-4">
                  <span className="font-bold text-sm w-40 truncate shrink-0">{row.name}</span>
                  <div className="flex gap-1.5">
                    {row.games.map((g, i) => (
                      <span
                        key={i}
                        className="w-8 h-8 rounded-md inline-flex items-center justify-center text-[10px] font-black text-white tabular-nums"
                        style={{ background: g.sv === null ? '#9ca3af' : svColor(g.sv) }}
                        title={`${fmtDate(g.date)}${g.opponent ? ' vs ' + g.opponent : ''}: ${g.shots - g.goals}/${g.shots} — SV ${g.sv?.toFixed(1) ?? '—'}%`}
                      >
                        {g.sv === null ? '—' : g.sv.toFixed(0)}
                      </span>
                    ))}
                    {!row.games.length && <span className="text-xs text-mut">No games recorded.</span>}
                  </div>
                  <span className="flex-1" />
                  {row.games.length > 0 && (() => {
                    const avg = row.games.reduce((a, g) => a + (g.sv ?? 0), 0) / row.games.length;
                    return <span className="text-sm font-bold tabular-nums" style={{ color: svColor(avg) }}>{avg.toFixed(1)}% avg</span>;
                  })()}
                </div>
              ))}
              {!recentForm.length && <div className="text-sm text-mut py-2">No goalies.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

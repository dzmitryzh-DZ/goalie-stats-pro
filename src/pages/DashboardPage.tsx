import React, { useMemo } from 'react';
import { useStore } from '../store';
import { ZONES, PERIODS, STRENGTHS, STR_GRP_COLORS, STR_GRP_NAMES } from '../types';
import { pct, svClass, gaa, fmtDate } from '../utils/stats';

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

  // Zone grid per goalie (danger zones only)
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
      let totalS = 0, totalG = 0;
      const zones = ZONES.filter(z => z.tier === 'sel').map(z => {
        const c = zm[z.id] || { s: 0, g: 0 };
        totalS += c.s; totalG += c.g;
        return { ...z, ...c };
      });
      return { name: p.name, id: p.id, zones, totalS, totalG };
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
      return { name: p.name, id: p.id, periods: PERIODS.map(per => ({ period: per, ...(pm[per] || { s: 0, g: 0 }) })) };
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
          return { date: g.date, opponent: g.opponent, shots: gs, goals: gg, svPct: gs > 0 ? (100 * (gs - gg) / gs).toFixed(1) : '—' };
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
      // Strength
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

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <h3 className="font-bold text-lg">📊 Goalies Dashboard</h3>
        <span className="flex-1" />
        <label className="text-sm font-semibold text-mut">Show stats for:</label>
        <select value={filterGoalie} onChange={e => setFilterGoalie(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white">
          <option value="">all goalies</option>
          {goalies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Summary Table */}
      <div className="card p-4">
        <h3 className="font-bold text-lg mb-3">🥅 Goalie summary (all games)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-mut border-b border-line">
                <th className="py-2 pr-3">Goalie</th>
                <th className="py-2 px-2 text-right">Games</th>
                <th className="py-2 px-2 text-right">Shots</th>
                <th className="py-2 px-2 text-right">GA</th>
                <th className="py-2 px-2 text-right">Saves</th>
                <th className="py-2 px-2 text-right">SV%</th>
                <th className="py-2 px-2 text-right">Minutes</th>
                <th className="py-2 px-2 text-right">GAA</th>
                <th className="py-2 px-2 text-right">Record</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(p => (
                <tr key={p.id} className="border-b border-line/50">
                  <td className="py-2 pr-3 font-medium"><div className="flex items-center gap-2">{(p as any).photo && <img src={(p as any).photo} alt="" className="w-6 h-6 rounded-full object-cover bg-gray-200" />}{p.name}</div></td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.ng}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.s}</td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold text-goal">{p.g || '—'}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.s - p.g}</td>
                  <td className={`py-2 px-2 text-right tabular-nums ${svClass(p.s - p.g, p.s)}`}>{pct(p.s - p.g, p.s)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.toi || '—'}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.gaaVal}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{p.w + p.l + p.t > 0 ? `${p.w}-${p.l}-${p.t}` : '—'}</td>
                </tr>
              ))}
              {!goalieIds.length && <tr><td colSpan={9} className="py-4 text-center text-mut text-sm">No goalies.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zone Grid */}
      <div className="card p-4">
        <h3 className="font-bold text-lg mb-1">🎯 Shots by zone per goalie</h3>
        <p className="text-xs text-mut mb-3">Danger zones (1–7) only. Shows shots/goals against.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-mut border-b border-line">
                <th className="py-2 pr-3">Goalie</th>
                {ZONES.filter(z => z.tier === 'sel').map(z => <th key={z.id} className="py-2 px-2 text-center">Z{z.id}</th>)}
                <th className="py-2 px-2 text-center font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {zoneGrid.map(row => {
                const gp = goalies.find(g => g.id === row.id);
                return (
                <tr key={row.id} className="border-b border-line/50">
                  <td className="py-2 pr-3 font-medium"><div className="flex items-center gap-2">{gp?.photo && <img src={gp.photo} alt="" className="w-6 h-6 rounded-full object-cover bg-gray-200" />}{row.name}</div></td>
                  {row.zones.map(z => (
                    <td key={z.id} className="py-2 px-2 text-center tabular-nums">{z.s ? `${z.s}/${z.g}` : '—'}</td>
                  ))}
                  <td className="py-2 px-2 text-center tabular-nums font-bold">{row.totalS}/{row.totalG}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Breakdown per goalie */}
      {breakdowns.length > 0 && (
        <div className="card p-4">
          <h3 className="font-bold text-lg mb-3">🧾 Goals-against breakdown per goalie</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {breakdowns.map(bd => {
              const grpNames = STR_GRP_NAMES;
              const grpColors = STR_GRP_COLORS;
              return (
                <div key={bd.id} className="bg-slate-50 border border-line rounded-xl p-3">
                  <div className="font-bold text-sm mb-2">{bd.name} <span className="text-mut font-normal">({bd.total} GA)</span></div>
                  <div className="flex flex-wrap gap-2">
                    {['even', 'pk', 'pp', 'ea', 'ps'].map(grp => {
                      if (!bd.byGrp[grp]) return null;
                      return (
                        <span key={grp} className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded bg-white border border-line">
                          <span className="w-2 h-2 rounded-full" style={{ background: grpColors[grp] }}></span>
                          {grpNames[grp]}: {bd.byGrp[grp]}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Period Performance */}
      <div className="card p-4">
        <h3 className="font-bold text-lg mb-3">⏱ Performance by period</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-mut border-b border-line">
                <th className="py-2 pr-3">Goalie</th>
                {PERIODS.map(p => <th key={p} className="py-2 px-2 text-center">{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {periodPerf.map(row => (
                <tr key={row.id} className="border-b border-line/50">
                  <td className="py-2 pr-3 font-medium">{row.name}</td>
                  {row.periods.map(p => (
                    <td key={p.period} className="py-2 px-2 text-center tabular-nums">
                      {p.s ? `${p.s}/${p.g} (${pct(p.s - p.g, p.s)})` : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Form */}
      <div className="card p-4">
        <h3 className="font-bold text-lg mb-3">📈 Recent form (last 5 games)</h3>
        <div className="space-y-3">
          {recentForm.map(row => (
            <div key={row.id} className="bg-slate-50 border border-line rounded-xl p-3">
              <div className="font-bold text-sm mb-2">{row.name}</div>
              {!row.games.length && <div className="text-xs text-mut">No games recorded.</div>}
              <div className="flex flex-wrap gap-2">
                {row.games.map((g, i) => (
                  <div key={i} className="bg-white border border-line rounded-lg px-3 py-2 text-xs">
                    <div className="text-mut">{fmtDate(g.date)}{g.opponent ? ` vs ${g.opponent}` : ''}</div>
                    <div className="font-bold mt-0.5">{g.shots} shots, {g.goals} GA <span className="text-mut font-normal">(SV% {g.svPct})</span></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!recentForm.length && <div className="text-sm text-mut">No games recorded.</div>}
        </div>
      </div>
    </div>
  );
}

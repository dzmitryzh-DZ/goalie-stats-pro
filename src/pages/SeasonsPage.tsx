import React, { useMemo } from 'react';
import { useStore } from '../store';
import { aggEvents, totals, selTotals, gaa, fmtDate } from '../utils/stats';

// Единый с дашбордом язык: коралл — акцент, 7 ступеней без серого
const ACCENT = 'rgb(255,130,100)';
const INK = '#16181d';
const svColor = (v: number) =>
  v >= 95 ? '#15803d' :
  v >= 92 ? '#16a34a' :
  v >= 89 ? '#a16207' :
  v >= 86 ? '#d97706' :
  v >= 83 ? '#ea580c' :
  v >= 80 ? '#c2410c' :
  '#dc2626';
const MICRO = 'text-[10px] uppercase tracking-[0.14em] text-mut font-semibold';

interface SeasonAgg {
  seasonId: string;
  seasonName: string;
  teamName: string;
  games: number;      // игры с событиями выбранных вратарей
  s: number; g: number;
  dS: number; dG: number; // danger zones
  toi: number;
  w: number; l: number; t: number;
  firstDate: string;
}

export default function SeasonsPage() {
  const games = useStore(s => s.games);
  const goalies = useStore(s => s.goalies);
  const seasons = useStore(s => s.seasons);
  const teams = useStore(s => s.teams);
  const [filterGoalie, setFilterGoalie] = React.useState('');

  const goalieIds = filterGoalie ? [filterGoalie] : goalies.map(p => p.id);

  // Агрегат по каждому сезону для выбранного набора вратарей
  const rows = useMemo(() => {
    const list: SeasonAgg[] = seasons.map(sn => {
      const sg = games.filter(g => g.seasonId === sn.id);
      let s = 0, g = 0, dS = 0, dG = 0, toi = 0, w = 0, l = 0, t = 0, ng = 0;
      let firstDate = '';
      sg.forEach(gm => {
        const inGame = new Set(gm.events.filter(e => goalieIds.includes(e.g)).map(e => e.g));
        const m = aggEvents(gm.events.filter(e => goalieIds.includes(e.g)));
        const tt = totals(m);
        const st = selTotals(m);
        if (tt.s > 0) {
          ng++;
          if (!firstDate || gm.date < firstDate) firstDate = gm.date;
        }
        s += tt.s; g += tt.g;
        dS += st.s; dG += st.g;
        goalieIds.forEach(id => { toi += (+gm.toi?.[id]) || 0; });
        if (gm.result && gm.result.gf != null && gm.result.ga != null && inGame.size > 0) {
          const gf = +gm.result.gf || 0, ga = +gm.result.ga || 0;
          if (gf > ga) w++; else if (gf < ga) l++; else t++;
        }
      });
      const team = sn.teamId ? teams.find(x => x.id === sn.teamId) : null;
      return {
        seasonId: sn.id, seasonName: sn.name, teamName: team?.name || '',
        games: ng, s, g, dS, dG, toi, w, l, t, firstDate,
      };
    });
    // сортируем по первой игре сезона; пустые — в конец по имени
    return list.sort((a, b) => {
      if (a.firstDate && b.firstDate) return a.firstDate < b.firstDate ? -1 : 1;
      if (a.firstDate) return -1;
      if (b.firstDate) return 1;
      return a.seasonName.localeCompare(b.seasonName);
    });
  }, [games, seasons, teams, goalieIds]);

  const withData = rows.filter(r => r.s > 0);

  // Лучший сезон по SV% (среди сезонов с объёмом ≥ 10 бросков, иначе ≥1)
  const best = useMemo(() => {
    const pool = withData.filter(r => r.s >= 10);
    const src = pool.length ? pool : withData;
    if (!src.length) return null;
    return src.reduce((a, b) => (100 * (a.s - a.g) / a.s) >= (100 * (b.s - b.g) / b.s) ? a : b);
  }, [withData]);

  const sv = (r: SeasonAgg) => r.s > 0 ? 100 * (r.s - r.g) / r.s : null;
  const dsv = (r: SeasonAgg) => r.dS > 0 ? 100 * (r.dS - r.dG) / r.dS : null;

  // Итог по всем сезонам
  const total = useMemo(() => {
    if (!withData.length) return null;
    const t: SeasonAgg = {
      seasonId: '', seasonName: 'TOTAL', teamName: '',
      games: 0, s: 0, g: 0, dS: 0, dG: 0, toi: 0, w: 0, l: 0, t: 0, firstDate: '',
    };
    withData.forEach(r => {
      t.games += r.games; t.s += r.s; t.g += r.g; t.dS += r.dS; t.dG += r.dG; t.toi += r.toi;
      t.w += r.w; t.l += r.l; t.t += r.t;
    });
    return t;
  }, [withData]);

  const filterName = filterGoalie ? goalies.find(p => p.id === filterGoalie)?.name : 'All goalies';

  return (
    <div className="space-y-4">
      {/* Filter — пилюли, как на дашборде */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className={MICRO}>Seasons comparison</span>
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

      {!withData.length && (
        <div className="card p-10 text-center text-sm text-mut">
          No data across seasons for {filterName}.<br />Record games on the Game tab to compare seasons.
        </div>
      )}

      {withData.length > 0 && (
        <>
          {/* Карточки: SV% каждого сезона — мгновенное сравнение */}
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            {withData.map((r, i) => {
              const v = sv(r)!;
              const isBest = best && r.seasonId === best.seasonId;
              return (
                <div key={r.seasonId} className="card p-4 fade-row relative" style={{ ['--i' as any]: i, boxShadow: isBest ? `inset 0 0 0 2px ${ACCENT}` : undefined }}>
                  {isBest && <span className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: ACCENT, color: '#fff' }}>best</span>}
                  <div className="text-3xl font-black tabular-nums leading-none" style={{ color: svColor(v) }}>{v.toFixed(1)}</div>
                  <div className={MICRO + ' mt-1.5'}>SV% · {r.s - r.g}/{r.s}</div>
                  <div className="text-xs font-bold mt-2 truncate">🏆 {r.seasonName}</div>
                  <div className="text-[10px] text-mut tabular-nums">
                    {r.teamName || '—'} · {r.games} game{r.games === 1 ? '' : 's'}
                    {r.firstDate ? ` · since ${fmtDate(r.firstDate)}` : ''}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Детальная таблица сравнения */}
          <div className="card p-4">
            <div className="flex items-baseline gap-3 mb-3">
              <h3 className={MICRO}>Season by season · {filterName}</h3>
              <span className="text-[10px] text-mut">all values for selected goalie(s) · ring = best season</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm focus-cascade">
                <thead>
                  <tr className="text-left border-b border-line" style={{ opacity: 0.45 }}>
                    <th className={`${MICRO} py-2 pr-3 font-semibold`}>Season</th>
                    <th className={`${MICRO} py-2 pr-3 font-semibold`}>Team</th>
                    <th className={`${MICRO} py-2 px-2 text-center font-semibold`}>Games</th>
                    <th className={`${MICRO} py-2 px-2 text-center font-semibold`}>Shots</th>
                    <th className={`${MICRO} py-2 px-2 text-center font-semibold`}>Saves</th>
                    <th className={`${MICRO} py-2 px-2 text-center font-semibold`}>GA</th>
                    <th className={`${MICRO} py-2 px-2 text-center font-semibold`}>SV%</th>
                    <th className={`${MICRO} py-2 px-2 text-center font-semibold`}>Danger SV%</th>
                    <th className={`${MICRO} py-2 px-2 text-center font-semibold`}>GAA</th>
                    <th className={`${MICRO} py-2 px-2 text-center font-semibold`}>Record</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => {
                    const v = sv(r), dv = dsv(r);
                    const isBest = best && r.seasonId === best.seasonId && r.s > 0;
                    const hasData = r.s > 0;
                    return (
                      <tr
                        key={r.seasonId}
                        className={`border-b border-line/50 fade-row ${!hasData ? 'opacity-45' : ''}`}
                        style={{ ['--i' as any]: ri, transition: 'opacity 0.15s', boxShadow: isBest ? `inset 3px 0 0 ${ACCENT}` : undefined }}
                      >
                        <td className="py-2 pr-3 font-semibold whitespace-nowrap">🏆 {r.seasonName}</td>
                        <td className="py-2 pr-3 text-xs text-mut whitespace-nowrap">{r.teamName || '—'}</td>
                        <td className="py-2 px-2 text-center tabular-nums">{r.games || '—'}</td>
                        <td className="py-2 px-2 text-center tabular-nums">{r.s || '—'}</td>
                        <td className="py-2 px-2 text-center tabular-nums">{r.s ? r.s - r.g : '—'}</td>
                        <td className="py-2 px-2 text-center tabular-nums font-bold" style={{ color: r.g ? '#dc2626' : undefined }}>{r.g || '—'}</td>
                        <td className="py-2 px-2 text-center tabular-nums">
                          {v !== null
                            ? <span className="inline-flex items-center justify-center min-w-[3.5rem] h-7 px-2 rounded-md text-xs font-bold" style={{ background: `${svColor(v)}22`, color: svColor(v), boxShadow: `inset 0 0 0 1px ${svColor(v)}55` }}>{v.toFixed(1)}</span>
                            : <span className="text-mut">—</span>}
                        </td>
                        <td className="py-2 px-2 text-center tabular-nums">
                          {dv !== null
                            ? <span className="inline-flex items-center justify-center min-w-[3.5rem] h-7 px-2 rounded-md text-xs font-bold" style={{ background: `${svColor(dv)}22`, color: svColor(dv), boxShadow: `inset 0 0 0 1px ${svColor(dv)}55` }}>{dv.toFixed(1)}</span>
                            : <span className="text-mut">—</span>}
                        </td>
                        <td className="py-2 px-2 text-center tabular-nums">{r.games ? gaa(r.g, r.toi, r.games) : '—'}</td>
                        <td className="py-2 px-2 text-center tabular-nums whitespace-nowrap">
                          {r.w + r.l + r.t > 0 ? `${r.w}–${r.l}${r.t ? `–${r.t}` : ''}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {total && (
                    <tr className="font-bold" style={{ boxShadow: `inset 3px 0 0 ${INK}` }}>
                      <td className="py-2 pr-3">TOTAL</td>
                      <td className="py-2 pr-3 text-xs text-mut">{withData.length} season{withData.length === 1 ? '' : 's'}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{total.games}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{total.s}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{total.s - total.g}</td>
                      <td className="py-2 px-2 text-center tabular-nums" style={{ color: total.g ? '#dc2626' : undefined }}>{total.g || '—'}</td>
                      <td className="py-2 px-2 text-center tabular-nums font-bold" style={{ color: sv(total) !== null ? svColor(sv(total)!) : undefined }}>{sv(total)!.toFixed(1)}</td>
                      <td className="py-2 px-2 text-center tabular-nums font-bold" style={{ color: dsv(total) !== null ? svColor(dsv(total)!) : undefined }}>{dsv(total)!.toFixed(1)}</td>
                      <td className="py-2 px-2 text-center tabular-nums">{gaa(total.g, total.toi, total.games)}</td>
                      <td className="py-2 px-2 text-center tabular-nums whitespace-nowrap">{total.w + total.l + total.t > 0 ? `${total.w}–${total.l}${total.t ? `–${total.t}` : ''}` : '—'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

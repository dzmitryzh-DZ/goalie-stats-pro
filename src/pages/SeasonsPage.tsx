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

  // Агрегат по каждому сезону для произвольного набора вратарей
  const aggFor = (ids: string[]): SeasonAgg[] => seasons.map(sn => {
    const sg = games.filter(g => g.seasonId === sn.id);
    let s = 0, g = 0, dS = 0, dG = 0, toi = 0, w = 0, l = 0, t = 0, ng = 0;
    let firstDate = '';
    sg.forEach(gm => {
      const inGame = new Set(gm.events.filter(e => ids.includes(e.g)).map(e => e.g));
      const m = aggEvents(gm.events.filter(e => ids.includes(e.g)));
      const tt = totals(m);
      const st = selTotals(m);
      if (tt.s > 0) {
        ng++;
        if (!firstDate || gm.date < firstDate) firstDate = gm.date;
      }
      s += tt.s; g += tt.g;
      dS += st.s; dG += st.g;
      ids.forEach(id => { toi += (+gm.toi?.[id]) || 0; });
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
  }).sort((a, b) => {
    // сортируем по первой игре сезона; пустые — в конец по имени
    if (a.firstDate && b.firstDate) return a.firstDate < b.firstDate ? -1 : 1;
    if (a.firstDate) return -1;
    if (b.firstDate) return 1;
    return a.seasonName.localeCompare(b.seasonName);
  });

  // Все метрики — по выбранному набору вратарей
  const rows = useMemo(() => aggFor(goalieIds), [games, seasons, teams, goalieIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const withData = rows.filter(r => r.s > 0);

  // Матрица вратарь × сезон (для печатного отчёта)
  const matrix = useMemo(() => {
    return goalies.map(p => {
      const perSeason = aggFor([p.id]);
      return {
        id: p.id, name: p.name,
        cells: perSeason.map(r => ({ seasonId: r.seasonId, s: r.s, g: r.g })),
        totalS: perSeason.reduce((a, r) => a + r.s, 0),
        totalG: perSeason.reduce((a, r) => a + r.g, 0),
      };
    }).filter(r => r.totalS > 0);
  }, [games, seasons, teams, goalies]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Экспорт CSV: блок All + блок по каждому вратарю ──
  const exportCsv = () => {
    const header = ['scope', 'season', 'team', 'games', 'shots', 'saves', 'ga', 'sv_pct', 'danger_sv_pct', 'gaa', 'w', 'l', 't'];
    const lines: string[] = [header.join(',')];
    const pushRows = (scope: string, list: SeasonAgg[]) => {
      list.filter(r => r.s > 0).forEach(r => {
        const v = sv(r), dv = dsv(r);
        lines.push([
          scope, r.seasonName, r.teamName || '', String(r.games), String(r.s), String(r.s - r.g), String(r.g),
          v !== null ? v.toFixed(1) : '', dv !== null ? dv.toFixed(1) : '',
          r.games ? gaa(r.g, r.toi, r.games) : '', String(r.w), String(r.l), String(r.t),
        ].map(x => `"${String(x).replace(/"/g, '""')}"`).join(','));
      });
    };
    pushRows('ALL', aggFor(goalies.map(p => p.id)));
    goalies.forEach(p => pushRows(p.name, aggFor([p.id])));
    const csv = lines.join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'goalie-seasons-comparison.csv';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  };

  // ── Печать / PDF: report-mode, как на вкладке Season ──
  const printReport = () => {
    document.body.classList.add('report-mode');
    const cleanup = () => {
      document.body.classList.remove('report-mode');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    setTimeout(cleanup, 120000);
  };

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
        <button onClick={exportCsv} className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold border transition">Export CSV</button>
        <button onClick={printReport} className="px-3 py-1.5 rounded-lg border border-line text-xs font-semibold hover:bg-slate-50 transition">🖨 Report / PDF</button>
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

      {/* ── Печатный отчёт: на экране скрыт, виден только в print ── */}
      <div className="print-report hidden space-y-5 text-[11px] leading-snug text-black">
        {/* Шапка */}
        <div className="flex items-center gap-3 pb-3 border-b-2 border-black">
          <div>
            <div className="text-xl font-black tracking-tight">GOALIE STATS PRO — SEASONS COMPARISON</div>
            <div className="text-[10px] text-neutral-600 mt-0.5">
              Scope: {filterName} · Generated {new Date().toLocaleDateString('ru-RU')}
            </div>
          </div>
          <div className="flex-1" />
          {total && (
            <div className="text-right">
              <div className="text-2xl font-black tabular-nums" style={{ color: sv(total) !== null ? svColor(sv(total)!) : undefined }}>
                {sv(total) !== null ? sv(total)!.toFixed(1) + '%' : '—'}
              </div>
              <div className="text-[9px] uppercase tracking-widest text-neutral-600">Career SV%</div>
            </div>
          )}
        </div>

        {/* Таблица сравнения — текущий фильтр */}
        {total && (
          <div className="pb-avoid">
            <div className="text-[9px] uppercase tracking-widest text-neutral-600 mb-1.5 font-semibold">Season by season · {filterName}</div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-black text-left">
                  {['Season', 'Team', 'Games', 'Shots', 'Saves', 'GA', 'SV%', 'Danger SV%', 'GAA', 'Record'].map((h, i) => (
                    <th key={h} className={`py-1 text-[9px] uppercase tracking-widest text-neutral-600 ${i > 1 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.filter(r => r.s > 0).map(r => {
                  const v = sv(r), dv = dsv(r);
                  const isBest = best && r.seasonId === best.seasonId;
                  return (
                    <tr key={r.seasonId} className="border-b border-neutral-300" style={isBest ? { boxShadow: `inset 3px 0 0 ${ACCENT}` } : undefined}>
                      <td className="py-1 pr-2 font-semibold">{r.seasonName}{isBest ? ' ★' : ''}</td>
                      <td className="py-1 pr-2 text-neutral-600">{r.teamName || '—'}</td>
                      <td className="py-1 text-right tabular-nums">{r.games}</td>
                      <td className="py-1 text-right tabular-nums">{r.s}</td>
                      <td className="py-1 text-right tabular-nums">{r.s - r.g}</td>
                      <td className="py-1 text-right tabular-nums font-bold" style={{ color: r.g ? '#dc2626' : undefined }}>{r.g || '—'}</td>
                      <td className="py-1 text-right tabular-nums font-bold" style={{ color: v !== null ? svColor(v!) : undefined }}>{v !== null ? v.toFixed(1) : '—'}</td>
                      <td className="py-1 text-right tabular-nums font-bold" style={{ color: dv !== null ? svColor(dv!) : undefined }}>{dv !== null ? dv.toFixed(1) : '—'}</td>
                      <td className="py-1 text-right tabular-nums">{gaa(r.g, r.toi, r.games)}</td>
                      <td className="py-1 text-right tabular-nums">{r.w + r.l + r.t > 0 ? `${r.w}–${r.l}${r.t ? `–${r.t}` : ''}` : '—'}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-black font-bold">
                  <td className="py-1 pr-2">TOTAL</td>
                  <td className="py-1 pr-2 text-neutral-600">{withData.length} seasons</td>
                  <td className="py-1 text-right tabular-nums">{total.games}</td>
                  <td className="py-1 text-right tabular-nums">{total.s}</td>
                  <td className="py-1 text-right tabular-nums">{total.s - total.g}</td>
                  <td className="py-1 text-right tabular-nums" style={{ color: total.g ? '#dc2626' : undefined }}>{total.g}</td>
                  <td className="py-1 text-right tabular-nums font-bold" style={{ color: sv(total) !== null ? svColor(sv(total)!) : undefined }}>{sv(total)!.toFixed(1)}</td>
                  <td className="py-1 text-right tabular-nums font-bold" style={{ color: dsv(total) !== null ? svColor(dsv(total)!) : undefined }}>{dsv(total)!.toFixed(1)}</td>
                  <td className="py-1 text-right tabular-nums">{gaa(total.g, total.toi, total.games)}</td>
                  <td className="py-1 text-right tabular-nums">{total.w + total.l + total.t > 0 ? `${total.w}–${total.l}${total.t ? `–${total.t}` : ''}` : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Матрица вратарь × сезон */}
        {matrix.length > 0 && (
          <div className="pb-avoid">
            <div className="text-[9px] uppercase tracking-widest text-neutral-600 mb-1.5 font-semibold">SV% by goalie and season</div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="py-1 text-[9px] uppercase tracking-widest text-neutral-600">Goalie</th>
                  {seasons.filter(sn => matrix.some(row => (row.cells.find(c => c.seasonId === sn.id)?.s || 0) > 0)).map(sn => (
                    <th key={sn.id} className="py-1 text-[9px] uppercase tracking-widest text-neutral-600 text-right">{sn.name}</th>
                  ))}
                  <th className="py-1 text-[9px] uppercase tracking-widest text-neutral-600 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map(row => {
                  const tsv = row.totalS > 0 ? 100 * (row.totalS - row.totalG) / row.totalS : null;
                  return (
                    <tr key={row.id} className="border-b border-neutral-300">
                      <td className="py-1 pr-2 font-semibold">{row.name}</td>
                      {seasons.filter(sn => matrix.some(r2 => (r2.cells.find(c => c.seasonId === sn.id)?.s || 0) > 0)).map(sn => {
                        const c = row.cells.find(x => x.seasonId === sn.id);
                        const v = c && c.s > 0 ? 100 * (c.s - c.g) / c.s : null;
                        return (
                          <td key={sn.id} className="py-1 text-right tabular-nums" style={{ color: v !== null ? svColor(v) : undefined }}>
                            {v !== null ? `${v.toFixed(1)} (${c!.s - c!.g}/${c!.s})` : '—'}
                          </td>
                        );
                      })}
                      <td className="py-1 text-right tabular-nums font-bold" style={{ color: tsv !== null ? svColor(tsv) : undefined }}>
                        {tsv !== null ? tsv.toFixed(1) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

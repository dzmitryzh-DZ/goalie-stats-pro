import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore, useActiveGame } from '../store';
import { ZONES, PERIODS, STRENGTHS, TARGETS, PLAYS, ZONE_PATHS, LABEL_POS, STR_GRP_COLORS } from '../types';
import type { Event } from '../types';
import { aggEvents, totals, selTotals, pct, svClass, zoneName, normalizeTime, gaa } from '../utils/stats';

/** Self-contained time input that commits on blur and Enter (Enter triggers blur).
 *  NO unmount-commit: when another row is deleted, all rows below it remount with
 *  shifted keys, and an unmount-commit would replay each old closure's pre-delete
 *  realIdx into the wrong (or nonexistent) event — corrupting neighbours and
 *  creating phantom events. Blur/Enter cover every real editing flow (Save button,
 *  game switch, filter change) because focus leaves the input before those happen. */
function TimeInput({ initial, onCommit }: { initial: string; onCommit: (t: string | null) => void }) {
  const [val, setVal] = useState(initial);
  const valRef = useRef(initial);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  valRef.current = val;

  // Sync local state when parent provides a new initial (e.g. after external edit)
  useEffect(() => { setVal(initial); valRef.current = initial; }, [initial]);

  const doCommit = useCallback((v: string) => {
    onCommitRef.current(normalizeTime(v));
  }, []);

  return (
    <input
      type="text"
      placeholder="mm:ss"
      value={val}
      onChange={e => { setVal(e.target.value); valRef.current = e.target.value; }}
      onBlur={() => doCommit(valRef.current)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="border border-line rounded px-1 py-0.5 w-14 bg-white"
    />
  );
}

export default function GamePage() {
  const game = useActiveGame();
  const goalies = useStore(s => s.goalies);
  const addEvent = useStore(s => s.addEvent);
  const undoLastEvent = useStore(s => s.undoLastEvent);
  const setGamePeriod = useStore(s => s.setGamePeriod);
  const setGameGoalie = useStore(s => s.setGameGoalie);
  const updateGameResult = useStore(s => s.updateGameResult);
  const removeEvent = useStore(s => s.removeEvent);
  const addGoalie = useStore(s => s.addGoalie);
  const renameGoalie = useStore(s => s.renameGoalie);
  const deleteGoalie = useStore(s => s.deleteGoalie);
  const setGameToi = useStore(s => s.setGameToi);
  const updateEvent = useStore(s => s.updateEvent);
  const setGoaliePhoto = useStore(s => s.setGoaliePhoto);
  const mirror = useStore(s => s.mirror);
  const locked = useStore(s => s.locked);
  const toggleLocked = useStore(s => s.toggleLocked);

  const [mode, setMode] = useState<'save' | 'goal'>('save');
  const [timeInp, setTimeInp] = useState('');
  const [selStr, setSelStr] = useState('5x5');
  const [selTgt, setSelTgt] = useState('Chest Shot');
  const [selPlay, setSelPlay] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [goalieFilter, setGoalieFilter] = useState('');
  const [hoverZone, setHoverZone] = useState<number | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.key === 'Escape') setEditMode(false);
      if (e.key === 'z' || e.key === 'Z') setMode(m => m === 'save' ? 'goal' : 'save');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!game) return <div className="p-8 text-mut">No game selected</div>;

  // Filter events by goalie if filter is set
  const filteredEvents = goalieFilter ? game.events.filter(e => e.g === goalieFilter) : game.events;
  const m = aggEvents(filteredEvents);
  const tt = totals(m);
  const st = selTotals(m);

  const handleZoneClick = useCallback((z: number) => {
    if (locked) return;
    const ev: Omit<Event, 'ts'> = {
      z, t: mode, g: game.goalieId, p: game.period || '1',
      time: normalizeTime(timeInp),
    };
    if (mode === 'goal') {
      ev.str = selStr;
      ev.tgt = selTgt;
      ev.play = [...selPlay];
      setSelPlay([]);
    }
    addEvent(game.id, ev);
    setTimeInp('');

    // Flash effect
    const el = document.querySelector(`[data-z="${z}"]`);
    if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 220); }
  }, [locked, mode, game, timeInp, selStr, selTgt, selPlay, addEvent]);

  const transform = mirror ? 'translate(1747,0) scale(-1,1)' : '';

  // Tooltip data
  const tooltipZone = hoverZone != null ? ZONES.find(z => z.id === hoverZone) : null;
  const tooltipStats = hoverZone != null ? (m[hoverZone] || { s: 0, g: 0 }) : null;

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="card px-3 py-2 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Goalie selector + photo + management */}
          <label className="text-xs font-semibold">Goalie:</label>
          {(() => { const gp = goalies.find(p => p.id === game.goalieId); return gp?.photo ? <img src={gp.photo} alt="" className="w-6 h-6 rounded-full object-cover bg-gray-200" /> : null; })()}
          <select value={game.goalieId} onChange={e => setGameGoalie(game.id, e.target.value)} className="border border-line rounded-lg px-2 py-1 text-sm bg-white">
            {goalies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => photoRef.current?.click()} className="px-1.5 py-1 rounded border border-line text-xs hover:bg-slate-50" title="Upload photo">📷</button>
          {goalies.find(p => p.id === game.goalieId)?.photo && <button onClick={() => setGoaliePhoto(game.goalieId, null)} className="px-1.5 py-1 rounded border border-line text-xs text-goal hover:bg-red-50" title="Remove photo">✕</button>}
          <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { const img = new Image(); img.onload = () => { const k = Math.min(1, 200 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); setGoaliePhoto(game.goalieId, c.toDataURL('image/jpeg', 0.85)); }; img.src = reader.result as string; };
            reader.readAsDataURL(file); e.target.value = '';
          }} />
          <button onClick={() => { const n = prompt('Goalie name:'); if (n?.trim()) addGoalie(n.trim()); }} className="px-1.5 py-1 rounded border border-line text-xs hover:bg-slate-50" title="Add">+</button>
          <button onClick={() => { const n = prompt('New name:', goalies.find(p => p.id === game.goalieId)?.name); if (n?.trim()) renameGoalie(game.goalieId, n.trim()); }} className="px-1.5 py-1 rounded border border-line text-xs hover:bg-slate-50" title="Rename">✎</button>
          <button onClick={() => { if (goalies.length <= 1) { alert('Cannot delete the only goalie.'); return; } if (confirm(`Delete ${goalies.find(p => p.id === game.goalieId)?.name}?`)) deleteGoalie(game.goalieId); }} className="px-1.5 py-1 rounded border border-line text-xs text-goal hover:bg-red-50" title="Delete">✕</button>

          <span className="w-px h-5 bg-line mx-1"></span>

          {/* Mode toggle */}
          <label className="text-xs font-semibold">Mode:</label>
          <button onClick={() => setMode('save')} className={`px-3 py-1 rounded-full text-xs font-bold border transition ${mode === 'save' ? 'bg-save text-white border-save' : 'bg-white text-ink border-line hover:bg-slate-50'}`}>Shot</button>
          <button onClick={() => setMode('goal')} className={`px-3 py-1 rounded-full text-xs font-bold border transition ${mode === 'goal' ? 'bg-goal text-white border-goal' : 'bg-white text-ink border-line hover:bg-slate-50'}`}>Goal</button>

          <span className="w-px h-5 bg-line mx-1"></span>

          {/* Period chips */}
          <label className="text-xs font-semibold">Period:</label>
          <div className="flex gap-0.5">
            {PERIODS.map(p => (
              <button key={p} onClick={() => setGamePeriod(game.id, p)} className={`w-7 h-7 rounded text-xs font-bold border transition ${game.period === p ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-ink border-line hover:bg-slate-50'}`}>{p}</button>
            ))}
          </div>

          <input type="text" placeholder="mm:ss" value={timeInp} onChange={e => setTimeInp(e.target.value)} className="border border-line rounded-lg px-2 py-1 text-xs w-16 ml-auto" />
          <button onClick={toggleLocked} className={`px-2.5 py-1 rounded border text-xs font-semibold transition ${locked ? 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100' : 'bg-green-50 border-green-300 text-green-800 hover:bg-green-100'}`} title={locked ? 'Unlock zone editing to record shots' : 'Lock zone editing to prevent accidental clicks'}>{locked ? '🔒 Locked' : '🔓 Unlocked'}</button>
          <button onClick={() => undoLastEvent(game.id)} disabled={!game.events.length} className="px-2 py-1 rounded border border-line text-xs hover:bg-slate-50 disabled:opacity-40" title="Undo (last event)">↩</button>
        </div>

        {/* Goal attributes panel */}
        {mode === 'goal' && (
          <div className="bg-slate-50 border border-dashed border-line rounded-lg p-2 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="text-[10px] uppercase tracking-wide text-mut font-semibold">Strength</div>
            <div className="flex flex-wrap gap-1">
              {STRENGTHS.map(s => (
                <button key={s.id} onClick={() => setSelStr(s.id)} className={`px-2 py-0.5 rounded text-[11px] font-bold border-2 transition ${selStr === s.id ? 'border-slate-900 shadow-sm' : 'border-transparent opacity-80 hover:opacity-100'}`} style={{ background: STR_GRP_COLORS[s.grp], color: '#111' }}>{s.id}</button>
              ))}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-mut font-semibold mt-1">Target</div>
            <div className="flex flex-wrap gap-1">
              {TARGETS.map(t => (
                <button key={t} onClick={() => setSelTgt(t)} className={`px-2 py-0.5 rounded text-[11px] font-bold border-2 bg-gray-200 transition ${selTgt === t ? 'border-slate-900 shadow-sm' : 'border-transparent opacity-80 hover:opacity-100'}`}>{t}</button>
              ))}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-mut font-semibold mt-1">Play (multi-select)</div>
            <div className="flex flex-wrap gap-1">
              {PLAYS.map(p => {
                const on = selPlay.includes(p);
                return <button key={p} onClick={() => setSelPlay(on ? selPlay.filter(x => x !== p) : [...selPlay, p])} className={`px-2 py-0.5 rounded text-[11px] font-bold border-2 transition ${on ? 'border-indigo-600 bg-indigo-100 text-indigo-900' : 'border-transparent bg-blue-100 text-blue-900 opacity-80 hover:opacity-100'}`}>{p}</button>;
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Grid: Rink + Log */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-3">
        {/* Rink */}
        <div className="card p-2 relative">
          {locked && (
            <div className="absolute top-2 left-2 z-10 bg-black/70 text-white px-3 py-1 rounded-md text-xs font-semibold pointer-events-none select-none">
              🔒 Editing locked — click "Unlock" to record shots
            </div>
          )}
          <svg viewBox="0 0 1747 2400" className={`w-full h-auto block touch-manipulation max-h-[420px] ${locked ? 'rink-locked' : ''}`}>
            <g transform={transform}>
              <path d="M0 40 H1180 Q1693 40 1693 520 V1880 Q1693 2360 1180 2360 H0 Z" fill="#f4f5f6" stroke="#c9ccd1" strokeWidth="26"/>
              <rect x="875" y="995" width="555" height="415" fill="#e9e9ea"/>
              <line x1="1430" y1="136" x2="1430" y2="2242" stroke="#6f6f6f" strokeWidth="10"/>
              <g stroke="#8a8a8a" strokeWidth="4"><line x1="1430" y1="911" x2="1693" y2="830"/><line x1="1430" y1="1489" x2="1693" y2="1570"/></g>
              <path d="M1430 1080 A120 120 0 0 0 1430 1320 Z" fill="#d9d9d9" stroke="#9a9a9a" strokeWidth="5"/>
              <rect x="68" y="75" width="15" height="2245" fill="#4b4b4b"/>
              <g stroke="#8a8a8a" strokeWidth="10" fill="none"><circle cx="875" cy="595" r="390"/><circle cx="875" cy="1815" r="390"/></g>
              <g>{Object.entries(ZONE_PATHS).map(([z, d]) => (
                <path key={z} data-z={z} d={d} className="rink-zone" onClick={() => handleZoneClick(+z)} onMouseEnter={() => setHoverZone(+z)} onMouseLeave={() => setHoverZone(null)} />
              ))}</g>
              <g stroke="#111" strokeWidth="7" fill="none" pointerEvents="none">
                <line x1="75" y1="705" x2="485" y2="705"/><line x1="75" y1="1690" x2="485" y2="1690"/>
                <line x1="485" y1="595" x2="485" y2="1815"/><line x1="485" y1="595" x2="875" y2="595"/>
                <line x1="485" y1="1815" x2="875" y2="1815"/><line x1="875" y1="75" x2="875" y2="2320"/>
                <line x1="875" y1="595" x2="1430" y2="915"/><line x1="875" y1="1815" x2="1430" y2="1485"/>
              </g>
            </g>
            <g>{ZONES.filter(z => z.tier === 'sel' || z.id === 10).map(z => {
              const [bx, by] = LABEL_POS[z.id];
              const x = mirror ? 1747 - bx : bx;
              const c = m[z.id] || { s: 0, g: 0 };
              return (
                <g key={z.id} transform={`translate(${x},${by})`} textAnchor="middle" pointerEvents="none">
                  <text y="-10" fontSize="52" fontWeight="700" fill="#111827">{z.id}</text>
                  <text y="70" fontSize="64" fontWeight="800" fill={c.g > 0 ? '#dc2626' : '#1d4ed8'}>{c.s}/{c.g}</text>
                </g>
              );
            })}</g>
          </svg>
          {/* Tooltip */}
          {tooltipZone && tooltipStats && (
            <div className="absolute top-2 right-2 bg-white/95 border border-line rounded-lg px-3 py-1.5 text-xs shadow-lg pointer-events-none z-10 backdrop-blur-sm">
              <div className="font-bold">Z{tooltipZone.id} · {tooltipZone.name}</div>
              <div className="text-mut">{tooltipStats.s} shots · {tooltipStats.g} goals · SV% {pct(tooltipStats.s - tooltipStats.g, tooltipStats.s)}</div>
            </div>
          )}
          {/* Compact stats bar */}
          <div className="flex items-center justify-center gap-4 mt-1 py-1 text-xs border-t border-line/50">
            <span><b>{tt.s}</b> <span className="text-mut">shots</span></span>
            <span className="text-goal"><b>{tt.g}</b> <span className="text-mut">goals</span></span>
            <span><b>{pct(tt.s - tt.g, tt.s)}</b> <span className="text-mut">SV%</span></span>
            <span><b>{gaa(tt.g, 0, 1)}</b> <span className="text-mut">GAA</span></span>
          </div>
        </div>

        {/* Event Log */}
        <div className="card p-3 flex flex-col max-h-[500px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-sm">📋 Event Log</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-mut">{filteredEvents.length}{goalieFilter ? ' (filtered)' : ''}</span>
              <button onClick={() => setEditMode(!editMode)} className={`text-xs px-2 py-1 rounded border transition ${editMode ? 'bg-acc text-white border-acc' : 'border-line hover:bg-slate-50'}`}>{editMode ? '💾 Save' : '✎ Edit'}</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
            {[...filteredEvents].reverse().map((e, ri) => {
              const realIdx = game.events.indexOf(e);
              const isGoal = e.t === 'goal';
              if (!editMode) {
                return (
                  <div key={`${e.ts}-${ri}`} className={`flex items-center gap-1.5 text-xs p-1.5 rounded border-b border-dashed border-line last:border-0 ${isGoal ? 'bg-red-50' : ''}`}>
                    <span className="bg-indigo-100 text-indigo-900 text-[10px] font-bold px-1 py-0.5 rounded min-w-[20px] text-center">{e.p || '—'}</span>
                    <span className="text-mut tabular-nums min-w-[38px]">{e.time || '--:--'}</span>
                    <span className="font-semibold truncate flex-1">Z{e.z}</span>
                    {isGoal ? <><span className="text-goal font-bold">GOAL</span><span className="text-[10px] text-mut truncate max-w-[100px]">{e.str}·{e.tgt}</span></> : <span className="text-save font-semibold">save</span>}
                    <span className="text-[9px] bg-gray-100 text-gray-600 px-1 rounded">{goalies.find(p => p.id === e.g)?.name || '—'}</span>
                  </div>
                );
              }
              return (
                <div key={`${e.ts}-${ri}`} className="flex flex-wrap items-center gap-1 text-[11px] p-1.5 rounded border-b border-dashed border-line last:border-0 bg-slate-50">
                  <TimeInput initial={e.time || ''} onCommit={(t) => updateEvent(game.id, realIdx, { time: t })} />
                  <select defaultValue={e.p || ''} onChange={ev => updateEvent(game.id, realIdx, { p: ev.target.value || undefined })} className="border border-line rounded px-0.5 py-0.5 bg-white"><option value="">—</option>{PERIODS.map(p => <option key={p} value={p}>{p}</option>)}</select>
                  <select defaultValue={e.z} onChange={ev => updateEvent(game.id, realIdx, { z: +ev.target.value })} className="border border-line rounded px-0.5 py-0.5 bg-white">{ZONES.map(z => <option key={z.id} value={z.id}>Z{z.id}</option>)}</select>
                  <button onClick={() => updateEvent(game.id, realIdx, { t: e.t === 'goal' ? 'save' : 'goal' })} className={`px-1.5 py-0.5 rounded font-bold border w-7 ${e.t === 'goal' ? 'bg-goal text-white border-goal' : 'bg-save text-white border-save'}`}>{e.t === 'goal' ? 'G' : 'S'}</button>
                  <span className="text-mut truncate flex-1">{zoneName(e.z)}</span>
                  {e.t === 'goal' && <>
                    <select defaultValue={e.str || ''} onChange={ev => updateEvent(game.id, realIdx, { str: ev.target.value })} className="border border-line rounded px-0.5 py-0.5 bg-white text-[10px]">{STRENGTHS.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}</select>
                    <select defaultValue={e.tgt || ''} onChange={ev => updateEvent(game.id, realIdx, { tgt: ev.target.value })} className="border border-line rounded px-0.5 py-0.5 bg-white text-[10px]">{TARGETS.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    <div className="flex flex-wrap gap-0.5 w-full mt-0.5">{PLAYS.map(pl => {
                      const curPlay = Array.isArray(e.play) ? e.play : (e.play ? [e.play] : []);
                      const on = curPlay.includes(pl);
                      return <button key={pl} onClick={() => { const arr = [...curPlay]; const idx = arr.indexOf(pl); if (idx >= 0) arr.splice(idx, 1); else arr.push(pl); updateEvent(game.id, realIdx, { play: arr.length ? arr : undefined }); }} className={`px-1 py-0.5 rounded text-[9px] font-bold border transition ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-900 border-indigo-200 hover:bg-indigo-50'}`}>{pl}</button>;
                    })}</div>
                  </>}
                  <button onClick={() => removeEvent(game.id, realIdx)} className="text-mut hover:text-goal px-1 font-bold self-start" title="Delete">×</button>
                </div>
              );
            })}
            {!filteredEvents.length && <div className="text-mut text-xs text-center py-6">{goalieFilter ? 'No events for this goalie.' : 'No events yet. Click zones on the rink.'}</div>}
          </div>
        </div>
      </div>

      {/* Zones 8 & 9 + hint */}
      <div className="card px-3 py-1.5 flex flex-wrap gap-x-3 gap-y-1 items-center text-xs">
        <span className="text-mut">Non-danger:</span>
        <button onClick={() => handleZoneClick(8)} className="px-2 py-0.5 rounded border border-line hover:bg-slate-50 font-semibold">8 · Middle</button>
        <button onClick={() => handleZoneClick(9)} className="px-2 py-0.5 rounded border border-line hover:bg-slate-50 font-semibold">9 · Far</button>
        <span className="w-px h-3 bg-line"></span>
        <span className="text-mut">Z1–7 danger · Z8–10 total · Press <kbd className="bg-gray-100 px-1 rounded">Z</kbd> toggle mode · <kbd className="bg-gray-100 px-1 rounded">Esc</kbd> exit edit</span>
      </div>

      {/* Goalie Filter */}
      <div className="card px-3 py-1.5 flex flex-wrap gap-2 items-center">
        <label className="text-xs font-semibold text-mut">Filter stats:</label>
        <select value={goalieFilter} onChange={e => setGoalieFilter(e.target.value)} className="border border-line rounded-lg px-2 py-1 text-xs bg-white">
          <option value="">all goalies</option>
          {goalies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {goalieFilter && <span className="text-[10px] text-acc font-semibold">Showing {filteredEvents.length} of {game.events.length} events</span>}
      </div>

      {/* Zone Stats Table */}
      <div className="card px-3 py-2">
        <h3 className="font-bold text-sm mb-1.5">🥅 Zone Stats</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-mut border-b border-line"><th className="py-1.5 pr-3">Zone</th><th className="py-1.5 px-1 text-right">Shots</th><th className="py-1.5 px-1 text-right">Goals</th><th className="py-1.5 px-1 text-right">Saves</th><th className="py-1.5 px-1 text-right">SV%</th></tr></thead>
            <tbody>
              {ZONES.map(z => { const c = m[z.id] || { s: 0, g: 0 }; return (<tr key={z.id} className={`border-b border-line/50 ${z.tier === 'tot' ? 'text-mut bg-slate-50/50' : ''}`}><td className="py-1.5 pr-3 font-medium">{z.id}. {z.name}</td><td className="py-1.5 px-1 text-right tabular-nums">{c.s}</td><td className="py-1.5 px-1 text-right tabular-nums font-bold text-goal">{c.g || '—'}</td><td className="py-1.5 px-1 text-right tabular-nums">{c.s - c.g}</td><td className={`py-1.5 px-1 text-right tabular-nums ${svClass(c.s - c.g, c.s)}`}>{pct(c.s - c.g, c.s)}</td></tr>); })}
              <tr className="font-bold bg-slate-50 border-t-2 border-line"><td className="py-1.5 pr-3">TOTAL</td><td className="py-1.5 px-1 text-right tabular-nums">{tt.s}</td><td className="py-1.5 px-1 text-right tabular-nums text-goal">{tt.g || '—'}</td><td className="py-1.5 px-1 text-right tabular-nums">{tt.s - tt.g}</td><td className={`py-1.5 px-1 text-right tabular-nums ${svClass(tt.s - tt.g, tt.s)}`}>{pct(tt.s - tt.g, tt.s)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Goalies in this game + TOI */}
      <div className="card px-3 py-2">
        <h3 className="font-bold text-sm mb-1.5">🏒 Goalies in this game</h3>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[10px] uppercase tracking-wider text-mut border-b border-line"><th className="py-1.5 pr-2">Goalie</th><th className="py-1.5 px-1 text-right">Shots</th><th className="py-1.5 px-1 text-right">GA</th><th className="py-1.5 px-1 text-right">SV%</th><th className="py-1.5 px-1 text-right">Min</th><th className="py-1.5 px-1 text-right">GAA</th></tr></thead>
          <tbody>{(() => {
            const ids = new Set<string>(); game.events.forEach(e => ids.add(e.g)); if (game.goalieId) ids.add(game.goalieId);
            return Array.from(ids).map(gid => { let s = 0, gg = 0; game.events.forEach(e => { if (e.g === gid) { s++; if (e.t === 'goal') gg++; } }); const toi = (game.toi && +game.toi[gid]) || 0;
              return (<tr key={gid} className="border-b border-line/50"><td className="py-1.5 pr-2 font-medium flex items-center gap-1.5">{(() => { const gp = goalies.find(p => p.id === gid); return gp?.photo ? <img src={gp.photo} alt="" className="w-5 h-5 rounded-full object-cover bg-gray-200" /> : null; })()}{goalies.find(p => p.id === gid)?.name || '—'}</td><td className="py-1.5 px-1 text-right tabular-nums">{s}</td><td className="py-1.5 px-1 text-right tabular-nums font-bold text-goal">{gg || '—'}</td><td className={`py-1.5 px-1 text-right tabular-nums ${svClass(s - gg, s)}`}>{pct(s - gg, s)}</td><td className="py-1.5 px-1 text-right"><input type="number" min="0" max="300" step="0.5" value={toi || ''} onChange={e => setGameToi(game.id, gid, parseFloat(e.target.value) || 0)} placeholder="60" className="border border-line rounded px-1 py-0.5 w-12 text-right text-xs" /></td><td className="py-1.5 px-1 text-right tabular-nums">{gaa(gg, toi, 1)}</td></tr>);
            });
          })()}</tbody>
        </table>
      </div>

      {/* Result Input — key={game.id} resets uncontrolled inputs on game switch.
          GF input MUST have id="resGf": GA/dec handlers read it via getElementById. */}
      <div className="card px-3 py-1.5 flex flex-wrap gap-2 items-center" key={game.id}>
        <span className="font-bold text-xs">Result:</span>
        <input id="resGf" type="number" min="0" max="30" placeholder="GF" defaultValue={game.result?.gf ?? ''} onBlur={e => updateGameResult(game.id, +e.target.value || 0, +(document.getElementById('resGa') as HTMLInputElement)?.value || 0, (document.getElementById('resDec') as HTMLSelectElement)?.value || '')} className="border border-line rounded px-2 py-1 w-12 text-center text-xs" />
        <span className="text-mut text-xs">:</span>
        <input id="resGa" type="number" min="0" max="30" placeholder="GA" defaultValue={game.result?.ga ?? ''} onBlur={e => updateGameResult(game.id, +(document.getElementById('resGf') as HTMLInputElement)?.value || 0, +e.target.value || 0, (document.getElementById('resDec') as HTMLSelectElement)?.value || '')} className="border border-line rounded px-2 py-1 w-12 text-center text-xs" />
        <select id="resDec" defaultValue={game.result?.dec || ''} onChange={e => updateGameResult(game.id, +(document.getElementById('resGf') as HTMLInputElement)?.value || 0, +(document.getElementById('resGa') as HTMLInputElement)?.value || 0, e.target.value)} className="border border-line rounded px-2 py-1 text-xs bg-white"><option value="">—</option><option value="REG">REG</option><option value="OT">OT</option><option value="SO">SO</option></select>
      </div>
    </div>
  );
}

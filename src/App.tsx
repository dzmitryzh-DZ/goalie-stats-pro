import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { useStore, currentSeasonName } from './store';
import GamePage from './pages/GamePage';
import PeriodPage from './pages/PeriodPage';
import DashboardPage from './pages/DashboardPage';
import SeasonsPage from './pages/SeasonsPage';
import DataPanel from './components/DataPanel';
import { fmtDate } from './utils/stats';

const todayISO = () => new Date().toISOString().slice(0, 10);

// Общие классы тёмной темы
const INPUT = 'bg-panel2/70 border border-line/20 rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-acc/40 focus:border-acc';
const BTN_GHOST = 'px-3 py-1.5 rounded-lg text-xs font-semibold border border-line/20 text-mut hover:text-ink hover:bg-white/5 transition disabled:opacity-40';
const BTN_ICON = 'px-1.5 py-1 rounded border border-line/20 text-xs text-mut hover:text-ink hover:bg-white/5 transition';
const BTN_DANGER = 'px-1.5 py-1 rounded text-xs text-goal border border-goal/30 hover:bg-goal/10 transition';

// Логотип — стилизованная сетка ворот
function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 5h18v12a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V5Z" stroke="rgb(var(--acc))" strokeWidth="1.8" />
      <path d="M3 9.5h18M3 14h18M8 5v13.5M12 5v16M16 5v13.5" stroke="rgb(var(--acc) / 0.55)" strokeWidth="1.2" />
    </svg>
  );
}

// Компонент загрузки логотипа с ресайзом
function useLogoUpload(onLoad: (dataUrl: string) => void) {
  const ref = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 128 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        onLoad(c.toDataURL('image/png', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  return { ref, handle };
}

export default function App() {
  const games = useStore(s => s.games);
  const activeId = useStore(s => s.activeId);
  const setActiveGame = useStore(s => s.setActiveGame);
  const addGame = useStore(s => s.addGame);
  const deleteGame = useStore(s => s.deleteGame);
  const toggleMirror = useStore(s => s.toggleMirror);
  const mirror = useStore(s => s.mirror);
  const mergeData = useStore(s => s.mergeData);
  const updateGameInfo = useStore(s => s.updateGameInfo);
  const seasons = useStore(s => s.seasons);
  const teams = useStore(s => s.teams);
  const activeSeasonId = useStore(s => s.activeSeasonId);
  const setActiveSeason = useStore(s => s.setActiveSeason);
  const [dataOpen, setDataOpen] = useState(false);
  const [showSeasonModal, setShowSeasonModal] = useState(false);

  // New game modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newDate, setNewDate] = useState(todayISO());
  const [newOpp, setNewOpp] = useState('');

  // Edit game modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editOpp, setEditOpp] = useState('');

  const activeSeason = seasons.find(s => s.id === activeSeasonId) || null;
  const seasonTeam = activeSeason?.teamId ? teams.find(t => t.id === activeSeason.teamId) : null;
  const teamLogo = seasonTeam?.logo || null;

  // Drag & drop .json import
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !/\.json$/i.test(file.name)) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data && Array.isArray(data.games)) {
          const result = mergeData(data);
          alert(`✅ Imported: +${result.added} game(s), +${result.goaliesAdded} goalie(s)`);
        }
      } catch { alert('❌ Could not parse dropped JSON file'); }
    };
    reader.readAsText(file);
  }, [mergeData]);

  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    document.addEventListener('dragover', prevent);
    document.addEventListener('drop', handleDrop);
    return () => { document.removeEventListener('dragover', prevent); document.removeEventListener('drop', handleDrop); };
  }, [handleDrop]);

  const openNewModal = () => { setNewDate(todayISO()); setNewOpp(''); setShowNewModal(true); };
  const confirmNewGame = () => { addGame(newDate, newOpp.trim()); setShowNewModal(false); };

  const activeGame = games.find(g => g.id === activeId);
  const openEditModal = () => {
    if (!activeGame) return;
    setEditDate(activeGame.date);
    setEditOpp(activeGame.opponent);
    setShowEditModal(true);
  };
  const confirmEditGame = () => {
    if (!activeId) return;
    updateGameInfo(activeId, editDate, editOpp.trim());
    setShowEditModal(false);
  };

  // Sort games newest first, фильтр по активному сезону
  const sortedGames = [...games]
    .filter(g => !activeSeasonId || g.seasonId === activeSeasonId)
    .sort((a, b) => a.date > b.date ? -1 : 1);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-line/10 bg-[#0a0f1c]/85 backdrop-blur-md px-4 py-2.5 flex items-center gap-3">
        {teamLogo && <img src={teamLogo} alt="Team" className="w-7 h-7 rounded-lg bg-white/90 p-0.5 object-contain" />}
        <BrandMark />
        <div className="leading-tight">
          <h1 className="text-sm font-black tracking-wide uppercase">Goalie Stats Pro</h1>
          <div className="text-[10px] text-mut tracking-[0.18em] uppercase hidden sm:block">Shot chart zone analysis</div>
        </div>
        <div className="flex-1" />
        <select
          value={activeSeasonId || ''}
          onChange={e => setActiveSeason(e.target.value)}
          className="bg-panel2/70 border border-line/20 rounded-lg px-2 py-1 text-[11px] font-semibold text-ink focus:outline-none focus:border-acc max-w-[140px] truncate"
          title="Active season"
        >
          {seasons.map(s => <option key={s.id} value={s.id}>🏆 {s.name}</option>)}
        </select>
        <button onClick={() => setShowSeasonModal(true)} className={BTN_GHOST} title="Manage seasons & teams">⚙</button>
        <button onClick={toggleMirror} className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition ${mirror ? 'bg-acc text-[#0a0f1c] border-transparent' : 'border-line/20 text-mut hover:text-ink hover:bg-white/5'}`}>⇄ {mirror ? 'Left' : 'Right'}</button>
      </header>

      <div className="max-w-7xl mx-auto p-3 space-y-3 page-wrap">
        {/* Game Selector Bar */}
        <div className="card px-3 py-2 flex flex-wrap gap-2 items-center">
          <label className="text-[10px] uppercase tracking-[0.14em] font-semibold text-mut">Game{activeSeason ? ` · ${activeSeason.name}` : ''}</label>
          <select value={activeId || ''} onChange={e => setActiveGame(e.target.value)} className="flex-1 min-w-[180px] bg-panel2/70 border border-line/20 rounded-lg px-2 py-1.5 text-sm text-ink focus:outline-none focus:border-acc">
            {sortedGames.map(g => (
              <option key={g.id} value={g.id}>{fmtDate(g.date)}{g.opponent ? ` · ${g.opponent}` : ''}{g.result ? ` · ${g.result.gf}:${g.result.ga}` : ''}</option>
            ))}
          </select>
          <button onClick={openEditModal} disabled={!activeId} className={BTN_GHOST} title="Edit date / opponent of the selected game">✎ Edit</button>
          <button onClick={openNewModal} className="btn-primary px-3 py-1.5 rounded-lg text-xs font-bold transition">+ New</button>
          <button onClick={() => activeId && confirm('Delete this game?') && deleteGame(activeId)} className="btn-danger px-3 py-1.5 rounded-lg text-xs font-semibold border transition">Delete</button>
        </div>

        {/* New Game Modal */}
        {showNewModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowNewModal(false)}>
            <div className="bg-card border border-line/15 rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 space-y-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <h2 className="text-base font-bold">New Game{activeSeason ? ` · ${activeSeason.name}` : ''}</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.14em] font-semibold text-mut mb-1">Match date</label>
                  <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className={`w-full ${INPUT}`} autoFocus />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.14em] font-semibold text-mut mb-1">Opponent</label>
                  <input type="text" value={newOpp} onChange={e => setNewOpp(e.target.value)} placeholder="e.g. TOR, CSKA, Dynamo Mn..." onKeyDown={e => { if (e.key === 'Enter') confirmNewGame(); }} className={`w-full ${INPUT}`} />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setShowNewModal(false)} className={BTN_GHOST}>Cancel</button>
                <button onClick={confirmNewGame} disabled={!newDate} className="btn-primary px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-40">Create Game</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Game Modal */}
        {showEditModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowEditModal(false)}>
            <div className="bg-card border border-line/15 rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 space-y-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <h2 className="text-base font-bold">✎ Edit Game Info</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.14em] font-semibold text-mut mb-1">Match date</label>
                  <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className={`w-full ${INPUT}`} autoFocus />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.14em] font-semibold text-mut mb-1">Opponent</label>
                  <input type="text" value={editOpp} onChange={e => setEditOpp(e.target.value)} placeholder="e.g. TOR, CSKA, Dynamo Mn..." onKeyDown={e => { if (e.key === 'Enter') confirmEditGame(); }} className={`w-full ${INPUT}`} />
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button onClick={() => setShowEditModal(false)} className={BTN_GHOST}>Cancel</button>
                <button onClick={confirmEditGame} disabled={!editDate} className="btn-primary px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-40">Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {/* Seasons & Teams Manager Modal */}
        {showSeasonModal && (
          <SeasonTeamModal onClose={() => setShowSeasonModal(false)} />
        )}

        {/* Navigation Tabs */}
        <nav className="flex gap-1 border-b border-line/10 overflow-x-auto">
          {[
            { to: '/', label: 'Game' },
            { to: '/period', label: 'Season' },
            { to: '/dashboard', label: 'Dashboard' },
            { to: '/seasons', label: 'Seasons' },
          ].map(tab => (
            <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={({ isActive }) =>
              `px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] border-b-2 -mb-px transition whitespace-nowrap ${isActive ? 'text-acc border-acc' : 'text-mut border-transparent hover:text-ink'}`
            }>{tab.label}</NavLink>
          ))}
        </nav>

        {/* Page Content */}
        <main className="animate-in fade-in duration-200 page-content">
          <Routes>
            <Route path="/" element={<GamePage />} />
            <Route path="/period" element={<PeriodPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/seasons" element={<SeasonsPage />} />
          </Routes>
        </main>
      </div>

      {/* Collapsible Data Panel */}
      <div className="max-w-7xl mx-auto px-3 pb-3 data-panel-wrap">
        <button onClick={() => setDataOpen(!dataOpen)} className="w-full card px-3 py-2 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] font-semibold text-mut hover:text-ink transition">
          <span>Data Management</span>
          <span className="text-[10px]">{dataOpen ? '▲' : '▼'}</span>
        </button>
        {dataOpen && <div className="mt-2"><DataPanel /></div>}
      </div>

      <footer className="text-center text-[10px] text-mut/70 py-6 tracking-wide">
        Goalie Stats Pro · Auto-saved in browser · Drop .json to import
      </footer>
    </div>
  );
}

// ---------- Менеджер сезонов и команд ----------
function SeasonTeamModal({ onClose }: { onClose: () => void }) {
  const games = useStore(s => s.games);
  const seasons = useStore(s => s.seasons);
  const teams = useStore(s => s.teams);
  const activeSeasonId = useStore(s => s.activeSeasonId);
  const addSeason = useStore(s => s.addSeason);
  const renameSeason = useStore(s => s.renameSeason);
  const deleteSeason = useStore(s => s.deleteSeason);
  const setSeasonTeam = useStore(s => s.setSeasonTeam);
  const addTeam = useStore(s => s.addTeam);
  const renameTeam = useStore(s => s.renameTeam);
  const deleteTeam = useStore(s => s.deleteTeam);
  const setTeamLogoById = useStore(s => s.setTeamLogoById);

  const [newSeasonName, setNewSeasonName] = useState(currentSeasonName());
  const [newSeasonTeam, setNewSeasonTeam] = useState('');
  const [newTeamName, setNewTeamName] = useState('');

  const pendingLogoRef = useRef<((d: string) => void) | null>(null);
  const logoUp = useLogoUpload(dataUrl => {
    pendingLogoRef.current?.(dataUrl);
    pendingLogoRef.current = null;
  });
  const logoInputRef = logoUp.ref;

  const seasonGamesCount = (sid: string) => games.filter(g => g.seasonId === sid).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-line/15 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5 space-y-5 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">⚙ Seasons & Teams</h2>
          <button onClick={onClose} className={BTN_GHOST}>✕ Close</button>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Seasons */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-mut">🏆 Seasons</h3>
            <div className="space-y-2">
              {seasons.map(s => {
                const cnt = seasonGamesCount(s.id);
                const isActive = s.id === activeSeasonId;
                return (
                  <div key={s.id} className={`border rounded-xl p-2 space-y-1.5 ${isActive ? 'border-acc/50 bg-acc/5' : 'border-line/15'}`}>
                    <div className="flex items-center gap-2">
                      <input
                        value={s.name}
                        onChange={e => renameSeason(s.id, e.target.value)}
                        className="flex-1 min-w-0 bg-panel2/70 border border-line/20 rounded px-2 py-1 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-acc/40 focus:border-acc"
                      />
                      <span className="text-[10px] text-mut whitespace-nowrap">{cnt} game{cnt === 1 ? '' : 's'}</span>
                      <button
                        onClick={() => {
                          if (cnt > 0) { alert('❌ Season has games. Delete its games first.'); return; }
                          if (seasons.length <= 1) { alert('❌ At least one season is required.'); return; }
                          if (confirm(`Delete season "${s.name}"?`)) deleteSeason(s.id);
                        }}
                        className={BTN_DANGER}
                        title={cnt > 0 ? 'Has games — cannot delete' : 'Delete season'}
                      >✕</button>
                    </div>
                    <select
                      value={s.teamId || ''}
                      onChange={e => setSeasonTeam(s.id, e.target.value || undefined)}
                      className="w-full bg-panel2/70 border border-line/20 rounded px-2 py-1 text-xs text-mut focus:outline-none focus:border-acc"
                    >
                      <option value="">— no team —</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            <div className="border border-dashed border-line/25 rounded-xl p-2 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-mut">+ New season</div>
              <div className="flex gap-2">
                <input
                  value={newSeasonName}
                  onChange={e => setNewSeasonName(e.target.value)}
                  placeholder="e.g. 2026/27"
                  className="flex-1 min-w-0 bg-panel2/70 border border-line/20 rounded px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-acc/40 focus:border-acc"
                />
                <select
                  value={newSeasonTeam}
                  onChange={e => setNewSeasonTeam(e.target.value)}
                  className="bg-panel2/70 border border-line/20 rounded px-2 py-1 text-xs text-mut"
                >
                  <option value="">— no team —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button
                  onClick={() => { addSeason(newSeasonName, newSeasonTeam || undefined); setNewSeasonName(currentSeasonName()); setNewSeasonTeam(''); }}
                  className="btn-primary px-3 py-1 rounded text-xs font-bold transition whitespace-nowrap"
                >Add</button>
              </div>
            </div>
          </div>

          {/* Teams */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-mut">🛡 Teams</h3>
            <div className="space-y-2">
              {teams.map(t => {
                const usedBy = seasons.filter(s => s.teamId === t.id).length;
                return (
                  <div key={t.id} className="border border-line/15 rounded-xl p-2 flex items-center gap-2">
                    {t.logo
                      ? <img src={t.logo} alt={t.name} className="w-8 h-8 rounded-lg bg-white/90 p-0.5 object-contain shrink-0" />
                      : <div className="w-8 h-8 rounded-lg bg-panel2 flex items-center justify-center text-sm shrink-0">🛡</div>}
                    <input
                      value={t.name}
                      onChange={e => renameTeam(t.id, e.target.value)}
                      className="flex-1 min-w-0 bg-panel2/70 border border-line/20 rounded px-2 py-1 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-acc/40 focus:border-acc"
                    />
                    <button
                      onClick={() => { pendingLogoRef.current = (d) => setTeamLogoById(t.id, d); logoInputRef.current?.click(); }}
                      className={BTN_ICON}
                      title="Upload logo"
                    >🏷</button>
                    {t.logo && (
                      <button
                        onClick={() => setTeamLogoById(t.id, null)}
                        className={BTN_DANGER}
                        title="Remove logo"
                      >✕</button>
                    )}
                    <button
                      onClick={() => {
                        if (usedBy > 0) { alert(`❌ Team is used by ${usedBy} season(s). Detach it first.`); return; }
                        if (confirm(`Delete team "${t.name}"?`)) deleteTeam(t.id);
                      }}
                      className={BTN_DANGER}
                      title={usedBy > 0 ? 'Used by a season — cannot delete' : 'Delete team'}
                    >🗑</button>
                  </div>
                );
              })}
              {!teams.length && <div className="text-xs text-mut border border-dashed border-line/25 rounded-xl p-3 text-center">No teams yet</div>}
            </div>
            <div className="border border-dashed border-line/25 rounded-xl p-2 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-mut">+ New team</div>
              <div className="flex gap-2">
                <input
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="e.g. Dynamo Minsk"
                  onKeyDown={e => { if (e.key === 'Enter') { addTeam(newTeamName); setNewTeamName(''); } }}
                  className="flex-1 min-w-0 bg-panel2/70 border border-line/20 rounded px-2 py-1 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-acc/40 focus:border-acc"
                />
                <button
                  onClick={() => { addTeam(newTeamName); setNewTeamName(''); }}
                  className="btn-primary px-3 py-1 rounded text-xs font-bold transition whitespace-nowrap"
                >Add</button>
              </div>
            </div>
          </div>
        </div>

        <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={logoUp.handle} />
      </div>
    </div>
  );
}

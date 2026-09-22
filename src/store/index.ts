import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, Game, Goalie, Event, Team, Season } from '../types';

const uid = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

// Текущий хоккейный сезон по дате: стартует в июле–августе
export const currentSeasonName = () => {
  const d = new Date();
  const y = d.getFullYear();
  return d.getMonth() >= 6 ? `${y}/${String(y + 1).slice(2)}` : `${y - 1}/${String(y).slice(2)}`;
};

const mkGoalie = (name: string): Goalie => ({ id: uid(), name });
const mkTeam = (name: string): Team => ({ id: uid(), name, logo: null });
const mkSeason = (name: string, teamId?: string): Season => ({ id: uid(), name, teamId });
const mkGame = (date: string, opp: string, goalieId: string, seasonId?: string): Game => ({
  id: uid(), date, opponent: opp, events: [], goalieId, toi: {}, period: '1', result: null, seasonId,
});

interface Store extends AppState {
  // Actions
  setActiveGame: (id: string) => void;
  addGame: (date: string, opp: string) => void;
  deleteGame: (id: string) => void;
  updateGameResult: (id: string, gf: number, ga: number, dec: string) => void;
  updateGameInfo: (id: string, date: string, opponent: string) => void;

  addGoalie: (name: string) => void;
  renameGoalie: (id: string, name: string) => void;
  deleteGoalie: (id: string) => void;
  setGoaliePhoto: (id: string, photo: string | null) => void;

  setGameGoalie: (gameId: string, goalieId: string) => void;
  setGamePeriod: (gameId: string, p: string) => void;
  setGameToi: (gameId: string, goalieId: string, mins: number) => void;

  addEvent: (gameId: string, ev: Omit<Event, 'ts'>) => void;
  removeEvent: (gameId: string, index: number) => void;
  updateEvent: (gameId: string, index: number, patch: Partial<Event>) => void;
  undoLastEvent: (gameId: string) => void;

  toggleMirror: () => void;
  toggleLocked: () => void;
  setTeamLogo: (logo: string | null) => void;
  setAutoDiskSync: (on: boolean) => void;

  // Seasons & teams
  addSeason: (name: string, teamId?: string) => string;
  renameSeason: (id: string, name: string) => void;
  deleteSeason: (id: string) => boolean;
  setActiveSeason: (id: string) => void;
  setSeasonTeam: (id: string, teamId?: string) => void;
  addTeam: (name: string) => string;
  renameTeam: (id: string, name: string) => void;
  deleteTeam: (id: string) => boolean;
  setTeamLogoById: (id: string, logo: string | null) => void;

  importData: (data: AppState) => void;
  mergeData: (data: AppState) => { added: number; goaliesAdded: number };
  reset: () => void;
}

const initialState: AppState = {
  goalies: [],
  games: [],
  teams: [],
  seasons: [],
  activeSeasonId: null,
  activeId: null,
  lastGoalieId: null,
  mirror: false,
  locked: true,
  media: {},
  autoDiskSync: false,
};

// Дефолтная пара «команда + сезон» для пустого/мигрирующего состояния
const ensureSeasonPair = (s: Pick<AppState, 'teams' | 'seasons' | 'games' | 'activeSeasonId'>, teamName = 'My Team', seasonName?: string) => {
  let teams = [...(s.teams || [])];
  let seasons = [...(s.seasons || [])];
  if (!teams.length) {
    const t = mkTeam(teamName);
    t.logo = null;
    teams = [t];
  }
  if (!seasons.length) {
    seasons = [mkSeason(seasonName || currentSeasonName(), teams[0].id)];
  }
  const activeSeasonId = seasons.find(x => x.id === s.activeSeasonId) ? s.activeSeasonId! : seasons[0].id;
  const games = (s.games || []).map(g => ({ ...g, seasonId: g.seasonId || activeSeasonId }));
  return { teams, seasons, games, activeSeasonId };
};

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initialState,

      setActiveGame: (id) => set({ activeId: id }),

      addGame: (date, opp) => {
        const state = get();
        const gid = state.lastGoalieId || state.goalies[0]?.id || '';
        const g = mkGame(date, opp, gid, state.activeSeasonId || undefined);
        set({ games: [...state.games, g], activeId: g.id });
      },

      deleteGame: (id) => {
        const state = get();
        const games = state.games.filter(g => g.id !== id);
        if (!games.length) {
          const gid = state.lastGoalieId || state.goalies[0]?.id || '';
          games.push(mkGame(todayStr(), '', gid, state.activeSeasonId || undefined));
        }
        set({ games, activeId: games[0].id });
      },

      updateGameResult: (id, gf, ga, dec) => {
        set(state => ({
          games: state.games.map(g => g.id === id ? { ...g, result: { gf, ga, dec } } : g)
        }));
      },

      updateGameInfo: (id, date, opponent) => {
        set(state => ({
          games: state.games.map(g => g.id === id ? { ...g, date, opponent } : g)
        }));
      },

      addGoalie: (name) => {
        const p = mkGoalie(name);
        set(state => ({
          goalies: [...state.goalies, p],
          lastGoalieId: p.id,
          games: state.games.map(g => g.events.length === 0 && !g.result ? { ...g, goalieId: p.id } : g)
        }));
      },

      renameGoalie: (id, name) => {
        set(state => ({
          goalies: state.goalies.map(p => p.id === id ? { ...p, name } : p)
        }));
      },

      deleteGoalie: (id) => {
        const state = get();
        if (state.goalies.length <= 1) return;
        const other = state.goalies.find(p => p.id !== id)!;
        set({
          goalies: state.goalies.filter(p => p.id !== id),
          lastGoalieId: state.lastGoalieId === id ? other.id : state.lastGoalieId,
          games: state.games.map(g => ({
            ...g,
            goalieId: g.goalieId === id ? other.id : g.goalieId,
            events: g.events.map(e => e.g === id ? { ...e, g: other.id } : e)
          }))
        });
      },

      setGoaliePhoto: (id, photo) => {
        set(state => ({
          goalies: state.goalies.map(p => p.id === id ? { ...p, photo } : p)
        }));
      },

      setGameGoalie: (gameId, goalieId) => {
        set(state => ({
          lastGoalieId: goalieId,
          games: state.games.map(g => g.id === gameId ? { ...g, goalieId } : g)
        }));
      },

      setGamePeriod: (gameId, p) => {
        set(state => ({
          games: state.games.map(g => g.id === gameId ? { ...g, period: p } : g)
        }));
      },

      setGameToi: (gameId, goalieId, mins) => {
        set(state => ({
          games: state.games.map(g => g.id === gameId ? { ...g, toi: { ...g.toi, [goalieId]: mins } } : g)
        }));
      },

      addEvent: (gameId, ev) => {
        set(state => ({
          games: state.games.map(g => {
            if (g.id !== gameId) return g;
            return { ...g, events: [...g.events, { ...ev, ts: Date.now() }] };
          })
        }));
      },

      removeEvent: (gameId, index) => {
        set(state => ({
          games: state.games.map(g => {
            if (g.id !== gameId) return g;
            const events = [...g.events];
            events.splice(index, 1);
            return { ...g, events };
          })
        }));
      },

      updateEvent: (gameId, index, patch) => {
        set(state => ({
          games: state.games.map(g => {
            if (g.id !== gameId) return g;
            const events = [...g.events];
            events[index] = { ...events[index], ...patch };
            return { ...g, events };
          })
        }));
      },

      undoLastEvent: (gameId) => {
        set(state => ({
          games: state.games.map(g => {
            if (g.id !== gameId || !g.events.length) return g;
            return { ...g, events: g.events.slice(0, -1) };
          })
        }));
      },

      toggleMirror: () => set(state => ({ mirror: !state.mirror })),
      toggleLocked: () => set(state => ({ locked: !state.locked })),
      setTeamLogo: (logo) => set(state => ({ media: { ...state.media, teamLogo: logo } })),
      setAutoDiskSync: (on) => set({ autoDiskSync: on }),

      // ---- Seasons & teams ----

      addSeason: (name, teamId) => {
        const s = mkSeason(name.trim() || currentSeasonName(), teamId);
        set(state => ({ seasons: [...state.seasons, s], activeSeasonId: s.id }));
        return s.id;
      },

      renameSeason: (id, name) => {
        set(state => ({
          seasons: state.seasons.map(s => s.id === id ? { ...s, name } : s)
        }));
      },

      deleteSeason: (id) => {
        const state = get();
        if (state.seasons.length <= 1) return false;
        if (state.games.some(g => g.seasonId === id)) return false; // есть игры — нельзя
        const seasons = state.seasons.filter(s => s.id !== id);
        set({
          seasons,
          activeSeasonId: state.activeSeasonId === id ? seasons[0].id : state.activeSeasonId,
        });
        return true;
      },

      setActiveSeason: (id) => {
        const state = get();
        if (!state.seasons.find(s => s.id === id)) return;
        // При переключении сезона открываем последнюю игру этого сезона
        const seasonGames = state.games.filter(g => g.seasonId === id);
        const activeId = seasonGames.length ? seasonGames[seasonGames.length - 1].id : state.activeId;
        set({ activeSeasonId: id, activeId });
      },

      setSeasonTeam: (id, teamId) => {
        set(state => ({
          seasons: state.seasons.map(s => s.id === id ? { ...s, teamId } : s)
        }));
      },

      addTeam: (name) => {
        const t = mkTeam(name.trim() || 'Team');
        set(state => ({ teams: [...state.teams, t] }));
        return t.id;
      },

      renameTeam: (id, name) => {
        set(state => ({
          teams: state.teams.map(t => t.id === id ? { ...t, name } : t)
        }));
      },

      deleteTeam: (id) => {
        const state = get();
        if (state.seasons.some(s => s.teamId === id)) return false; // используется сезоном
        set({ teams: state.teams.filter(t => t.id !== id) });
        return true;
      },

      setTeamLogoById: (id, logo) => {
        set(state => ({
          teams: state.teams.map(t => t.id === id ? { ...t, logo } : t)
        }));
      },

      importData: (data) => {
        // Normalize imported data to ensure all required fields exist
        const normalized: AppState = {
          goalies: Array.isArray(data.goalies) ? data.goalies : [],
          games: Array.isArray(data.games) ? data.games.map(g => ({
            ...g,
            events: Array.isArray(g.events) ? g.events : [],
            toi: g.toi || {},
            period: g.period || '1',
            goalieId: g.goalieId || '',
            result: g.result || null,
          })) : [],
          teams: Array.isArray(data.teams) ? data.teams : [],
          seasons: Array.isArray(data.seasons) ? data.seasons : [],
          activeSeasonId: data.activeSeasonId || null,
          activeId: data.activeId || null,
          lastGoalieId: data.lastGoalieId || null,
          mirror: !!data.mirror,
          locked: typeof data.locked === 'boolean' ? data.locked : true,
          media: data.media || {},
          autoDiskSync: !!data.autoDiskSync,
        };
        // Ensure at least one goalie
        if (!normalized.goalies.length) {
          normalized.goalies = [mkGoalie('Goalie 1')];
          normalized.lastGoalieId = normalized.goalies[0].id;
        }
        // Ensure season/team pair and assign games without season
        const pair = ensureSeasonPair(normalized);
        normalized.teams = pair.teams;
        normalized.seasons = pair.seasons;
        normalized.games = pair.games;
        normalized.activeSeasonId = pair.activeSeasonId;
        // Ensure at least one game
        if (!normalized.games.length) {
          const g = mkGame(todayStr(), '', normalized.goalies[0].id, normalized.activeSeasonId || undefined);
          normalized.games = [g];
        }
        // Fix activeId
        if (!normalized.activeId || !normalized.games.find(g => g.id === normalized.activeId)) {
          normalized.activeId = normalized.games[normalized.games.length - 1].id;
        }
        if (!normalized.lastGoalieId) {
          normalized.lastGoalieId = normalized.goalies[0].id;
        }
        set(normalized);
      },

      mergeData: (data) => {
        const state = get();
        // Merge goalies by name
        const goalieMap: Record<string, string> = {};
        (data.goalies || []).forEach((gp: Goalie) => {
          const existing = state.goalies.find(p => p.name === gp.name);
          if (existing) {
            goalieMap[gp.id] = existing.id;
          } else {
            const newId = uid();
            goalieMap[gp.id] = newId;
          }
        });
        const newGoalies = (data.goalies || [])
          .filter((gp: Goalie) => !state.goalies.find(p => p.name === gp.name))
          .map((gp: Goalie) => ({ ...gp, id: goalieMap[gp.id] }));

        // Merge teams by name
        const teamMap: Record<string, string> = {};
        (data.teams || []).forEach((tm: Team) => {
          const existing = state.teams.find(t => t.name === tm.name);
          if (existing) {
            teamMap[tm.id] = existing.id;
          } else {
            const newId = uid();
            teamMap[tm.id] = newId;
          }
        });
        const newTeams = (data.teams || [])
          .filter((tm: Team) => !state.teams.find(t => t.name === tm.name))
          .map((tm: Team) => ({ ...tm, id: teamMap[tm.id] }));

        // Merge seasons by name (+ team mapping)
        const seasonMap: Record<string, string> = {};
        (data.seasons || []).forEach((sn: Season) => {
          const mappedTeamId = sn.teamId ? teamMap[sn.teamId] || sn.teamId : undefined;
          const existing = state.seasons.find(s => s.name === sn.name && (s.teamId || '') === (mappedTeamId || ''));
          if (existing) {
            seasonMap[sn.id] = existing.id;
          } else {
            const newId = uid();
            seasonMap[sn.id] = newId;
          }
        });
        const seasonExists = (sn: Season) => {
          const mappedTeamId = sn.teamId ? teamMap[sn.teamId] || sn.teamId : undefined;
          return !!state.seasons.find(s => s.name === sn.name && (s.teamId || '') === (mappedTeamId || ''));
        };
        const newSeasons = (data.seasons || [])
          .filter((sn: Season) => !seasonExists(sn))
          .map((sn: Season) => ({
            ...sn,
            id: seasonMap[sn.id],
            teamId: sn.teamId ? teamMap[sn.teamId] || sn.teamId : undefined,
          }));

        // Merge games (skip duplicates by date+opponent within same season)
        const existingKeys = new Set(state.games.map(g => `${g.seasonId || ''}|${g.date}|${(g.opponent||'').toLowerCase()}`));
        const fallbackSeason = state.activeSeasonId || state.seasons[0]?.id || '';
        const newGames = (data.games || [])
          .filter((gm: Game) => !existingKeys.has(`${seasonMap[gm.seasonId || ''] || gm.seasonId || ''}|${gm.date}|${(gm.opponent||'').toLowerCase()}`))
          .map((gm: Game) => ({
            ...gm,
            id: uid(),
            seasonId: seasonMap[gm.seasonId || ''] || gm.seasonId || fallbackSeason,
            goalieId: goalieMap[gm.goalieId] || state.goalies[0]?.id || '',
            events: (gm.events || []).map(e => ({
              ...e,
              g: goalieMap[e.g] || gm.goalieId || state.goalies[0]?.id || '',
            })),
            toi: gm.toi || {},
            period: gm.period || '1',
            result: gm.result || null,
          }));

        set({
          goalies: [...state.goalies, ...newGoalies],
          teams: [...state.teams, ...newTeams],
          seasons: [...state.seasons, ...newSeasons],
          games: [...state.games, ...newGames],
          activeId: newGames.length ? newGames[newGames.length - 1].id : state.activeId,
        });
        return { added: newGames.length, goaliesAdded: newGoalies.length };
      },

      reset: () => set(initialState),
    }),
    {
      name: 'goalieZoneStatsV2',
      version: 2,
      migrate: (persisted: any) => {
        // v1 -> v2: добавляем teams/seasons, привязываем игры к сезону
        persisted.teams = Array.isArray(persisted.teams) ? persisted.teams : [];
        persisted.seasons = Array.isArray(persisted.seasons) ? persisted.seasons : [];
        persisted.activeSeasonId = persisted.activeSeasonId || null;
        if (!persisted.goalies?.length) {
          persisted.goalies = [mkGoalie('Goalie 1')];
          persisted.lastGoalieId = persisted.goalies[0].id;
        }
        if (!persisted.games?.length) {
          persisted.games = [mkGame(todayStr(), '', persisted.goalies[0].id, persisted.activeSeasonId || undefined)];
          persisted.activeId = persisted.games[0].id;
        }
        if (!persisted.activeId) persisted.activeId = persisted.games[persisted.games.length - 1].id;
        // Дефолтная команда забирает старый логотип из media.teamLogo
        if (!persisted.teams.length) {
          const t = mkTeam('My Team');
          t.logo = persisted.media?.teamLogo || null;
          persisted.teams = [t];
        }
        if (!persisted.seasons.length) {
          persisted.seasons = [mkSeason(currentSeasonName(), persisted.teams[0].id)];
        }
        const sid = persisted.seasons[0].id;
        persisted.activeSeasonId = persisted.activeSeasonId || sid;
        persisted.games = persisted.games.map((g: Game) => ({ ...g, seasonId: g.seasonId || sid }));
        return persisted as AppState;
      },
    }
  )
);

// Helper selectors
export const useActiveGame = () => useStore(state => {
  return state.games.find(g => g.id === state.activeId) || null;
});

export const useGoalieName = (id: string) => useStore(state => {
  return state.goalies.find(p => p.id === id)?.name || '—';
});

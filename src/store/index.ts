import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState, Game, Goalie, Event } from '../types';

const uid = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const mkGoalie = (name: string): Goalie => ({ id: uid(), name });
const mkGame = (date: string, opp: string, goalieId: string): Game => ({
  id: uid(), date, opponent: opp, events: [], goalieId, toi: {}, period: '1', result: null,
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

  importData: (data: AppState) => void;
  mergeData: (data: AppState) => { added: number; goaliesAdded: number };
  reset: () => void;
}

const initialState: AppState = {
  goalies: [],
  games: [],
  activeId: null,
  lastGoalieId: null,
  mirror: false,
  locked: true,
  media: {},
  autoDiskSync: false,
};

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...initialState,

      setActiveGame: (id) => set({ activeId: id }),

      addGame: (date, opp) => {
        const state = get();
        const gid = state.lastGoalieId || state.goalies[0]?.id || '';
        const g = mkGame(date, opp, gid);
        set({ games: [...state.games, g], activeId: g.id });
      },

      deleteGame: (id) => {
        const state = get();
        const games = state.games.filter(g => g.id !== id);
        if (!games.length) {
          const gid = state.lastGoalieId || state.goalies[0]?.id || '';
          games.push(mkGame(todayStr(), '', gid));
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
        // Ensure at least one game
        if (!normalized.games.length) {
          normalized.games = [mkGame(todayStr(), '', normalized.goalies[0].id)];
        }
        // Fix activeId
        if (!normalized.activeId || !normalized.games.find(g => g.id === normalized.activeId)) {
          normalized.activeId = normalized.games[0].id;
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
            // Will be added below
          }
        });
        const newGoalies = (data.goalies || [])
          .filter((gp: Goalie) => !state.goalies.find(p => p.name === gp.name))
          .map((gp: Goalie) => ({ ...gp, id: goalieMap[gp.id] }));

        // Merge games (skip duplicates by date+opponent)
        const existingKeys = new Set(state.games.map(g => `${g.date}|${(g.opponent||'').toLowerCase()}`));
        const newGames = (data.games || [])
          .filter((gm: Game) => !existingKeys.has(`${gm.date}|${(gm.opponent||'').toLowerCase()}`))
          .map((gm: Game) => ({
            ...gm,
            id: uid(),
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
          games: [...state.games, ...newGames],
          activeId: newGames.length ? newGames[newGames.length - 1].id : state.activeId,
        });
        return { added: newGames.length, goaliesAdded: newGoalies.length };
      },

      reset: () => set(initialState),
    }),
    {
      name: 'goalieZoneStatsV2',
      version: 1,
      migrate: (persisted: any) => {
        // Migration from v1 localStorage if needed could go here
        // For now just ensure structure
        if (!persisted.goalies?.length) {
          persisted.goalies = [mkGoalie('Goalie 1')];
          persisted.lastGoalieId = persisted.goalies[0].id;
        }
        if (!persisted.games?.length) {
          persisted.games = [mkGame(todayStr(), '', persisted.goalies[0].id)];
          persisted.activeId = persisted.games[0].id;
        }
        if (!persisted.activeId) persisted.activeId = persisted.games[0].id;
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

export interface Goalie {
  id: string;
  name: string;
  photo?: string | null;
}

export interface Event {
  ts: number;
  z: number;       // zone id
  t: 'save' | 'goal';
  g: string;       // goalie id
  p: string;       // period
  time?: string | null; // mm:ss
  str?: string;    // strength (for goals)
  tgt?: string;    // target (for goals)
  play?: string[]; // play types (for goals)
}

export interface GameResult {
  gf: number;
  ga: number;
  dec?: string;    // REG | OT | SO
}

// Команда (своя) — логотип и название для сезона
export interface Team {
  id: string;
  name: string;
  logo?: string | null;
}

// Сезон — игры привязаны к сезону, сезон — к команде
export interface Season {
  id: string;
  name: string;
  teamId?: string;
}

export interface Game {
  id: string;
  date: string;
  opponent: string;
  events: Event[];
  goalieId: string;
  toi: Record<string, number>; // goalieId -> minutes
  period: string;
  result?: GameResult | null;
  seasonId?: string; // принадлежность к сезону
}

export interface AppState {
  goalies: Goalie[];
  games: Game[];
  teams: Team[];
  seasons: Season[];
  activeSeasonId: string | null;
  activeId: string | null;
  lastGoalieId: string | null;
  mirror: boolean;
  locked: boolean;
  media: { teamLogo?: string | null };
  autoDiskSync?: boolean;
}

export const ZONES = [
  { id: 1, name: 'Left flank — far', tier: 'sel' },
  { id: 2, name: 'Point — center far', tier: 'sel' },
  { id: 3, name: 'Slot between circles', tier: 'sel' },
  { id: 4, name: 'Right flank — far', tier: 'sel' },
  { id: 5, name: 'Left angle — near', tier: 'sel' },
  { id: 6, name: 'Crease / slot at net', tier: 'sel' },
  { id: 7, name: 'Right angle — near', tier: 'sel' },
  { id: 8, name: 'Middle zone', tier: 'tot' },
  { id: 9, name: 'Far zone', tier: 'tot' },
  { id: 10, name: 'Behind the net', tier: 'tot' },
] as const;

export const PERIODS = ['1', '2', '3', 'OT', 'SO'];

export const STRENGTHS = [
  { id: '5x5', grp: 'even' }, { id: '4x4', grp: 'even' }, { id: '3x3', grp: 'even' },
  { id: '4x5', grp: 'pk' }, { id: '3x5', grp: 'pk' }, { id: '3x4', grp: 'pk' },
  { id: '5x4', grp: 'pp' }, { id: '5x3', grp: 'pp' }, { id: '4x3', grp: 'pp' },
  { id: '5x6', grp: 'ea' }, { id: '4x6', grp: 'ea' },
  { id: '1x0', grp: 'ps' },
];

export const TARGETS = [
  'Under Crossbar','Head Shot','High Blocker','Chest Shot','High Glove',
  'Low Blocker','Low Glove','Right Pad','5 Hole','Left Pad','Open Net','Stick','Backdoor'
];

export const PLAYS = [
  'Clear Shots','Rebound','Entry','Breakaway','X-Cross Pass','Below Goal Line',
  'Tip / Deflection','Low-High','X-Cross Low','Net Drive','Turnover','2-1 / 3-2','Screen','One Timer'
];

// SVG rink geometry
export const ZONE_PATHS: Record<number, string> = {
  1: 'M75 40 H875 V595 H485 V705 H75 Z',
  2: 'M75 705 H485 V1690 H75 Z',
  3: 'M485 595 H875 V1815 H485 Z',
  4: 'M75 1690 H485 V1815 H875 V2360 H75 Z',
  5: 'M875 40 H1180 Q1400 40 1430 200 V915 L875 595 Z',
  6: 'M875 595 L1430 915 V1485 L875 1815 Z',
  7: 'M875 1815 L1430 1485 V2200 Q1400 2360 1180 2360 H875 Z',
  10: 'M1430 160 Q1693 200 1693 520 V1880 Q1693 2200 1430 2240 Z',
};

export const LABEL_POS: Record<number, [number, number]> = {
  1: [430, 300], 2: [280, 1180], 3: [680, 1180], 4: [430, 2080],
  5: [1150, 430], 6: [1150, 1180], 7: [1150, 1960], 10: [1560, 1200],
};

export const RINK_BOUNDS = [
  'M75 705 H485', 'M75 1690 H485',
  'M485 595 V1815', 'M485 595 H875', 'M485 1815 H875',
  'M875 75 V2320', 'M875 595 L1430 915', 'M875 1815 L1430 1485',
];

export const STR_GRP_COLORS: Record<string, string> = {
  even: '#4763ff', pk: '#e04a3f', pp: '#57f25a', ea: '#4de3f7', ps: '#f5f05a',
};

export const STR_GRP_NAMES: Record<string, string> = {
  even: 'Even strength', pk: 'Shorthanded (PK)', pp: 'Power play (PP)', ea: 'Extra attacker', ps: 'Penalty shot',
};

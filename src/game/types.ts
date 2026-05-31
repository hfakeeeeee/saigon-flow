export type Tool = 'road' | 'erase';
export type Cell = { x: number; y: number };
export type Direction = 'up' | 'right' | 'down' | 'left';
export type ColorKey = 'coral' | 'teal' | 'gold' | 'violet';
export type VehicleState = 'outbound' | 'returning';
export type GamePhase = 'running' | 'paused' | 'over';
export type RoadOwner = ColorKey | 'mixed' | null;

export type Building = {
  id: string;
  kind: 'home' | 'shop';
  color: ColorKey;
  x: number;
  y: number;
  cooldown?: number;
  vehicleSlots?: number;
  demand?: number;
  capacity?: number;
  nextDemand?: number;
  overloadSeconds?: number;
  exit?: Direction;
};

export type Vehicle = {
  id: string;
  color: ColorKey;
  homeId: string;
  shopId: string;
  state: VehicleState;
  x: number;
  y: number;
  path: Cell[];
  targetIndex: number;
  speed: number;
};

export type Toast = {
  message: string;
  ttl: number;
};

export type GameState = {
  phase: GamePhase;
  score: number;
  bestScore: number;
  day: number;
  week: number;
  nextRoadGrantDay: number;
  roadTiles: number;
  spawnTimer: number;
  elapsed: number;
  houses: Building[];
  shops: Building[];
  vehicles: Vehicle[];
  roads: Set<string>;
  roadEdges: Set<string>;
  water: Set<string>;
  parks: Set<string>;
  toast: Toast | null;
  nextVehicleId: number;
  nextBuildingId: number;
};

export type HudState = {
  phase: GamePhase;
  score: number;
  bestScore: number;
  day: number;
  week: number;
  roadTiles: number;
  activeVehicles: number;
  pressure: number;
  toast: Toast | null;
};

export type Tool = 'road' | 'erase';
export type Cell = { x: number; y: number };
export type Direction = 'up' | 'right' | 'down' | 'left';
export type ColorKey = 'coral' | 'teal' | 'gold' | 'violet';
export type VehicleState = 'outbound' | 'returning';
export type GamePhase = 'running' | 'paused' | 'upgrade' | 'over';
export type RoadOwner = ColorKey | 'mixed' | null;
export type UpgradeKind = 'roads' | 'bridge' | 'motorway' | 'roundabout';

export type UpgradeOption = {
  kind: UpgradeKind;
  label: string;
  description: string;
  amount: number;
};

export type Motorway = {
  id: string;
  a: Cell;
  b: Cell;
};

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
  weekDayIndex: number;
  weekProgress: number;
  nextRoadGrantDay: number;
  roadTiles: number;
  bridges: number;
  motorwaysAvailable: number;
  roundaboutsAvailable: number;
  spawnTimer: number;
  elapsed: number;
  houses: Building[];
  shops: Building[];
  vehicles: Vehicle[];
  roads: Set<string>;
  roadEdges: Set<string>;
  bridgeTiles: Set<string>;
  roundabouts: Set<string>;
  motorways: Motorway[];
  water: Set<string>;
  parks: Set<string>;
  upgradeOptions: UpgradeOption[];
  toast: Toast | null;
  nextVehicleId: number;
  nextBuildingId: number;
  nextMotorwayId: number;
};

export type HudState = {
  phase: GamePhase;
  score: number;
  bestScore: number;
  day: number;
  week: number;
  weekDayIndex: number;
  weekProgress: number;
  roadTiles: number;
  bridges: number;
  motorwaysAvailable: number;
  roundaboutsAvailable: number;
  activeVehicles: number;
  pressure: number;
  upgradeOptions: UpgradeOption[];
  toast: Toast | null;
};

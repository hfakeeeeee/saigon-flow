import { GRID_H, GRID_W, STORAGE_KEY } from './constants';
import { cellInDirection, centerOf, hasRoadEdge, keyOf, neighborsOf, roadConnections, setBuildingExit } from './grid';
import { getVehicleLane } from './lane';
import type { Building, Cell, ColorKey, GameState, HudState, RoadOwner, UpgradeKind, UpgradeOption, Vehicle } from './types';

const HOME_VEHICLE_SLOTS = 2;
const WEEK_LENGTH_DAYS = 7;
const WEEKLY_ROAD_GRANT = 24;
const WEEKLY_BASE_ROADS = 10;
const TIME_SCALE = 1.16;
const UPGRADE_OPTIONS: UpgradeOption[] = [
  { kind: 'roads', label: 'Road Tiles', description: '+24 roads', amount: WEEKLY_ROAD_GRANT },
  { kind: 'bridge', label: 'Bridge', description: '+2 bridge spans, +10 roads', amount: 2 },
  { kind: 'motorway', label: 'Motorway', description: '+1 fast connector, +10 roads', amount: 1 },
  { kind: 'roundabout', label: 'Roundabout', description: '+2 junction controls, +10 roads', amount: 2 },
];

const makeTerrain = () => {
  const water = new Set<string>();
  const parks = new Set<string>();

  for (let x = 0; x < 30; x += 1) {
    if (x < 9 || x > 12) water.add(keyOf(x, 8));
    if (x > 16 && x < 25) water.add(keyOf(x, 4));
  }

  for (let y = 10; y < 16; y += 1) {
    if (y !== 13) water.add(keyOf(22, y));
  }

  [
    [7, 2],
    [8, 2],
    [7, 3],
    [8, 3],
    [17, 15],
    [18, 15],
    [17, 16],
    [18, 16],
    [25, 7],
    [26, 7],
    [25, 8],
    [26, 8],
  ].forEach(([x, y]) => parks.add(keyOf(x, y)));

  return { water, parks };
};

const starterLayouts: Array<{ home: Cell; shop: Cell; color: ColorKey }> = [
  { home: { x: 2, y: 3 }, shop: { x: 13, y: 4 }, color: 'coral' },
  { home: { x: 27, y: 2 }, shop: { x: 20, y: 14 }, color: 'teal' },
  { home: { x: 4, y: 14 }, shop: { x: 11, y: 11 }, color: 'gold' },
  { home: { x: 26, y: 12 }, shop: { x: 15, y: 3 }, color: 'violet' },
];

const addShopDriveway = (game: GameState, shop: Building) => {
  const options = neighborsOf(shop).filter((cell) => {
    const key = keyOf(cell.x, cell.y);
    return (
      cell.x > 0 &&
      cell.y > 0 &&
      cell.x < GRID_W - 1 &&
      cell.y < GRID_H - 1 &&
      !game.parks.has(key) &&
      !game.water.has(key) &&
      !game.roads.has(key) &&
      !game.houses.some((house) => house.x === cell.x && house.y === cell.y) &&
      !game.shops.some((otherShop) => otherShop.id !== shop.id && otherShop.x === cell.x && otherShop.y === cell.y)
    );
  });

  const driveway = options[(shop.x * 3 + shop.y * 5) % Math.max(1, options.length)];
  if (!driveway) return;

  game.roads.add(keyOf(driveway.x, driveway.y));
  setBuildingExit(game, shop, driveway);
};

export const makeGame = (): GameState => {
  const bestScore = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
  const { water, parks } = makeTerrain();
  const starter = starterLayouts[Math.floor(Math.random() * starterLayouts.length)];
  const game: GameState = {
    phase: 'running',
    score: 0,
    bestScore,
    day: 1,
    week: 1,
    weekDayIndex: 0,
    weekProgress: 0,
    nextRoadGrantDay: WEEK_LENGTH_DAYS + 1,
    roadTiles: 64,
    bridges: 0,
    motorwaysAvailable: 0,
    roundaboutsAvailable: 0,
    spawnTimer: 17,
    elapsed: 0,
    houses: [
      { id: 'h-1', kind: 'home', color: starter.color, x: starter.home.x, y: starter.home.y, vehicleSlots: HOME_VEHICLE_SLOTS },
    ],
    shops: [
      {
        id: 's-1',
        kind: 'shop',
        color: starter.color,
        x: starter.shop.x,
        y: starter.shop.y,
        demand: 2,
        capacity: 7,
        nextDemand: 3.8,
        overloadSeconds: 0,
      },
    ],
    vehicles: [],
    roads: new Set<string>(),
    roadEdges: new Set<string>(),
    bridgeTiles: new Set<string>(),
    roundabouts: new Set<string>(),
    motorways: [],
    water,
    parks,
    upgradeOptions: [],
    toast: { message: 'Saigon Flow', ttl: 2.6 },
    nextVehicleId: 1,
    nextBuildingId: 2,
    nextMotorwayId: 1,
  };

  game.shops.forEach((shop) => addShopDriveway(game, shop));
  return game;
};

const adjacentRoads = (game: GameState, building: Building) =>
  building.exit
    ? [cellInDirection(building, building.exit)].filter((cell) => game.roads.has(keyOf(cell.x, cell.y)))
    : [];

const findRoadPath = (game: GameState, start: Cell, goal: Cell) => {
  const startKey = keyOf(start.x, start.y);
  const goalKey = keyOf(goal.x, goal.y);
  const queue = [start];
  const cameFrom = new Map<string, string | null>([[startKey, null]]);

  while (queue.length > 0) {
    const current = queue.shift() as Cell;
    const currentKey = keyOf(current.x, current.y);

    if (currentKey === goalKey) break;

    const nextCells = neighborsOf(current).filter((next) => hasRoadEdge(game, current, next));
    for (const motorway of game.motorways) {
      const currentKeyForMotorway = keyOf(current.x, current.y);
      if (currentKeyForMotorway === keyOf(motorway.a.x, motorway.a.y)) nextCells.push(motorway.b);
      if (currentKeyForMotorway === keyOf(motorway.b.x, motorway.b.y)) nextCells.push(motorway.a);
    }

    for (const next of nextCells) {
      const nextKey = keyOf(next.x, next.y);
      if (!game.roads.has(nextKey) || cameFrom.has(nextKey)) continue;
      cameFrom.set(nextKey, currentKey);
      queue.push(next);
    }
  }

  if (!cameFrom.has(goalKey)) return null;

  const path: Cell[] = [];
  let cursor: string | null = goalKey;
  while (cursor) {
    const [x, y] = cursor.split(',').map(Number);
    path.push({ x, y });
    cursor = cameFrom.get(cursor) ?? null;
  }

  return path.reverse();
};

const makeVehiclePath = (game: GameState, home: Building, shop: Building) => {
  const starts = adjacentRoads(game, home);
  const goals = adjacentRoads(game, shop);
  let bestPath: Cell[] | null = null;

  for (const start of starts) {
    for (const goal of goals) {
      const roadPath = findRoadPath(game, start, goal);
      if (!roadPath) continue;
      if (!bestPath || roadPath.length < bestPath.length) bestPath = roadPath;
    }
  }

  if (!bestPath) return null;
  return [{ x: home.x, y: home.y }, ...bestPath, { x: shop.x, y: shop.y }];
};

const addToast = (game: GameState, message: string) => {
  game.toast = { message, ttl: 2.2 };
};

const openUpgradePicker = (game: GameState) => {
  game.phase = 'upgrade';
  const start = (game.week * 3 + game.score) % UPGRADE_OPTIONS.length;
  game.upgradeOptions = [UPGRADE_OPTIONS[start], UPGRADE_OPTIONS[(start + 1 + game.week) % UPGRADE_OPTIONS.length]];
  addToast(game, `Week ${game.week} upgrades`);
};

export const chooseUpgrade = (game: GameState, kind: UpgradeKind) => {
  const option = game.upgradeOptions.find((item) => item.kind === kind);
  if (!option) return;

  if (option.kind === 'roads') game.roadTiles += option.amount;
  if (option.kind !== 'roads') game.roadTiles += WEEKLY_BASE_ROADS;
  if (option.kind === 'bridge') game.bridges += option.amount;
  if (option.kind === 'motorway') game.motorwaysAvailable += option.amount;
  if (option.kind === 'roundabout') game.roundaboutsAvailable += option.amount;

  game.upgradeOptions = [];
  game.phase = 'running';
  addToast(game, `${option.label} +${option.amount}`);
};

export const pressureOf = (game: GameState) =>
  game.shops.reduce((max, shop) => Math.max(max, (shop.demand ?? 0) / (shop.capacity ?? 1)), 0);

export const roadOwnerMap = (game: GameState) => {
  const owners = new Map<string, RoadOwner>();
  const distances = new Map<string, number>();
  const queue: Array<{ cell: Cell; color: ColorKey; distance: number }> = [];

  for (const home of game.houses) {
    if (!home.exit) continue;
    const next = cellInDirection(home, home.exit);
    const nextKey = keyOf(next.x, next.y);
    if (game.roads.has(nextKey)) queue.push({ cell: next, color: home.color, distance: 0 });
  }

  while (queue.length > 0) {
    const item = queue.shift() as { cell: Cell; color: ColorKey; distance: number };
    const itemKey = keyOf(item.cell.x, item.cell.y);
    const knownDistance = distances.get(itemKey);
    const knownOwner = owners.get(itemKey);

    if (knownDistance !== undefined && knownDistance < item.distance) continue;

    if (knownDistance === item.distance && knownOwner && knownOwner !== item.color) {
      owners.set(itemKey, 'mixed');
      continue;
    }

    if (knownDistance === undefined || item.distance < knownDistance) {
      distances.set(itemKey, item.distance);
      owners.set(itemKey, item.color);

      for (const next of neighborsOf(item.cell)) {
        if (game.roads.has(keyOf(next.x, next.y)) && hasRoadEdge(game, item.cell, next)) {
          queue.push({ cell: next, color: item.color, distance: item.distance + 1 });
        }
      }

      for (const motorway of game.motorways) {
        const itemKeyForMotorway = keyOf(item.cell.x, item.cell.y);
        if (itemKeyForMotorway === keyOf(motorway.a.x, motorway.a.y)) {
          queue.push({ cell: motorway.b, color: item.color, distance: item.distance + 1 });
        }
        if (itemKeyForMotorway === keyOf(motorway.b.x, motorway.b.y)) {
          queue.push({ cell: motorway.a, color: item.color, distance: item.distance + 1 });
        }
      }
    }
  }

  return owners;
};

const spawnBuilding = (game: GameState) => {
  const colorCycle: ColorKey[] = ['coral', 'teal', 'gold', 'violet'];
  const occupied = new Set([
    ...game.houses.map((b) => keyOf(b.x, b.y)),
    ...game.shops.map((b) => keyOf(b.x, b.y)),
    ...Array.from(game.roads),
    ...Array.from(game.water),
    ...Array.from(game.parks),
  ]);

  const buildings = [...game.houses, ...game.shops];
  const distanceToNearestBuilding = (cell: Cell) =>
    buildings.reduce(
      (nearest, building) => Math.min(nearest, Math.abs(cell.x - building.x) + Math.abs(cell.y - building.y)),
      Number.POSITIVE_INFINITY,
    );

  let candidates: Cell[] = [];
  for (let y = 1; y < GRID_H - 1; y += 1) {
    for (let x = 1; x < GRID_W - 1; x += 1) {
      const cell = { x, y };
      if (occupied.has(keyOf(x, y))) continue;
      if (distanceToNearestBuilding(cell) < 3) continue;
      candidates.push(cell);
    }
  }

  if (candidates.length === 0) {
    candidates = [];
    for (let y = 1; y < GRID_H - 1; y += 1) {
      for (let x = 1; x < GRID_W - 1; x += 1) {
        if (!occupied.has(keyOf(x, y))) candidates.push({ x, y });
      }
    }
  }

  if (candidates.length === 0) return;

  candidates.sort((a, b) => {
    const distanceScore = distanceToNearestBuilding(b) - distanceToNearestBuilding(a);
    if (distanceScore !== 0) return distanceScore;
    return Math.abs(a.x - 15) + Math.abs(a.y - 9) - (Math.abs(b.x - 15) + Math.abs(b.y - 9));
  });

  const spot = candidates[(game.nextBuildingId * 7) % Math.min(candidates.length, 9)];
  if (!spot) return;

  const balance = colorCycle.map((color) => {
    const houses = game.houses.filter((home) => home.color === color).length;
    const shops = game.shops.filter((shop) => shop.color === color).length;
    const pressure = game.shops
      .filter((shop) => shop.color === color)
      .reduce((sum, shop) => sum + (shop.demand ?? 0) / (shop.capacity ?? 7), 0);

    return { color, houses, shops, pressure, supportGap: shops * 2 - houses };
  });

  const weakestColor = [...balance].sort((a, b) => {
    if (b.supportGap !== a.supportGap) return b.supportGap - a.supportGap;
    return b.pressure - a.pressure;
  })[0].color;
  const supportedColors = balance
    .filter((item) => item.houses >= Math.max(1, item.shops * 2) && item.shops < 4)
    .sort((a, b) => a.shops - b.shops || b.houses - a.houses);

  const shouldSpawnShop =
    supportedColors.length > 0 &&
    game.houses.length >= game.shops.length * 2 + 2 &&
    game.nextBuildingId % 4 === 0;
  const color = shouldSpawnShop ? supportedColors[0].color : weakestColor;
  const id = `${shouldSpawnShop ? 's' : 'h'}-${game.nextBuildingId}`;

  if (shouldSpawnShop) {
    game.shops.push({
      id,
      kind: 'shop',
      color,
      x: spot.x,
      y: spot.y,
      demand: 1,
      capacity: 7,
      nextDemand: 4.4,
      overloadSeconds: 0,
    });
    addShopDriveway(game, game.shops[game.shops.length - 1]);
    addToast(game, 'New stop opened');
  } else {
    game.houses.push({ id, kind: 'home', color, x: spot.x, y: spot.y, vehicleSlots: HOME_VEHICLE_SLOTS });
    addToast(game, 'New home block');
  }

  game.nextBuildingId += 1;
};

const dispatchVehicles = (game: GameState) => {
  const outstandingByShop = new Map(
    game.shops.map((shop) => {
      const alreadyOutbound = game.vehicles.filter(
        (vehicle) => vehicle.shopId === shop.id && vehicle.state === 'outbound',
      ).length;
      return [shop.id, Math.max(0, (shop.demand ?? 0) - alreadyOutbound)];
    }),
  );

  const busyVehiclesByHome = new Map<string, number>();
  for (const vehicle of game.vehicles) {
    busyVehiclesByHome.set(vehicle.homeId, (busyVehiclesByHome.get(vehicle.homeId) ?? 0) + 1);
  }

  const availableVehiclesByHome = new Map(
    game.houses.map((home) => [
      home.id,
      Math.max(0, (home.vehicleSlots ?? HOME_VEHICLE_SLOTS) - (busyVehiclesByHome.get(home.id) ?? 0)),
    ]),
  );
  const urgentShops = game.shops
    .filter((shop) => (outstandingByShop.get(shop.id) ?? 0) > 0)
    .sort((a, b) => {
      const urgencyA =
        ((a.demand ?? 0) / (a.capacity ?? 7)) * 100 +
        (a.overloadSeconds ?? 0) * 12 +
        (outstandingByShop.get(a.id) ?? 0) * 4;
      const urgencyB =
        ((b.demand ?? 0) / (b.capacity ?? 7)) * 100 +
        (b.overloadSeconds ?? 0) * 12 +
        (outstandingByShop.get(b.id) ?? 0) * 4;
      return urgencyB - urgencyA;
    });

  for (const shop of urgentShops) {
    while ((outstandingByShop.get(shop.id) ?? 0) > 0) {
      const candidates = game.houses
        .filter((home) => (availableVehiclesByHome.get(home.id) ?? 0) > 0 && home.color === shop.color)
        .map((home) => {
          const path = makeVehiclePath(game, home, shop);
          return path ? { home, path } : null;
        })
        .filter((candidate): candidate is { home: Building; path: Cell[] } => candidate !== null)
        .sort((a, b) => a.path.length - b.path.length);

      const target = candidates[0];
      if (!target) break;

      const start = centerOf(target.path[0]);
      game.vehicles.push({
        id: `v-${game.nextVehicleId}`,
        color: shop.color,
        homeId: target.home.id,
        shopId: shop.id,
        state: 'outbound',
        x: start.x,
        y: start.y,
        path: target.path,
        targetIndex: 1,
        speed: 3.75 + Math.min(game.score / 90, 1.15),
      });
      game.nextVehicleId += 1;
      availableVehiclesByHome.set(target.home.id, Math.max(0, (availableVehiclesByHome.get(target.home.id) ?? 0) - 1));
      outstandingByShop.set(shop.id, Math.max(0, (outstandingByShop.get(shop.id) ?? 0) - 1));
    }
  }
};

const vehicleOccupancy = (vehicles: Vehicle[]) => {
  const occupancy = new Map<string, number>();

  for (const vehicle of vehicles) {
    const cellKey = keyOf(Math.floor(vehicle.x), Math.floor(vehicle.y));
    occupancy.set(cellKey, (occupancy.get(cellKey) ?? 0) + 1);
  }

  return occupancy;
};

const laneOccupancy = (vehicles: Vehicle[]) => {
  const lanes = new Map<string, Array<{ vehicleId: string; progress: number }>>();

  for (const vehicle of vehicles) {
    const lane = getVehicleLane(vehicle);
    if (!lane) continue;
    const items = lanes.get(lane.laneKey) ?? [];
    items.push({ vehicleId: vehicle.id, progress: lane.progress });
    lanes.set(lane.laneKey, items);
  }

  for (const items of lanes.values()) {
    items.sort((a, b) => a.progress - b.progress);
  }

  return lanes;
};

const connectionCount = (game: GameState, cell: Cell) => {
  const connections = roadConnections(game, cell.x, cell.y);
  return Number(connections.up) + Number(connections.right) + Number(connections.down) + Number(connections.left);
};

const followingMultiplier = (vehicle: Vehicle, lanes: Map<string, Array<{ vehicleId: string; progress: number }>>) => {
  const lane = getVehicleLane(vehicle);
  if (!lane) return 1;

  const items = lanes.get(lane.laneKey) ?? [];
  const index = items.findIndex((item) => item.vehicleId === vehicle.id);
  if (index < 0 || index === items.length - 1) return 1;

  const vehicleAhead = items[index + 1];
  const gap = vehicleAhead.progress - lane.progress;
  if (gap < 0.1) return 0.12;
  if (gap < 0.18) return 0.35;
  if (gap < 0.28) return 0.65;
  return 1;
};

const isIntersectionCell = (game: GameState, cell: Cell) =>
  game.roads.has(keyOf(cell.x, cell.y)) && connectionCount(game, cell) >= 3;

const intersectionYieldMultiplier = (game: GameState, vehicle: Vehicle, vehicles: Vehicle[]) => {
  const lane = getVehicleLane(vehicle);
  if (!lane || lane.progress < 0.72) return 1;

  const targetKey = keyOf(lane.to.x, lane.to.y);
  if (!isIntersectionCell(game, lane.to) || game.roundabouts.has(targetKey)) return 1;

  for (const other of vehicles) {
    if (other.id === vehicle.id) continue;
    const otherLane = getVehicleLane(other);
    if (!otherLane) continue;

    const otherToKey = keyOf(otherLane.to.x, otherLane.to.y);
    const otherFromKey = keyOf(otherLane.from.x, otherLane.from.y);
    const otherIsInIntersection = otherFromKey === targetKey && otherLane.progress < 0.45;
    const otherIsEnteringIntersection = otherToKey === targetKey && otherLane.progress > 0.55;
    if (!otherIsInIntersection && !otherIsEnteringIntersection) continue;

    if (other.id < vehicle.id) return 0.035;
  }

  return 1;
};

const congestionMultiplier = (
  game: GameState,
  vehicle: Vehicle,
  occupancy: Map<string, number>,
  lanes: Map<string, Array<{ vehicleId: string; progress: number }>>,
  vehicles: Vehicle[],
) => {
  const currentCell = { x: Math.floor(vehicle.x), y: Math.floor(vehicle.y) };
  const currentKey = keyOf(currentCell.x, currentCell.y);
  const nextPathCell = vehicle.path[vehicle.targetIndex];
  const nextKey = nextPathCell ? keyOf(nextPathCell.x, nextPathCell.y) : keyOf(currentCell.x, currentCell.y);
  const currentLoad = occupancy.get(currentKey) ?? 0;
  const nextLoad = occupancy.get(nextKey) ?? 0;
  const isRoundabout = game.roundabouts.has(currentKey);
  const intersectionPenalty =
    !isRoundabout && game.roads.has(currentKey) && connectionCount(game, currentCell) >= 3 ? 0.72 : 1;
  const crowdFloor = isRoundabout ? 0.68 : 0.42;
  const crowdPenalty = Math.max(crowdFloor, 1 - Math.max(0, currentLoad - 1) * 0.18 - nextLoad * 0.1);

  return intersectionPenalty * crowdPenalty * followingMultiplier(vehicle, lanes) * intersectionYieldMultiplier(game, vehicle, vehicles);
};

const updateVehicles = (game: GameState, dt: number) => {
  const survivors: Vehicle[] = [];
  const occupancy = vehicleOccupancy(game.vehicles);
  const lanes = laneOccupancy(game.vehicles);

  for (const vehicle of game.vehicles) {
    const target = centerOf(vehicle.path[vehicle.targetIndex]);
    const dx = target.x - vehicle.x;
    const dy = target.y - vehicle.y;
    const distance = Math.hypot(dx, dy);
    const travel = vehicle.speed * congestionMultiplier(game, vehicle, occupancy, lanes, game.vehicles) * dt;

    if (distance <= travel) {
      vehicle.x = target.x;
      vehicle.y = target.y;
      vehicle.targetIndex += 1;
    } else {
      vehicle.x += (dx / distance) * travel;
      vehicle.y += (dy / distance) * travel;
    }

    if (vehicle.targetIndex < vehicle.path.length) {
      survivors.push(vehicle);
      continue;
    }

    if (vehicle.state === 'outbound') {
      const shop = game.shops.find((item) => item.id === vehicle.shopId);
      if (shop) {
        shop.demand = Math.max(0, (shop.demand ?? 0) - 1);
        shop.overloadSeconds = Math.max(0, (shop.overloadSeconds ?? 0) - 0.8);
      }
      game.score += 1;
      if (game.score > game.bestScore) {
        game.bestScore = game.score;
        localStorage.setItem(STORAGE_KEY, String(game.bestScore));
      }
      vehicle.state = 'returning';
      vehicle.path = [...vehicle.path].reverse();
      vehicle.targetIndex = 1;
      survivors.push(vehicle);
    }
  }

  game.vehicles = survivors;
};

export const updateGame = (game: GameState, dt: number) => {
  if (game.phase !== 'running') return;

  game.elapsed += dt * TIME_SCALE;
  game.day = Math.floor(game.elapsed / 24) + 1;
  game.week = Math.floor((game.day - 1) / WEEK_LENGTH_DAYS) + 1;
  game.weekDayIndex = (game.day - 1) % WEEK_LENGTH_DAYS;
  game.weekProgress = ((game.day - 1) % WEEK_LENGTH_DAYS + (game.elapsed % 24) / 24) / WEEK_LENGTH_DAYS;
  game.spawnTimer -= dt;

  while (game.day >= game.nextRoadGrantDay) {
    game.nextRoadGrantDay += WEEK_LENGTH_DAYS;
    openUpgradePicker(game);
    return;
  }

  for (const shop of game.shops) {
    const speedUp = Math.min(game.score / 120, 1.2);
    shop.nextDemand = (shop.nextDemand ?? 4.5) - dt;
    if ((shop.nextDemand ?? 0) <= 0) {
      shop.demand = Math.min(12, (shop.demand ?? 0) + 1);
      shop.nextDemand = Math.max(2.35, 5.2 - speedUp - Math.random() * 1.2);
    }

    if ((shop.demand ?? 0) >= (shop.capacity ?? 7)) {
      shop.overloadSeconds = (shop.overloadSeconds ?? 0) + dt;
      if ((shop.overloadSeconds ?? 0) > 7) {
        game.phase = 'over';
        addToast(game, 'Gridlock');
      }
    } else {
      shop.overloadSeconds = Math.max(0, (shop.overloadSeconds ?? 0) - dt * 1.5);
    }
  }

  if (game.spawnTimer <= 0) {
    spawnBuilding(game);
    game.spawnTimer = Math.max(11, 22 - game.day * 1.1);
  }

  dispatchVehicles(game);
  updateVehicles(game, dt);

  if (game.toast) {
    game.toast.ttl -= dt;
    if (game.toast.ttl <= 0) game.toast = null;
  }
};

export const makeHud = (game: GameState): HudState => ({
  phase: game.phase,
  score: game.score,
  bestScore: game.bestScore,
  day: game.day,
  week: game.week,
  weekDayIndex: game.weekDayIndex,
  weekProgress: game.weekProgress,
  roadTiles: game.roadTiles,
  activeVehicles: game.vehicles.length,
  pressure: pressureOf(game),
  toast: game.toast,
  bridges: game.bridges,
  motorwaysAvailable: game.motorwaysAvailable,
  roundaboutsAvailable: game.roundaboutsAvailable,
  upgradeOptions: game.upgradeOptions,
});

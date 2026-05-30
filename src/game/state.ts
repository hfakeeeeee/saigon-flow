import { GRID_H, GRID_W, STORAGE_KEY } from './constants';
import { cellInDirection, centerOf, hasRoadEdge, keyOf, neighborsOf } from './grid';
import type { Building, Cell, ColorKey, GameState, HudState, RoadOwner } from './types';

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

export const makeGame = (): GameState => {
  const bestScore = Number(localStorage.getItem(STORAGE_KEY) ?? 0);
  const { water, parks } = makeTerrain();

  return {
    phase: 'running',
    score: 0,
    bestScore,
    day: 1,
    roadTiles: 110,
    spawnTimer: 17,
    elapsed: 0,
    houses: [
      { id: 'h-1', kind: 'home', color: 'coral', x: 2, y: 3, cooldown: 0 },
      { id: 'h-2', kind: 'home', color: 'teal', x: 27, y: 2, cooldown: 0 },
      { id: 'h-3', kind: 'home', color: 'gold', x: 4, y: 14, cooldown: 0 },
    ],
    shops: [
      {
        id: 's-1',
        kind: 'shop',
        color: 'coral',
        x: 13,
        y: 4,
        demand: 2,
        capacity: 7,
        nextDemand: 3.8,
        overloadSeconds: 0,
      },
      {
        id: 's-2',
        kind: 'shop',
        color: 'teal',
        x: 20,
        y: 14,
        demand: 2,
        capacity: 7,
        nextDemand: 4.6,
        overloadSeconds: 0,
      },
      {
        id: 's-3',
        kind: 'shop',
        color: 'gold',
        x: 11,
        y: 11,
        demand: 1,
        capacity: 7,
        nextDemand: 5.2,
        overloadSeconds: 0,
      },
    ],
    vehicles: [],
    roads: new Set<string>(),
    roadEdges: new Set<string>(),
    water,
    parks,
    toast: { message: 'Saigon Flow', ttl: 2.6 },
    nextVehicleId: 1,
    nextBuildingId: 4,
  };
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

    for (const next of neighborsOf(current)) {
      const nextKey = keyOf(next.x, next.y);
      if (!game.roads.has(nextKey) || cameFrom.has(nextKey) || !hasRoadEdge(game, current, next)) continue;
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
    addToast(game, 'New stop opened');
  } else {
    game.houses.push({ id, kind: 'home', color, x: spot.x, y: spot.y, cooldown: 0 });
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

  const readyHomes = new Set(game.houses.filter((home) => (home.cooldown ?? 0) <= 0).map((home) => home.id));
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
        .filter((home) => readyHomes.has(home.id) && home.color === shop.color)
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
        speed: 4.9 + Math.min(game.score / 70, 1.8),
      });
      game.nextVehicleId += 1;
      target.home.cooldown = 2.1;
      readyHomes.delete(target.home.id);
      outstandingByShop.set(shop.id, Math.max(0, (outstandingByShop.get(shop.id) ?? 0) - 1));
    }
  }
};

const updateVehicles = (game: GameState, dt: number) => {
  const survivors = [];

  for (const vehicle of game.vehicles) {
    const target = centerOf(vehicle.path[vehicle.targetIndex]);
    const dx = target.x - vehicle.x;
    const dy = target.y - vehicle.y;
    const distance = Math.hypot(dx, dy);
    const travel = vehicle.speed * dt;

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

  game.elapsed += dt;
  game.day = Math.floor(game.elapsed / 24) + 1;
  game.spawnTimer -= dt;

  for (const home of game.houses) {
    home.cooldown = Math.max(0, (home.cooldown ?? 0) - dt);
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
  roadTiles: game.roadTiles,
  activeVehicles: game.vehicles.length,
  pressure: pressureOf(game),
  toast: game.toast,
});

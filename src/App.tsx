import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  CirclePause,
  CirclePlay,
  RotateCcw,
  Route,
  Trash2,
  Waves,
} from 'lucide-react';

type Tool = 'road' | 'erase';
type Cell = { x: number; y: number };
type ColorKey = 'coral' | 'teal' | 'gold' | 'violet';
type VehicleState = 'outbound' | 'returning';
type GamePhase = 'running' | 'paused' | 'over';

type Building = {
  id: string;
  kind: 'home' | 'shop';
  color: ColorKey;
  x: number;
  y: number;
  cooldown?: number;
  demand?: number;
  capacity?: number;
  nextDemand?: number;
  overloadSeconds?: number;
};

type Vehicle = {
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

type Toast = {
  message: string;
  ttl: number;
};

type GameState = {
  phase: GamePhase;
  score: number;
  bestScore: number;
  day: number;
  roadTiles: number;
  spawnTimer: number;
  elapsed: number;
  houses: Building[];
  shops: Building[];
  vehicles: Vehicle[];
  roads: Set<string>;
  water: Set<string>;
  parks: Set<string>;
  toast: Toast | null;
  nextVehicleId: number;
  nextBuildingId: number;
};

type HudState = {
  phase: GamePhase;
  score: number;
  bestScore: number;
  day: number;
  roadTiles: number;
  activeVehicles: number;
  pressure: number;
  toast: Toast | null;
};

type RoadOwner = ColorKey | 'mixed' | null;

const GRID_W = 30;
const GRID_H = 18;
const STORAGE_KEY = 'saigon-flow-best-score';

const colors: Record<ColorKey, { road: string; fill: string; dark: string; light: string }> = {
  coral: { road: '#f06543', fill: '#ff8b6e', dark: '#a93624', light: '#ffd2c6' },
  teal: { road: '#0f9f9a', fill: '#50c9c3', dark: '#0a6865', light: '#c5f5f2' },
  gold: { road: '#d7971e', fill: '#f3bd44', dark: '#895d0f', light: '#ffe4a3' },
  violet: { road: '#6b5dd3', fill: '#978df0', dark: '#3d368f', light: '#dedbff' },
};

const palette = {
  asphalt: '#5f6870',
  asphaltDark: '#424b52',
  lane: '#f8f0dc',
  ground: '#f5efe2',
  grid: 'rgba(40, 51, 54, 0.09)',
  water: '#4ba6bd',
  waterDeep: '#28798e',
  park: '#8abf7f',
  ink: '#152026',
  warning: '#e84d3d',
};

const keyOf = (x: number, y: number) => `${x},${y}`;
const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
const neighborsOf = ({ x, y }: Cell) => [
  { x: x + 1, y },
  { x: x - 1, y },
  { x, y: y + 1 },
  { x, y: y - 1 },
];

const makeTerrain = () => {
  const water = new Set<string>();
  const parks = new Set<string>();

  for (let x = 0; x < GRID_W; x += 1) {
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

const makeInitialRoads = () => {
  return new Set<string>();
};

const makeGame = (): GameState => {
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
    roads: makeInitialRoads(),
    water,
    parks,
    toast: { message: 'Saigon Flow', ttl: 2.6 },
    nextVehicleId: 1,
    nextBuildingId: 4,
  };
};

const centerOf = (cell: Cell) => ({ x: cell.x + 0.5, y: cell.y + 0.5 });

const isBuildingAt = (game: GameState, x: number, y: number) =>
  game.houses.some((b) => b.x === x && b.y === y) || game.shops.some((b) => b.x === x && b.y === y);

const buildingAt = (game: GameState, x: number, y: number) =>
  game.houses.find((b) => b.x === x && b.y === y) ?? game.shops.find((b) => b.x === x && b.y === y);

const isBlockedCell = (game: GameState, x: number, y: number) =>
  !inBounds(x, y) || game.water.has(keyOf(x, y)) || game.parks.has(keyOf(x, y)) || isBuildingAt(game, x, y);

const adjacentRoad = (game: GameState, building: Building) =>
  neighborsOf(building).find((cell) => game.roads.has(keyOf(cell.x, cell.y)));

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
  const start = adjacentRoad(game, home);
  const goal = adjacentRoad(game, shop);
  if (!start || !goal) return null;

  const roadPath = findRoadPath(game, start, goal);
  if (!roadPath) return null;

  return [{ x: home.x, y: home.y }, ...roadPath, { x: shop.x, y: shop.y }];
};

const addToast = (game: GameState, message: string) => {
  game.toast = { message, ttl: 2.2 };
};

const pressureOf = (game: GameState) =>
  game.shops.reduce((max, shop) => Math.max(max, (shop.demand ?? 0) / (shop.capacity ?? 1)), 0);

const roadConnections = (game: GameState, x: number, y: number) => {
  const connectsTo = (cell: Cell) => {
    if (!inBounds(cell.x, cell.y)) return false;
    return game.roads.has(keyOf(cell.x, cell.y)) || Boolean(buildingAt(game, cell.x, cell.y));
  };

  return {
    up: connectsTo({ x, y: y - 1 }),
    right: connectsTo({ x: x + 1, y }),
    down: connectsTo({ x, y: y + 1 }),
    left: connectsTo({ x: x - 1, y }),
  };
};

const roadOwnerMap = (game: GameState) => {
  const owners = new Map<string, RoadOwner>();
  const distances = new Map<string, number>();
  const queue: Array<{ cell: Cell; color: ColorKey; distance: number }> = [];

  for (const home of game.houses) {
    for (const next of neighborsOf(home)) {
      const nextKey = keyOf(next.x, next.y);
      if (game.roads.has(nextKey)) {
        queue.push({ cell: next, color: home.color, distance: 0 });
      }
    }
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
        if (game.roads.has(keyOf(next.x, next.y))) {
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

  const candidates: Cell[] = [
    { x: 3, y: 6 },
    { x: 8, y: 13 },
    { x: 24, y: 15 },
    { x: 26, y: 5 },
    { x: 15, y: 2 },
    { x: 5, y: 16 },
    { x: 21, y: 7 },
    { x: 12, y: 15 },
    { x: 28, y: 11 },
    { x: 1, y: 11 },
    { x: 16, y: 16 },
    { x: 19, y: 2 },
  ];

  const spot = candidates.find((cell) => !occupied.has(keyOf(cell.x, cell.y)));
  if (!spot) return;

  const shouldSpawnShop = game.shops.length < 6 && game.nextBuildingId % 3 === 0;
  const color = colorCycle[game.nextBuildingId % colorCycle.length];
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

  const readyHomes = game.houses.filter((home) => (home.cooldown ?? 0) <= 0);

  for (const home of readyHomes) {
    const candidates = game.shops
      .filter((shop) => shop.color === home.color && (outstandingByShop.get(shop.id) ?? 0) > 0)
      .map((shop) => {
        const path = makeVehiclePath(game, home, shop);
        if (!path) return null;

        const demand = shop.demand ?? 0;
        const capacity = shop.capacity ?? 7;
        const pressure = demand / capacity;
        const distance = Math.abs(home.x - shop.x) + Math.abs(home.y - shop.y);

        return {
          shop,
          path,
          urgency:
            pressure * 100 +
            (shop.overloadSeconds ?? 0) * 12 +
            (outstandingByShop.get(shop.id) ?? 0) * 4 -
            distance * 0.15,
        };
      })
      .filter((candidate): candidate is { shop: Building; path: Cell[]; urgency: number } => candidate !== null)
      .sort((a, b) => b.urgency - a.urgency);

    const target = candidates[0];
    if (!target) continue;

    const start = centerOf(target.path[0]);
    game.vehicles.push({
      id: `v-${game.nextVehicleId}`,
      color: target.shop.color,
      homeId: home.id,
      shopId: target.shop.id,
      state: 'outbound',
      x: start.x,
      y: start.y,
      path: target.path,
      targetIndex: 1,
      speed: 4.9 + Math.min(game.score / 70, 1.8),
    });
    game.nextVehicleId += 1;
    home.cooldown = 2.1;
    outstandingByShop.set(target.shop.id, Math.max(0, (outstandingByShop.get(target.shop.id) ?? 0) - 1));
  }
};

const updateVehicles = (game: GameState, dt: number) => {
  const survivors: Vehicle[] = [];

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

const updateGame = (game: GameState, dt: number) => {
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

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
};

const drawGame = (
  ctx: CanvasRenderingContext2D,
  game: GameState,
  width: number,
  height: number,
  pointerCell: Cell | null,
) => {
  ctx.clearRect(0, 0, width, height);

  const cell = Math.floor(Math.min(width / (GRID_W + 1.3), height / (GRID_H + 1.3)));
  const mapW = cell * GRID_W;
  const mapH = cell * GRID_H;
  const offsetX = Math.floor((width - mapW) / 2);
  const offsetY = Math.floor((height - mapH) / 2);

  ctx.fillStyle = '#efe4d1';
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f7f0e4');
  gradient.addColorStop(0.5, '#ece9d5');
  gradient.addColorStop(1, '#dce8df');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(offsetX, offsetY);

  ctx.fillStyle = palette.ground;
  drawRoundedRect(ctx, -cell * 0.28, -cell * 0.28, mapW + cell * 0.56, mapH + cell * 0.56, cell * 0.3);

  for (let x = 0; x <= GRID_W; x += 1) {
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x * cell, 0);
    ctx.lineTo(x * cell, mapH);
    ctx.stroke();
  }

  for (let y = 0; y <= GRID_H; y += 1) {
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y * cell);
    ctx.lineTo(mapW, y * cell);
    ctx.stroke();
  }

  const fillCell = (x: number, y: number, fill: string, inset = 0.08) => {
    ctx.fillStyle = fill;
    drawRoundedRect(
      ctx,
      x * cell + cell * inset,
      y * cell + cell * inset,
      cell * (1 - inset * 2),
      cell * (1 - inset * 2),
      cell * 0.17,
    );
  };

  for (const item of game.water) {
    const [x, y] = item.split(',').map(Number);
    fillCell(x, y, palette.water, 0.02);
    ctx.fillStyle = palette.waterDeep;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(x * cell + cell * 0.18, y * cell + cell * 0.42, cell * 0.62, cell * 0.08);
    ctx.globalAlpha = 1;
  }

  for (const item of game.parks) {
    const [x, y] = item.split(',').map(Number);
    fillCell(x, y, palette.park, 0.08);
    ctx.fillStyle = '#5e9957';
    ctx.beginPath();
    ctx.arc(x * cell + cell * 0.34, y * cell + cell * 0.38, cell * 0.09, 0, Math.PI * 2);
    ctx.arc(x * cell + cell * 0.62, y * cell + cell * 0.56, cell * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  const roadOwners = roadOwnerMap(game);
  const drawRoadShape = (x: number, y: number, widthRatio: number, fill: string) => {
    const connections = roadConnections(game, x, y);
    const cx = x * cell + cell * 0.5;
    const cy = y * cell + cell * 0.5;
    const half = (cell * widthRatio) / 2;

    ctx.fillStyle = fill;

    if (connections.left) ctx.fillRect(x * cell, cy - half, cell * 0.5, half * 2);
    if (connections.right) ctx.fillRect(cx, cy - half, cell * 0.5, half * 2);
    if (connections.up) ctx.fillRect(cx - half, y * cell, half * 2, cell * 0.5);
    if (connections.down) ctx.fillRect(cx - half, cy, half * 2, cell * 0.5);

    drawRoundedRect(ctx, cx - half, cy - half, half * 2, half * 2, cell * 0.12);
  };

  const drawLaneMarks = (x: number, y: number) => {
    const connections = roadConnections(game, x, y);
    const cx = x * cell + cell * 0.5;
    const cy = y * cell + cell * 0.5;
    ctx.strokeStyle = palette.lane;
    ctx.globalAlpha = 0.62;
    ctx.lineWidth = Math.max(1, cell * 0.045);
    ctx.lineCap = 'round';

    const mark = (fromX: number, fromY: number, toX: number, toY: number) => {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
    };

    if (connections.left) mark(x * cell + cell * 0.18, cy, cx - cell * 0.1, cy);
    if (connections.right) mark(cx + cell * 0.1, cy, x * cell + cell * 0.82, cy);
    if (connections.up) mark(cx, y * cell + cell * 0.18, cx, cy - cell * 0.1);
    if (connections.down) mark(cx, cy + cell * 0.1, cx, y * cell + cell * 0.82);

    ctx.globalAlpha = 1;
  };

  for (const road of game.roads) {
    const [x, y] = road.split(',').map(Number);
    const owner = roadOwners.get(road) ?? null;
    const outline =
      owner === 'mixed'
        ? '#fff9ec'
        : owner
          ? colors[owner].road
          : palette.asphaltDark;

    drawRoadShape(x, y, 0.88, outline);
    drawRoadShape(x, y, 0.62, palette.asphalt);
    drawLaneMarks(x, y);
  }

  const drawBuilding = (building: Building) => {
    const color = colors[building.color];
    const bx = building.x * cell;
    const by = building.y * cell;
    ctx.fillStyle = building.kind === 'home' ? color.light : '#fffaf0';
    ctx.strokeStyle = color.dark;
    ctx.lineWidth = Math.max(2, cell * 0.06);

    if (building.kind === 'home') {
      ctx.beginPath();
      ctx.moveTo(bx + cell * 0.18, by + cell * 0.52);
      ctx.lineTo(bx + cell * 0.5, by + cell * 0.18);
      ctx.lineTo(bx + cell * 0.82, by + cell * 0.52);
      ctx.lineTo(bx + cell * 0.82, by + cell * 0.84);
      ctx.lineTo(bx + cell * 0.22, by + cell * 0.84);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color.fill;
      ctx.fillRect(bx + cell * 0.43, by + cell * 0.61, cell * 0.14, cell * 0.23);
      return;
    }

    ctx.fillStyle = color.fill;
    drawRoundedRect(ctx, bx + cell * 0.14, by + cell * 0.13, cell * 0.72, cell * 0.72, cell * 0.12);
    ctx.strokeRect(bx + cell * 0.23, by + cell * 0.24, cell * 0.54, cell * 0.5);
    ctx.fillStyle = color.dark;
    ctx.fillRect(bx + cell * 0.32, by + cell * 0.32, cell * 0.36, cell * 0.1);

    const demand = building.demand ?? 0;
    if (demand > 0) {
      ctx.fillStyle = demand >= (building.capacity ?? 7) ? palette.warning : palette.ink;
      ctx.beginPath();
      ctx.arc(bx + cell * 0.82, by + cell * 0.17, cell * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.max(10, cell * 0.3)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(demand), bx + cell * 0.82, by + cell * 0.17);
    }

    const overload = building.overloadSeconds ?? 0;
    if (overload > 0) {
      ctx.strokeStyle = palette.warning;
      ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 120) * 0.2;
      ctx.lineWidth = Math.max(2, cell * 0.08);
      ctx.beginPath();
      ctx.arc(bx + cell * 0.5, by + cell * 0.5, cell * (0.58 + overload * 0.02), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };

  game.houses.forEach(drawBuilding);
  game.shops.forEach(drawBuilding);

  for (const vehicle of game.vehicles) {
    const color = colors[vehicle.color];
    const x = vehicle.x * cell;
    const y = vehicle.y * cell;
    ctx.fillStyle = color.dark;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin((vehicle.x + vehicle.y) * 0.7) * 0.08);
    drawRoundedRect(ctx, -cell * 0.2, -cell * 0.12, cell * 0.4, cell * 0.24, cell * 0.12);
    ctx.fillStyle = color.fill;
    ctx.fillRect(-cell * 0.07, -cell * 0.18, cell * 0.18, cell * 0.12);
    ctx.fillStyle = '#1b2529';
    ctx.beginPath();
    ctx.arc(-cell * 0.14, cell * 0.13, cell * 0.045, 0, Math.PI * 2);
    ctx.arc(cell * 0.14, cell * 0.13, cell * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (pointerCell && inBounds(pointerCell.x, pointerCell.y)) {
    const invalid = game.water.has(keyOf(pointerCell.x, pointerCell.y)) || game.parks.has(keyOf(pointerCell.x, pointerCell.y));
    ctx.fillStyle = invalid ? 'rgba(232, 77, 61, 0.18)' : 'rgba(21, 32, 38, 0.12)';
    ctx.strokeStyle = invalid ? palette.warning : palette.ink;
    ctx.lineWidth = 2;
    ctx.fillRect(pointerCell.x * cell, pointerCell.y * cell, cell, cell);
    ctx.strokeRect(pointerCell.x * cell + 1, pointerCell.y * cell + 1, cell - 2, cell - 2);
  }

  if (game.phase !== 'running') {
    ctx.fillStyle = 'rgba(21, 32, 38, 0.52)';
    ctx.fillRect(0, 0, mapW, mapH);
    ctx.fillStyle = '#fff9ec';
    ctx.font = `800 ${Math.max(28, cell * 1.2)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.phase === 'paused' ? 'Paused' : 'Gridlock', mapW / 2, mapH / 2);
  }

  ctx.restore();

  if (game.toast) {
    ctx.fillStyle = 'rgba(21, 32, 38, 0.82)';
    const toastW = Math.min(260, width - 32);
    drawRoundedRect(ctx, width / 2 - toastW / 2, 18, toastW, 42, 8);
    ctx.fillStyle = '#fff9ec';
    ctx.font = '700 15px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(game.toast.message, width / 2, 39);
  }
};

const getCellFromPointer = (canvas: HTMLCanvasElement, clientX: number, clientY: number): Cell | null => {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const cell = Math.floor(Math.min(width / (GRID_W + 1.3), height / (GRID_H + 1.3)));
  const offsetX = Math.floor((width - cell * GRID_W) / 2);
  const offsetY = Math.floor((height - cell * GRID_H) / 2);
  const x = Math.floor((clientX - rect.left - offsetX) / cell);
  const y = Math.floor((clientY - rect.top - offsetY) / cell);

  if (!inBounds(x, y)) return null;
  return { x, y };
};

const makeHud = (game: GameState): HudState => ({
  phase: game.phase,
  score: game.score,
  bestScore: game.bestScore,
  day: game.day,
  roadTiles: game.roadTiles,
  activeVehicles: game.vehicles.length,
  pressure: pressureOf(game),
  toast: game.toast,
});

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<GameState>(makeGame());
  const animationRef = useRef<number>();
  const pointerCellRef = useRef<Cell | null>(null);
  const drawingRef = useRef(false);
  const toolRef = useRef<Tool>('road');
  const [tool, setTool] = useState<Tool>('road');
  const [hud, setHud] = useState<HudState>(() => makeHud(gameRef.current));

  const resetGame = useCallback(() => {
    gameRef.current = makeGame();
    pointerCellRef.current = null;
    setHud(makeHud(gameRef.current));
  }, []);

  const togglePause = useCallback(() => {
    const game = gameRef.current;
    if (game.phase === 'over') return;
    game.phase = game.phase === 'paused' ? 'running' : 'paused';
    setHud(makeHud(game));
  }, []);

  const selectTool = useCallback((nextTool: Tool) => {
    toolRef.current = nextTool;
    setTool(nextTool);
  }, []);

  const editCell = useCallback((cell: Cell | null) => {
    if (!cell) return;
    const game = gameRef.current;
    const key = keyOf(cell.x, cell.y);

    if (toolRef.current === 'erase') {
      if (game.roads.delete(key)) game.roadTiles += 1;
      return;
    }

    if (game.roadTiles <= 0 || game.roads.has(key) || isBlockedCell(game, cell.x, cell.y)) return;
    game.roads.add(key);
    game.roadTiles -= 1;
  }, []);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let lastTime = performance.now();
    let hudTimer = 0;

    const tick = (time: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(320, rect.width);
      const height = Math.max(280, rect.height);

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dt = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;
      updateGame(gameRef.current, dt);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGame(ctx, gameRef.current, width, height, pointerCellRef.current);

      hudTimer += dt;
      if (hudTimer > 0.18) {
        setHud(makeHud(gameRef.current));
        hudTimer = 0;
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    const cell = getCellFromPointer(canvas, event.clientX, event.clientY);
    pointerCellRef.current = cell;
    drawingRef.current = true;
    editCell(cell);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cell = getCellFromPointer(canvas, event.clientX, event.clientY);
    pointerCellRef.current = cell;
    if (drawingRef.current) editCell(cell);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    drawingRef.current = false;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  const pressurePercent = Math.min(100, Math.round(hud.pressure * 100));

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Game status">
        <div className="brand">
          <Waves aria-hidden="true" />
          <div>
            <h1>Saigon Flow</h1>
            <p>Alleys, bridges, rain.</p>
          </div>
        </div>

        <div className="stat-row">
          <div className="stat">
            <span>Score</span>
            <strong>{hud.score}</strong>
          </div>
          <div className="stat">
            <span>Best</span>
            <strong>{hud.bestScore}</strong>
          </div>
          <div className="stat">
            <span>Day</span>
            <strong>{hud.day}</strong>
          </div>
          <div className="stat">
            <span>Road</span>
            <strong>{hud.roadTiles}</strong>
          </div>
        </div>
      </section>

      <section className="game-layout">
        <aside className="toolbar" aria-label="Game controls">
          <div className="tool-group" role="group" aria-label="Tools">
            <button
              className={tool === 'road' ? 'icon-button active' : 'icon-button'}
              type="button"
              aria-label="Road tool"
              title="Road"
              onClick={() => selectTool('road')}
            >
              <Route aria-hidden="true" />
            </button>
            <button
              className={tool === 'erase' ? 'icon-button active' : 'icon-button'}
              type="button"
              aria-label="Erase tool"
              title="Erase"
              onClick={() => selectTool('erase')}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>

          <div className="tool-group" role="group" aria-label="Session">
            <button
              className="icon-button"
              type="button"
              aria-label={hud.phase === 'paused' ? 'Resume' : 'Pause'}
              title={hud.phase === 'paused' ? 'Resume' : 'Pause'}
              onClick={togglePause}
            >
              {hud.phase === 'paused' ? <CirclePlay aria-hidden="true" /> : <CirclePause aria-hidden="true" />}
            </button>
            <button className="icon-button" type="button" aria-label="Restart" title="Restart" onClick={resetGame}>
              <RotateCcw aria-hidden="true" />
            </button>
          </div>

          <div className="pressure">
            <span>Flow</span>
            <div className="pressure-track" aria-hidden="true">
              <div style={{ '--pressure': `${pressurePercent}%` } as CSSProperties} />
            </div>
            <strong>{100 - pressurePercent}%</strong>
          </div>
        </aside>

        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            aria-label="Saigon Flow game board"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => {
              pointerCellRef.current = null;
              drawingRef.current = false;
            }}
          />
        </div>
      </section>

      <section className="status-strip" aria-label="Run details">
        <span>{hud.activeVehicles} scooters</span>
        <span>{hud.phase === 'over' ? 'Gridlock' : hud.phase === 'paused' ? 'Paused' : 'Live'}</span>
        <span>{hud.toast?.message ?? 'Local prototype'}</span>
      </section>
    </main>
  );
}

export default App;

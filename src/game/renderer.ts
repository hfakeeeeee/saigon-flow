import { colors, GRIDLOCK_LIMIT_SECONDS, palette } from './constants';
import { inBounds, inVisibleBounds, keyOf, roadConnections } from './grid';
import { getVehicleLane } from './lane';
import { roadOwnerMap } from './state';
import type { Building, Cell, GameState } from './types';

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

export const drawGame = (
  ctx: CanvasRenderingContext2D,
  game: GameState,
  width: number,
  height: number,
  pointerCell: Cell | null,
) => {
  ctx.clearRect(0, 0, width, height);

  const bounds = game.visibleBounds;
  const boundsW = bounds.maxX - bounds.minX + 1;
  const boundsH = bounds.maxY - bounds.minY + 1;
  const cell = Math.max(1, Math.floor(Math.min(width / boundsW, height / boundsH)));
  const mapW = cell * boundsW;
  const mapH = cell * boundsH;
  const offsetX = Math.floor((width - mapW) / 2);
  const offsetY = Math.floor((height - mapH) / 2);
  const mapX = bounds.minX * cell;
  const mapY = bounds.minY * cell;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f5efe2');
  gradient.addColorStop(0.58, '#ece9d5');
  gradient.addColorStop(1, '#dce8df');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(offsetX - mapX, offsetY - mapY);

  ctx.fillStyle = palette.ground;
  ctx.fillRect(mapX, mapY, mapW, mapH);

  ctx.beginPath();
  ctx.rect(mapX, mapY, mapW, mapH);
  ctx.clip();

  for (let x = bounds.minX; x <= bounds.maxX + 1; x += 1) {
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x * cell, mapY);
    ctx.lineTo(x * cell, mapY + mapH);
    ctx.stroke();
  }

  for (let y = bounds.minY; y <= bounds.maxY + 1; y += 1) {
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mapX, y * cell);
    ctx.lineTo(mapX + mapW, y * cell);
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
    if (!inVisibleBounds(bounds, x, y)) continue;
    fillCell(x, y, palette.water, 0.02);
    ctx.fillStyle = palette.waterDeep;
    ctx.globalAlpha = 0.18;
    ctx.fillRect(x * cell + cell * 0.18, y * cell + cell * 0.42, cell * 0.62, cell * 0.08);
    ctx.globalAlpha = 1;
  }

  for (const item of game.parks) {
    const [x, y] = item.split(',').map(Number);
    if (!inVisibleBounds(bounds, x, y)) continue;
    fillCell(x, y, palette.park, 0.08);
    ctx.fillStyle = '#5e9957';
    ctx.beginPath();
    ctx.arc(x * cell + cell * 0.34, y * cell + cell * 0.38, cell * 0.09, 0, Math.PI * 2);
    ctx.arc(x * cell + cell * 0.62, y * cell + cell * 0.56, cell * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  drawMotorways(ctx, game, cell);
  drawRoads(ctx, game, cell);
  game.houses.forEach((building) => drawBuilding(ctx, game, building, cell));
  game.shops.forEach((building) => drawBuilding(ctx, building, cell));
  drawVehicles(ctx, game, cell);
  drawPointer(ctx, game, pointerCell, cell);

  if (game.phase !== 'running') {
    ctx.fillStyle = 'rgba(21, 32, 38, 0.52)';
    ctx.fillRect(mapX, mapY, mapW, mapH);
    ctx.fillStyle = '#fff9ec';
    ctx.font = `800 ${Math.max(28, cell * 1.2)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = game.phase === 'paused' ? 'Paused' : game.phase === 'upgrade' ? 'Upgrade' : 'Gridlock';
    ctx.fillText(label, mapX + mapW / 2, mapY + mapH / 2);
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

const drawRoads = (ctx: CanvasRenderingContext2D, game: GameState, cell: number) => {
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
    if (!inVisibleBounds(game.visibleBounds, x, y)) continue;
    const owner = roadOwners.get(road) ?? null;
    const isPendingRemoval = game.pendingRoadRemovals.has(road);
    const outline = isPendingRemoval
      ? 'rgba(232, 77, 61, 0.72)'
      : owner === 'mixed'
        ? '#fff9ec'
        : owner
          ? colors[owner].road
          : palette.asphaltDark;
    const asphalt = isPendingRemoval ? 'rgba(95, 104, 112, 0.42)' : palette.asphalt;

    drawRoadShape(x, y, 0.88, outline);
    drawRoadShape(x, y, 0.62, asphalt);
    if (game.bridgeTiles.has(road)) drawBridgeRails(ctx, x, y, cell);
    if (game.roundabouts.has(road)) drawRoundabout(ctx, x, y, cell);
    drawLaneMarks(x, y);
  }
};

const drawBridgeRails = (ctx: CanvasRenderingContext2D, x: number, y: number, cell: number) => {
  ctx.strokeStyle = '#fff9ec';
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = Math.max(1, cell * 0.045);
  ctx.strokeRect(x * cell + cell * 0.15, y * cell + cell * 0.15, cell * 0.7, cell * 0.7);
  ctx.globalAlpha = 1;
};

const drawRoundabout = (ctx: CanvasRenderingContext2D, x: number, y: number, cell: number) => {
  const cx = x * cell + cell * 0.5;
  const cy = y * cell + cell * 0.5;
  ctx.fillStyle = '#fff9ec';
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.27, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.asphalt;
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.17, 0, Math.PI * 2);
  ctx.fill();
};

const drawMotorways = (ctx: CanvasRenderingContext2D, game: GameState, cell: number) => {
  for (const motorway of game.motorways) {
    if (!inVisibleBounds(game.visibleBounds, motorway.a.x, motorway.a.y) || !inVisibleBounds(game.visibleBounds, motorway.b.x, motorway.b.y)) {
      continue;
    }

    const ax = motorway.a.x * cell + cell * 0.5;
    const ay = motorway.a.y * cell + cell * 0.5;
    const bx = motorway.b.x * cell + cell * 0.5;
    const by = motorway.b.y * cell + cell * 0.5;

    ctx.strokeStyle = 'rgba(21, 32, 38, 0.32)';
    ctx.lineWidth = Math.max(5, cell * 0.24);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    ctx.strokeStyle = '#fff9ec';
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = Math.max(1, cell * 0.045);
    ctx.setLineDash([cell * 0.22, cell * 0.18]);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
};

const drawBuilding = (ctx: CanvasRenderingContext2D, gameOrBuilding: GameState | Building, maybeBuilding: Building | number, maybeCell?: number) => {
  const game = maybeCell === undefined ? null : (gameOrBuilding as GameState);
  const building = maybeCell === undefined ? (gameOrBuilding as Building) : (maybeBuilding as Building);
  const cell = maybeCell === undefined ? (maybeBuilding as number) : maybeCell;
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
    if (game) drawHomeVehicles(ctx, game, building, cell);
    drawBuildingExit(ctx, building, cell);
    return;
  }

  ctx.fillStyle = color.fill;
  if ((building.level ?? 1) >= 2) {
    ctx.strokeStyle = color.road;
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = Math.max(3, cell * 0.12);
    ctx.beginPath();
    ctx.roundRect(bx + cell * 0.1, by + cell * 0.09, cell * 0.8, cell * 0.8, cell * 0.16);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color.dark;
  }
  drawRoundedRect(ctx, bx + cell * 0.14, by + cell * 0.13, cell * 0.72, cell * 0.72, cell * 0.12);
  ctx.strokeRect(bx + cell * 0.23, by + cell * 0.24, cell * 0.54, cell * 0.5);
  ctx.fillStyle = color.dark;
  ctx.fillRect(bx + cell * 0.32, by + cell * 0.32, cell * 0.36, cell * 0.1);
  if ((building.level ?? 1) >= 2) {
    ctx.fillRect(bx + cell * 0.32, by + cell * 0.52, cell * 0.36, cell * 0.1);
  }

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
    const progress = Math.min(1, overload / GRIDLOCK_LIMIT_SECONDS);
    const radius = cell * 0.68;
    const cx = bx + cell * 0.5;
    const cy = by + cell * 0.5;
    const remaining = Math.max(0, Math.ceil(GRIDLOCK_LIMIT_SECONDS - overload));

    ctx.strokeStyle = 'rgba(21, 32, 38, 0.2)';
    ctx.lineWidth = Math.max(3, cell * 0.09);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = palette.warning;
    ctx.globalAlpha = 0.72 + Math.sin(performance.now() / 120) * 0.16;
    ctx.lineWidth = Math.max(3, cell * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
    ctx.lineCap = 'butt';

    ctx.fillStyle = palette.warning;
    ctx.globalAlpha = 0.94;
    ctx.beginPath();
    ctx.arc(bx + cell * 0.18, by + cell * 0.82, cell * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.max(9, cell * 0.26)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(remaining), bx + cell * 0.18, by + cell * 0.82);
  }

  drawBuildingExit(ctx, building, cell);
};

const drawHomeVehicles = (ctx: CanvasRenderingContext2D, game: GameState, building: Building, cell: number) => {
  const slots = building.vehicleSlots ?? 2;
  const busy = game.vehicles.filter((vehicle) => vehicle.homeId === building.id).length;
  const available = Math.max(0, slots - busy);
  const bx = building.x * cell;
  const by = building.y * cell;

  for (let index = 0; index < slots; index += 1) {
    ctx.fillStyle = index < available ? colors[building.color].dark : 'rgba(21, 32, 38, 0.22)';
    ctx.beginPath();
    ctx.arc(bx + cell * (0.33 + index * 0.17), by + cell * 0.95, cell * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawBuildingExit = (ctx: CanvasRenderingContext2D, building: Building, cell: number) => {
  if (!building.exit) return;

  const color = colors[building.color];
  const bx = building.x * cell;
  const by = building.y * cell;
  const positions = {
    up: { x: bx + cell * 0.5, y: by + cell * 0.08 },
    right: { x: bx + cell * 0.92, y: by + cell * 0.5 },
    down: { x: bx + cell * 0.5, y: by + cell * 0.92 },
    left: { x: bx + cell * 0.08, y: by + cell * 0.5 },
  };
  const pos = positions[building.exit];

  ctx.fillStyle = '#fff9ec';
  ctx.strokeStyle = color.dark;
  ctx.lineWidth = Math.max(2, cell * 0.05);
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, cell * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
};

const drawVehicles = (ctx: CanvasRenderingContext2D, game: GameState, cell: number) => {
  for (const vehicle of game.vehicles) {
    const color = colors[vehicle.color];
    const lane = getVehicleLane(vehicle);
    const x = (vehicle.x + (lane?.laneOffset.x ?? 0)) * cell;
    const y = (vehicle.y + (lane?.laneOffset.y ?? 0)) * cell;
    ctx.fillStyle = color.dark;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lane ? lane.heading : Math.sin((vehicle.x + vehicle.y) * 0.7) * 0.08);
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
};

const drawPointer = (ctx: CanvasRenderingContext2D, game: GameState, pointerCell: Cell | null, cell: number) => {
  if (!pointerCell || !inBounds(pointerCell.x, pointerCell.y) || !inVisibleBounds(game.visibleBounds, pointerCell.x, pointerCell.y)) return;

  const invalid = game.water.has(keyOf(pointerCell.x, pointerCell.y)) || game.parks.has(keyOf(pointerCell.x, pointerCell.y));
  ctx.fillStyle = invalid ? 'rgba(232, 77, 61, 0.18)' : 'rgba(21, 32, 38, 0.12)';
  ctx.strokeStyle = invalid ? palette.warning : palette.ink;
  ctx.lineWidth = 2;
  ctx.fillRect(pointerCell.x * cell, pointerCell.y * cell, cell, cell);
  ctx.strokeRect(pointerCell.x * cell + 1, pointerCell.y * cell + 1, cell - 2, cell - 2);
};

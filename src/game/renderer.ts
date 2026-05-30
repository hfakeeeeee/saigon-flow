import { colors, GRID_H, GRID_W, palette } from './constants';
import { inBounds, keyOf, roadConnections } from './grid';
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

  drawRoads(ctx, game, cell);
  game.houses.forEach((building) => drawBuilding(ctx, building, cell));
  game.shops.forEach((building) => drawBuilding(ctx, building, cell));
  drawVehicles(ctx, game, cell);
  drawPointer(ctx, game, pointerCell, cell);

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
    const owner = roadOwners.get(road) ?? null;
    const outline = owner === 'mixed' ? '#fff9ec' : owner ? colors[owner].road : palette.asphaltDark;

    drawRoadShape(x, y, 0.88, outline);
    drawRoadShape(x, y, 0.62, palette.asphalt);
    drawLaneMarks(x, y);
  }
};

const drawBuilding = (ctx: CanvasRenderingContext2D, building: Building, cell: number) => {
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

const drawVehicles = (ctx: CanvasRenderingContext2D, game: GameState, cell: number) => {
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
};

const drawPointer = (ctx: CanvasRenderingContext2D, game: GameState, pointerCell: Cell | null, cell: number) => {
  if (!pointerCell || !inBounds(pointerCell.x, pointerCell.y)) return;

  const invalid = game.water.has(keyOf(pointerCell.x, pointerCell.y)) || game.parks.has(keyOf(pointerCell.x, pointerCell.y));
  ctx.fillStyle = invalid ? 'rgba(232, 77, 61, 0.18)' : 'rgba(21, 32, 38, 0.12)';
  ctx.strokeStyle = invalid ? palette.warning : palette.ink;
  ctx.lineWidth = 2;
  ctx.fillRect(pointerCell.x * cell, pointerCell.y * cell, cell, cell);
  ctx.strokeRect(pointerCell.x * cell + 1, pointerCell.y * cell + 1, cell - 2, cell - 2);
};

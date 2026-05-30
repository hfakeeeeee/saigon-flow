import { GRID_H, GRID_W } from './constants';
import type { Building, Cell, GameState } from './types';

export const keyOf = (x: number, y: number) => `${x},${y}`;

export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;

export const neighborsOf = ({ x, y }: Cell) => [
  { x: x + 1, y },
  { x: x - 1, y },
  { x, y: y + 1 },
  { x, y: y - 1 },
];

export const centerOf = (cell: Cell) => ({ x: cell.x + 0.5, y: cell.y + 0.5 });

export const isBuildingAt = (game: GameState, x: number, y: number) =>
  game.houses.some((b) => b.x === x && b.y === y) || game.shops.some((b) => b.x === x && b.y === y);

export const buildingAt = (game: GameState, x: number, y: number): Building | undefined =>
  game.houses.find((b) => b.x === x && b.y === y) ?? game.shops.find((b) => b.x === x && b.y === y);

export const isBlockedCell = (game: GameState, x: number, y: number) =>
  !inBounds(x, y) || game.water.has(keyOf(x, y)) || game.parks.has(keyOf(x, y)) || isBuildingAt(game, x, y);

export const roadConnections = (game: GameState, x: number, y: number) => {
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

export const getCellFromPointer = (canvas: HTMLCanvasElement, clientX: number, clientY: number): Cell | null => {
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

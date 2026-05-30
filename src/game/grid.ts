import { GRID_H, GRID_W } from './constants';
import type { Building, Cell, Direction, GameState } from './types';

export const keyOf = (x: number, y: number) => `${x},${y}`;

export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;

export const neighborsOf = ({ x, y }: Cell) => [
  { x: x + 1, y },
  { x: x - 1, y },
  { x, y: y + 1 },
  { x, y: y - 1 },
];

export const directionBetween = (from: Cell, to: Cell): Direction | null => {
  if (to.x === from.x && to.y === from.y - 1) return 'up';
  if (to.x === from.x + 1 && to.y === from.y) return 'right';
  if (to.x === from.x && to.y === from.y + 1) return 'down';
  if (to.x === from.x - 1 && to.y === from.y) return 'left';
  return null;
};

export const cellInDirection = (cell: Cell, direction: Direction): Cell => {
  if (direction === 'up') return { x: cell.x, y: cell.y - 1 };
  if (direction === 'right') return { x: cell.x + 1, y: cell.y };
  if (direction === 'down') return { x: cell.x, y: cell.y + 1 };
  return { x: cell.x - 1, y: cell.y };
};

export const oppositeDirection = (direction: Direction): Direction => {
  if (direction === 'up') return 'down';
  if (direction === 'right') return 'left';
  if (direction === 'down') return 'up';
  return 'right';
};

export const edgeKey = (a: Cell, b: Cell) => {
  const first = keyOf(a.x, a.y);
  const second = keyOf(b.x, b.y);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
};

export const centerOf = (cell: Cell) => ({ x: cell.x + 0.5, y: cell.y + 0.5 });

export const isBuildingAt = (game: GameState, x: number, y: number) =>
  game.houses.some((b) => b.x === x && b.y === y) || game.shops.some((b) => b.x === x && b.y === y);

export const buildingAt = (game: GameState, x: number, y: number): Building | undefined =>
  game.houses.find((b) => b.x === x && b.y === y) ?? game.shops.find((b) => b.x === x && b.y === y);

export const isBlockedCell = (game: GameState, x: number, y: number) =>
  !inBounds(x, y) || game.water.has(keyOf(x, y)) || game.parks.has(keyOf(x, y)) || isBuildingAt(game, x, y);

export const connectRoadCells = (game: GameState, a: Cell, b: Cell) => {
  if (!directionBetween(a, b)) return;
  if (!game.roads.has(keyOf(a.x, a.y)) || !game.roads.has(keyOf(b.x, b.y))) return;
  game.roadEdges.add(edgeKey(a, b));
};

export const disconnectRoadCell = (game: GameState, cell: Cell) => {
  game.roadEdges.forEach((edge) => {
    const [a, b] = edge.split('|');
    if (a === keyOf(cell.x, cell.y) || b === keyOf(cell.x, cell.y)) {
      game.roadEdges.delete(edge);
    }
  });

  [...game.houses, ...game.shops].forEach((building) => {
    if (!building.exit) return;
    const exitCell = cellInDirection(building, building.exit);
    if (exitCell.x === cell.x && exitCell.y === cell.y) building.exit = undefined;
  });
};

export const hasRoadEdge = (game: GameState, a: Cell, b: Cell) => game.roadEdges.has(edgeKey(a, b));

export const setBuildingExit = (game: GameState, building: Building, roadCell: Cell) => {
  const direction = directionBetween(building, roadCell);
  if (!direction || !game.roads.has(keyOf(roadCell.x, roadCell.y))) return false;
  building.exit = direction;
  return true;
};

export const canRoadConnectToBuilding = (game: GameState, roadCell: Cell, building: Building) => {
  const direction = directionBetween(building, roadCell);
  return Boolean(direction && building.exit === direction && game.roads.has(keyOf(roadCell.x, roadCell.y)));
};

export const roadConnections = (game: GameState, x: number, y: number) => {
  const connectsTo = (cell: Cell) => {
    if (!inBounds(cell.x, cell.y)) return false;
    if (game.roads.has(keyOf(cell.x, cell.y))) return hasRoadEdge(game, { x, y }, cell);

    const building = buildingAt(game, cell.x, cell.y);
    return building ? canRoadConnectToBuilding(game, { x, y }, building) : false;
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

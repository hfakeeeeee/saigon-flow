import { centerOf, edgeKey, keyOf } from './grid';
import type { Cell, Vehicle } from './types';

export type LaneSnapshot = {
  from: Cell;
  to: Cell;
  progress: number;
  laneKey: string;
  laneOffset: { x: number; y: number };
  heading: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const getVehicleLane = (vehicle: Vehicle): LaneSnapshot | null => {
  const to = vehicle.path[vehicle.targetIndex];
  const from = vehicle.path[Math.max(0, vehicle.targetIndex - 1)];
  if (!from || !to) return null;

  const fromCenter = centerOf(from);
  const toCenter = centerOf(to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const lengthSq = dx * dx + dy * dy;
  const progress =
    lengthSq === 0 ? 0 : clamp(((vehicle.x - fromCenter.x) * dx + (vehicle.y - fromCenter.y) * dy) / lengthSq, 0, 1);
  const length = Math.sqrt(lengthSq) || 1;
  const normal = { x: -dy / length, y: dx / length };
  const directionKey = `${keyOf(from.x, from.y)}>${keyOf(to.x, to.y)}`;

  return {
    from,
    to,
    progress,
    laneKey: `${edgeKey(from, to)}:${directionKey}`,
    laneOffset: { x: normal.x * 0.16, y: normal.y * 0.16 },
    heading: Math.atan2(dy, dx),
  };
};

import type { ColorKey } from './types';

export const GRID_W = 30;
export const GRID_H = 18;
export const GRIDLOCK_LIMIT_SECONDS = 7;
export const STORAGE_KEY = 'saigon-flow-best-score';

export const colors: Record<ColorKey, { road: string; fill: string; dark: string; light: string }> = {
  coral: { road: '#f06543', fill: '#ff8b6e', dark: '#a93624', light: '#ffd2c6' },
  teal: { road: '#0f9f9a', fill: '#50c9c3', dark: '#0a6865', light: '#c5f5f2' },
  gold: { road: '#d7971e', fill: '#f3bd44', dark: '#895d0f', light: '#ffe4a3' },
  violet: { road: '#6b5dd3', fill: '#978df0', dark: '#3d368f', light: '#dedbff' },
};

export const palette = {
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

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CirclePause, CirclePlay, RotateCcw, Waves } from 'lucide-react';
import {
  buildingAt,
  connectRoadCells,
  disconnectRoadCell,
  getCellFromPointer,
  isBlockedCell,
  keyOf,
  setBuildingExit,
} from './game/grid';
import { drawGame } from './game/renderer';
import { makeGame, makeHud, updateGame } from './game/state';
import type { Cell, GameState, HudState } from './game/types';

type EditAction = 'road' | 'erase';
const weekDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<GameState>(makeGame());
  const animationRef = useRef<number>();
  const pointerCellRef = useRef<Cell | null>(null);
  const previousCellRef = useRef<Cell | null>(null);
  const drawingRef = useRef(false);
  const actionRef = useRef<EditAction>('road');
  const [hud, setHud] = useState<HudState>(() => makeHud(gameRef.current));

  const resetGame = useCallback(() => {
    gameRef.current = makeGame();
    pointerCellRef.current = null;
    previousCellRef.current = null;
    setHud(makeHud(gameRef.current));
  }, []);

  const togglePause = useCallback(() => {
    const game = gameRef.current;
    if (game.phase === 'over') return;
    game.phase = game.phase === 'paused' ? 'running' : 'paused';
    setHud(makeHud(game));
  }, []);

  const editCell = useCallback((cell: Cell | null, previousCell: Cell | null, action: EditAction) => {
    if (!cell) return;

    const game = gameRef.current;
    const key = keyOf(cell.x, cell.y);

    if (action === 'erase') {
      if (game.roads.has(key)) {
        disconnectRoadCell(game, cell);
        game.roads.delete(key);
        game.roadTiles += 1;
      }
      return;
    }

    const currentBuilding = buildingAt(game, cell.x, cell.y);
    if (currentBuilding) {
      if (previousCell && game.roads.has(keyOf(previousCell.x, previousCell.y))) {
        setBuildingExit(game, currentBuilding, previousCell);
      }
      return;
    }

    if (!game.roads.has(key)) {
      if (game.roadTiles <= 0 || isBlockedCell(game, cell.x, cell.y)) return;
      game.roads.add(key);
      game.roadTiles -= 1;
    }

    if (!previousCell) return;

    const previousBuilding = buildingAt(game, previousCell.x, previousCell.y);
    if (previousBuilding) {
      setBuildingExit(game, previousBuilding, cell);
      return;
    }

    if (game.roads.has(keyOf(previousCell.x, previousCell.y))) {
      connectRoadCells(game, previousCell, cell);
    }
  }, []);

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

  const getActionFromPointer = (event: React.PointerEvent<HTMLCanvasElement>): EditAction | null => {
    if (event.pointerType !== 'mouse') return 'road';
    if (event.button === 0 || (event.buttons & 1) === 1) return 'road';
    if (event.button === 2 || (event.buttons & 2) === 2) return 'erase';
    return null;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const action = getActionFromPointer(event);
    if (!action) return;

    actionRef.current = action;
    canvas.setPointerCapture(event.pointerId);
    const cell = getCellFromPointer(canvas, event.clientX, event.clientY);
    pointerCellRef.current = cell;
    previousCellRef.current = cell;
    drawingRef.current = true;
    editCell(cell, null, action);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cell = getCellFromPointer(canvas, event.clientX, event.clientY);
    pointerCellRef.current = cell;
    if (drawingRef.current) {
      editCell(cell, previousCellRef.current, actionRef.current);
      previousCellRef.current = cell;
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    drawingRef.current = false;
    previousCellRef.current = null;
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
            <span>Week</span>
            <strong>{hud.week}</strong>
          </div>
          <div className="stat">
            <span>Road</span>
            <strong>{hud.roadTiles}</strong>
          </div>
        </div>

        <div className="week-clock" aria-label="Week progress">
          <div className="week-clock-header">
            <span>Week {hud.week}</span>
            <strong>{weekDays[hud.weekDayIndex]}</strong>
          </div>
          <div className="week-days">
            {weekDays.map((day, index) => (
              <span className={index === hud.weekDayIndex ? 'active' : ''} key={day}>
                {day}
              </span>
            ))}
          </div>
          <div className="week-progress" aria-hidden="true">
            <div style={{ '--week-progress': `${Math.min(100, Math.round(hud.weekProgress * 100))}%` } as CSSProperties} />
          </div>
        </div>
      </section>

      <section className="game-layout">
        <aside className="toolbar" aria-label="Game controls">
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
            onContextMenu={(event) => event.preventDefault()}
            onPointerLeave={() => {
              pointerCellRef.current = null;
              drawingRef.current = false;
              previousCellRef.current = null;
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

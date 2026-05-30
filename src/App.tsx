import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CirclePause, CirclePlay, RotateCcw, Route, Trash2, Waves } from 'lucide-react';
import { getCellFromPointer, isBlockedCell, keyOf } from './game/grid';
import { drawGame } from './game/renderer';
import { makeGame, makeHud, updateGame } from './game/state';
import type { Cell, GameState, HudState, Tool } from './game/types';

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

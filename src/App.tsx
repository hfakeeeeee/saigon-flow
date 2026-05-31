import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CirclePause, CirclePlay, RotateCcw, Waves } from 'lucide-react';
import {
  buildingAt,
  canPlaceRoadTile,
  connectRoadCells,
  disconnectRoadCell,
  getCellFromPointer,
  keyOf,
  setBuildingExit,
} from './game/grid';
import { drawGame } from './game/renderer';
import { chooseUpgrade, makeGame, makeHud, updateGame } from './game/state';
import type { Cell, GameState, HudState, UpgradeKind } from './game/types';

type EditAction = 'road' | 'erase';
type PlacementMode = 'roundabout' | 'motorway' | null;
const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const vehicleUsesRoad = (game: GameState, roadKey: string) =>
  game.vehicles.some((vehicle) => vehicle.path.some((cell) => keyOf(cell.x, cell.y) === roadKey));

const isShopDriveway = (game: GameState, roadKey: string) =>
  game.shops.some((shop) => {
    if (!shop.exit) return false;
    const exitCell =
      shop.exit === 'up'
        ? { x: shop.x, y: shop.y - 1 }
        : shop.exit === 'right'
          ? { x: shop.x + 1, y: shop.y }
          : shop.exit === 'down'
            ? { x: shop.x, y: shop.y + 1 }
            : { x: shop.x - 1, y: shop.y };
    return keyOf(exitCell.x, exitCell.y) === roadKey;
  });

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<GameState>(makeGame());
  const animationRef = useRef<number>();
  const pointerCellRef = useRef<Cell | null>(null);
  const previousCellRef = useRef<Cell | null>(null);
  const motorwayStartRef = useRef<Cell | null>(null);
  const drawingRef = useRef(false);
  const actionRef = useRef<EditAction>('road');
  const [placementMode, setPlacementMode] = useState<PlacementMode>(null);
  const [hud, setHud] = useState<HudState>(() => makeHud(gameRef.current));

  const resetGame = useCallback(() => {
    gameRef.current = makeGame();
    pointerCellRef.current = null;
    previousCellRef.current = null;
    motorwayStartRef.current = null;
    setPlacementMode(null);
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
        if (isShopDriveway(game, key)) return;
        if (vehicleUsesRoad(game, key)) {
          if (!game.pendingRoadRemovals.has(key)) {
            game.pendingRoadRemovals.set(key, { kind: game.bridgeTiles.has(key) ? 'bridge' : 'road' });
          }
          return;
        }

        disconnectRoadCell(game, cell);
        game.roads.delete(key);
        if (game.bridgeTiles.delete(key)) {
          game.bridges += 1;
        } else {
          game.roadTiles += 1;
        }
        if (game.roundabouts.delete(key)) game.roundaboutsAvailable += 1;
      }
      return;
    }

    const currentBuilding = buildingAt(game, cell.x, cell.y);
    if (currentBuilding) {
      if (currentBuilding.kind === 'home' && previousCell && game.roads.has(keyOf(previousCell.x, previousCell.y))) {
        setBuildingExit(game, currentBuilding, previousCell);
      }
      return;
    }

    if (!game.roads.has(key)) {
      if (!canPlaceRoadTile(game, cell.x, cell.y)) return;
      game.roads.add(key);
      if (game.water.has(key)) {
        game.bridgeTiles.add(key);
        game.bridges -= 1;
      } else {
        game.roadTiles -= 1;
      }
    }

    if (!previousCell) return;

    const previousBuilding = buildingAt(game, previousCell.x, previousCell.y);
    if (previousBuilding?.kind === 'home') {
      setBuildingExit(game, previousBuilding, cell);
      return;
    }

    if (game.roads.has(keyOf(previousCell.x, previousCell.y))) {
      connectRoadCells(game, previousCell, cell);
    }
  }, []);

  const handleSpecialPlacement = useCallback(
    (cell: Cell | null) => {
      if (!cell || !placementMode) return false;

      const game = gameRef.current;
      const key = keyOf(cell.x, cell.y);
      if (!game.roads.has(key)) return true;

      if (placementMode === 'roundabout') {
        if (game.roundaboutsAvailable <= 0 || game.roundabouts.has(key)) return true;
        game.roundabouts.add(key);
        game.roundaboutsAvailable -= 1;
        setPlacementMode(null);
        setHud(makeHud(game));
        return true;
      }

      if (game.motorwaysAvailable <= 0) return true;
      const start = motorwayStartRef.current;
      if (!start) {
        motorwayStartRef.current = cell;
        setHud(makeHud(game));
        return true;
      }

      const startKey = keyOf(start.x, start.y);
      if (startKey === key) return true;

      game.motorways.push({ id: `m-${game.nextMotorwayId}`, a: start, b: cell });
      game.nextMotorwayId += 1;
      game.motorwaysAvailable -= 1;
      motorwayStartRef.current = null;
      setPlacementMode(null);
      setHud(makeHud(game));
      return true;
    },
    [placementMode],
  );

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
    if (action === 'road' && handleSpecialPlacement(cell)) return;
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
          <div
            className="day-dial"
            aria-label={`Progress through ${weekDays[hud.weekDayIndex]}`}
            style={{ '--day-progress': `${Math.round((hud.weekProgress * 7) % 1 * 100)}%` } as CSSProperties}
          >
            <div>
              <span />
            </div>
          </div>
          <div className="week-clock-copy">
            <span>Week {hud.week}</span>
            <strong>{weekDays[hud.weekDayIndex]}</strong>
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

          <div className="upgrade-tools" aria-label="Upgrade tools">
            <button
              className={placementMode === 'roundabout' ? 'upgrade-tool active' : 'upgrade-tool'}
              disabled={hud.roundaboutsAvailable <= 0}
              type="button"
              onClick={() => setPlacementMode(placementMode === 'roundabout' ? null : 'roundabout')}
            >
              <span>R</span>
              <strong>{hud.roundaboutsAvailable}</strong>
            </button>
            <button
              className={placementMode === 'motorway' ? 'upgrade-tool active' : 'upgrade-tool'}
              disabled={hud.motorwaysAvailable <= 0}
              type="button"
              onClick={() => {
                motorwayStartRef.current = null;
                setPlacementMode(placementMode === 'motorway' ? null : 'motorway');
              }}
            >
              <span>M</span>
              <strong>{hud.motorwaysAvailable}</strong>
            </button>
            <div className="upgrade-count">
              <span>B</span>
              <strong>{hud.bridges}</strong>
            </div>
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
        <span>{hud.phase === 'over' ? 'Gridlock' : hud.phase === 'paused' ? 'Paused' : hud.phase === 'upgrade' ? 'Upgrade' : 'Live'}</span>
        <span>{hud.toast?.message ?? 'Local prototype'}</span>
      </section>

      {hud.phase === 'upgrade' && (
        <section className="upgrade-modal" aria-label="Weekly upgrade">
          <div className="upgrade-panel">
            <span className="upgrade-kicker">New week</span>
            <h2>Choose an upgrade</h2>
            <div className="upgrade-options">
              {hud.upgradeOptions.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  onClick={() => {
                    chooseUpgrade(gameRef.current, option.kind as UpgradeKind);
                    setHud(makeHud(gameRef.current));
                  }}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;

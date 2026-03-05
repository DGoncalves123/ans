import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as CanvasMode from 'art/modes/canvas';
import './DrawingCanvas.css';

interface DrawingCanvasProps {
  width: number;
  height: number;
  onImageChange?: (imageData: ImageData) => void;
}

type Point = { x: number; y: number };

type BrushPresetId = 'fine' | 'marker' | 'soft' | 'neon';

interface BrushPreset {
  id: BrushPresetId;
  label: string;
  icon: string;
  widthMultiplier: number;
  opacity: number;
}

interface StrokeShape {
  id: string;
  points: Point[];
  color: string;
  size: number;
  cap: 'round' | 'square';
  join: 'round' | 'miter';
}

type ArtSurface = {
  element: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  render: () => void;
  resize: (width: number, height: number) => void;
  inject: (target: HTMLElement) => void;
  eject: () => void;
};

type ArtGroup = {
  empty: () => void;
  inject: (target: ArtSurface) => ArtGroup;
  grab: (...nodes: ArtShape[]) => ArtGroup;
};

type ArtPath = {
  moveTo: (x: number, y: number) => ArtPath;
  lineTo: (x: number, y: number) => ArtPath;
  close: () => ArtPath;
};

type ArtShape = {
  stroke: (color: string, width: number, cap: 'round' | 'square', join: 'round' | 'miter') => ArtShape;
  draw: (path: ArtPath) => ArtShape;
  fill: (color: string) => ArtShape;
};

const ArtLib = CanvasMode as unknown as {
  Surface: new (width: number, height: number) => ArtSurface;
  Group: new () => ArtGroup;
  Shape: new (path?: ArtPath) => ArtShape;
  Path: new () => ArtPath;
};

const BRUSH_PRESETS: BrushPreset[] = [
  { id: 'fine', label: 'Fine', icon: '✒️', widthMultiplier: 0.7, opacity: 1 },
  { id: 'marker', label: 'Marker', icon: '🖊️', widthMultiplier: 1.4, opacity: 0.55 },
  { id: 'soft', label: 'Soft', icon: '🫧', widthMultiplier: 2.2, opacity: 0.25 },
  { id: 'neon', label: 'Neon', icon: '✨', widthMultiplier: 1.1, opacity: 0.85 },
];

const PALETTE = [
  '#ff2d55', '#ff9500', '#ffd60a', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#bf5af2',
  '#ff375f', '#ff9f0a', '#64d2ff', '#32d74b', '#1e88e5', '#8e8dff', '#ffffff', '#000000',
];

function cloneStrokes(strokes: StrokeShape[]): StrokeShape[] {
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  }));
}

function getBrushPreset(id: BrushPresetId): BrushPreset {
  return BRUSH_PRESETS.find((preset) => preset.id === id) ?? BRUSH_PRESETS[0];
}

export function DrawingCanvas({ width, height, onImageChange }: DrawingCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);
  const heightRef = useRef(height);
  const surfaceRef = useRef<ArtSurface | null>(null);
  const layerRef = useRef<ArtGroup | null>(null);
  const strokesRef = useRef<StrokeShape[]>([]);
  const currentStrokeRef = useRef<StrokeShape | null>(null);
  const currentShapeRef = useRef<ArtShape | null>(null);
  const undoStackRef = useRef<StrokeShape[][]>([[]]);

  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const [brushSize, setBrushSize] = useState(10);
  const [brushColor, setBrushColor] = useState({ r: 255, g: 45, b: 85 });
  const [brushPresetId, setBrushPresetId] = useState<BrushPresetId>('fine');
  const brushSizeRef = useRef(brushSize);
  const brushColorRef = useRef(brushColor);
  const brushPresetIdRef = useRef(brushPresetId);
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  useEffect(() => {
    brushColorRef.current = brushColor;
  }, [brushColor]);

  useEffect(() => {
    brushPresetIdRef.current = brushPresetId;
  }, [brushPresetId]);

  useEffect(() => {
    widthRef.current = width;
    heightRef.current = height;
  }, [height, width]);

  const drawBackground = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const currentWidth = widthRef.current;
    const currentHeight = heightRef.current;
    const backgroundPath = new ArtLib.Path()
      .moveTo(0, 0)
      .lineTo(currentWidth, 0)
      .lineTo(currentWidth, currentHeight)
      .lineTo(0, currentHeight)
      .close();
    const background = new ArtLib.Shape(backgroundPath).fill('#000000');
    layer.grab(background);
  }, []);

  const buildPath = useCallback((points: Point[]) => {
    const path = new ArtLib.Path();
    if (points.length === 0) return path;

    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      path.lineTo(points[i].x, points[i].y);
    }

    if (points.length === 1) {
      path.lineTo(points[0].x + 0.01, points[0].y + 0.01);
    }

    return path;
  }, []);

  const createStrokeShape = useCallback(
    (stroke: StrokeShape) => {
      const path = buildPath(stroke.points);
      return new ArtLib.Shape(path).stroke(stroke.color, stroke.size, stroke.cap, stroke.join);
    },
    [buildPath]
  );

  const renderStrokes = useCallback(() => {
    const layer = layerRef.current;
    const surface = surfaceRef.current;
    if (!layer || !surface) return;

    layer.empty();
    drawBackground();
    for (const stroke of strokesRef.current) {
      layer.grab(createStrokeShape(stroke));
    }

    // Additive color blending: painting over color sums light values.
    surface.context.globalCompositeOperation = 'lighter';
    surface.render();
  }, [createStrokeShape, drawBackground]);

  const notifyParentOfChange = useCallback(() => {
    const canvas = surfaceRef.current?.element;
    if (!canvas || !onImageChange) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, widthRef.current, heightRef.current);
    onImageChange(imageData);
  }, [onImageChange]);

  const saveStateForUndo = useCallback(() => {
    undoStackRef.current.push(cloneStrokes(strokesRef.current));

    if (undoStackRef.current.length > 20) {
      undoStackRef.current.shift();
    }

    setCanUndo(undoStackRef.current.length > 1);
  }, []);

  const getPointerCoordinates = useCallback((event: PointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = widthRef.current / rect.width;
    const scaleY = heightRef.current / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = '';
    const surface = new ArtLib.Surface(widthRef.current, heightRef.current);
    surface.inject(host);

    const layer = new ArtLib.Group().inject(surface);
    surfaceRef.current = surface;
    layerRef.current = layer;
    strokesRef.current = [];
    undoStackRef.current = [[]];
    setCanUndo(false);
    renderStrokes();
    notifyParentOfChange();

    const canvas = surface.element;
    canvas.classList.add('drawing-canvas');
    canvas.style.touchAction = 'none';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType !== 'touch') return;

      saveStateForUndo();
      setIsDrawing(true);
      isDrawingRef.current = true;

      const point = getPointerCoordinates(event, canvas);
      const currentBrushColor = brushColorRef.current;
      const preset = getBrushPreset(brushPresetIdRef.current);
      const stroke: StrokeShape = {
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        points: [point],
        color: `rgba(${currentBrushColor.r}, ${currentBrushColor.g}, ${currentBrushColor.b}, ${preset.opacity})`,
        size: Math.max(1, brushSizeRef.current * preset.widthMultiplier),
        cap: 'round',
        join: 'round',
      };

      strokesRef.current = [...strokesRef.current, stroke];
      currentStrokeRef.current = stroke;

      const shape = createStrokeShape(stroke);
      currentShapeRef.current = shape;
      layer.grab(shape);
      surface.context.globalCompositeOperation = 'lighter';
      surface.render();

      if (canvas.setPointerCapture) {
        canvas.setPointerCapture(event.pointerId);
      }

      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDrawingRef.current || !currentStrokeRef.current || !currentShapeRef.current) return;

      const point = getPointerCoordinates(event, canvas);
      currentStrokeRef.current.points.push(point);
      currentShapeRef.current.draw(buildPath(currentStrokeRef.current.points));
      surface.context.globalCompositeOperation = 'lighter';
      surface.render();
      event.preventDefault();
    };

    const stopDrawing = (event: PointerEvent) => {
      if (!isDrawingRef.current) return;

      isDrawingRef.current = false;
      setIsDrawing(false);
      currentStrokeRef.current = null;
      currentShapeRef.current = null;

      if (canvas.releasePointerCapture && canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }

      notifyParentOfChange();
      event.preventDefault();
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
      stopDrawing(event);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointercancel', stopDrawing);
    window.addEventListener('pointerup', handleWindowPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', stopDrawing);
      canvas.removeEventListener('pointercancel', stopDrawing);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      surface.eject();
      surfaceRef.current = null;
      layerRef.current = null;
    };
  }, [buildPath, createStrokeShape, getPointerCoordinates, notifyParentOfChange, renderStrokes, saveStateForUndo]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    surface.resize(width, height);
    // ART writes fixed inline px sizes on resize; force responsive sizing.
    surface.element.style.width = '100%';
    surface.element.style.height = '100%';
    renderStrokes();
    notifyParentOfChange();
  }, [height, notifyParentOfChange, renderStrokes, width]);

  const handleUndo = () => {
    if (undoStackRef.current.length <= 1) return;

    undoStackRef.current.pop();
    strokesRef.current = cloneStrokes(undoStackRef.current[undoStackRef.current.length - 1]);
    renderStrokes();
    setCanUndo(undoStackRef.current.length > 1);
    notifyParentOfChange();
  };

  const handleClear = () => {
    if (strokesRef.current.length === 0) return;

    saveStateForUndo();
    strokesRef.current = [];
    renderStrokes();
    notifyParentOfChange();
  };

  const setColorFromHex = (hex: string) => {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!match) return;

    setBrushColor({
      r: parseInt(match[1], 16),
      g: parseInt(match[2], 16),
      b: parseInt(match[3], 16),
    });
  };

  return (
    <div className="drawing-canvas-layout">
      <div className="drawing-box canvas-main-box">
        <div className="canvas-wrapper">
          <div ref={hostRef} className={`canvas-host ${isDrawing ? 'is-drawing' : ''}`} />
          <div className="canvas-info">
            Additive color mode: painting colors on top of each other sums light values.
          </div>
        </div>
      </div>

      <div className="drawing-box canvas-tools-box">
        <div className="canvas-toolbar">
          <div className="toolbar-box brush-settings-box">
            <div className="brush-settings-grid">
              <div className="tool-group brush-group">
                <label>Brush:</label>
                <div className="brush-preset-grid">
                  {BRUSH_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={brushPresetId === preset.id ? 'active' : ''}
                      onClick={() => setBrushPresetId(preset.id)}
                      title={preset.label}
                    >
                      <span aria-hidden="true">{preset.icon}</span> {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="tool-group size-group">
                <label className="size-label">
                  Size:
                  <input
                    type="range"
                    min="1"
                    max="40"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                  />
                  <span>{brushSize}px</span>
                </label>
              </div>

              <div className="tool-group color-picker-group mixer-group">
                <label>Color Mixer</label>
                <div className="swatch-preview" style={{ backgroundColor: `rgb(${brushColor.r}, ${brushColor.g}, ${brushColor.b})` }} />

                <div className="palette-grid">
                  {PALETTE.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className="palette-swatch"
                      style={{ backgroundColor: hex }}
                      onClick={() => setColorFromHex(hex)}
                      title={hex}
                      aria-label={`Pick color ${hex}`}
                    />
                  ))}
                </div>

                <label className="rgb-slider">
                  R
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={brushColor.r}
                    onChange={(e) => setBrushColor((prev) => ({ ...prev, r: Number(e.target.value) }))}
                  />
                  <span>{brushColor.r}</span>
                </label>

                <label className="rgb-slider">
                  G
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={brushColor.g}
                    onChange={(e) => setBrushColor((prev) => ({ ...prev, g: Number(e.target.value) }))}
                  />
                  <span>{brushColor.g}</span>
                </label>

                <label className="rgb-slider">
                  B
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={brushColor.b}
                    onChange={(e) => setBrushColor((prev) => ({ ...prev, b: Number(e.target.value) }))}
                  />
                  <span>{brushColor.b}</span>
                </label>
              </div>
            </div>
          </div>

          <div className="toolbar-box action-settings-box">
            <div className="tool-group action-group">
              <button onClick={handleUndo} disabled={!canUndo} title="Undo last action">
                <span role="img" aria-label="Undo">↶</span> Undo
              </button>
              <button onClick={handleClear} title="Clear canvas">
                <span role="img" aria-label="Clear">🗑️</span> Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

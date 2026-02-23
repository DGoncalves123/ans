import React, { useRef, useState, useEffect } from 'react';
import './DrawingCanvas.css';

interface DrawingCanvasProps {
  width: number;
  height: number;
  onImageChange?: (imageData: ImageData) => void;
}

export function DrawingCanvas({ width, height, onImageChange }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false); // Track drawing state synchronously
  const [brushSize, setBrushSize] = useState(5);
  const [brushColor, setBrushColor] = useState({ r: 255, g: 0, b: 0 });
  const [brushShape, setBrushShape] = useState<'circle' | 'square'>('circle');
  const [tool, setTool] = useState<'draw' | 'erase'>('draw');
  const hasInitializedRef = useRef(false);
  const undoStackRef = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize canvas with black background - ONLY ONCE
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || hasInitializedRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    hasInitializedRef.current = true;
    
    // Initialize with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Save initial state for undo
    const initialState = ctx.getImageData(0, 0, width, height);
    undoStackRef.current = [initialState];
    
    // Notify parent of initial state
    if (onImageChange) {
      const imageData = ctx.getImageData(0, 0, width, height);
      onImageChange(imageData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // Global mouse up listener to catch mouse release anywhere on the page
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDrawingRef.current) {
        setIsDrawing(false);
        isDrawingRef.current = false;
        notifyParentOfChange();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const draw = (x: number, y: number, connectLine = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const color = tool === 'erase' ? '#000000' : `rgb(${brushColor.r}, ${brushColor.g}, ${brushColor.b})`;
    
    // Draw line from last position if connectLine is true
    if (connectLine && lastPosRef.current) {
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize * 2;
      ctx.lineCap = brushShape === 'circle' ? 'round' : 'square';
      ctx.lineJoin = brushShape === 'circle' ? 'round' : 'miter';
      
      ctx.beginPath();
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    
    // Draw brush shape
    if (brushShape === 'circle') {
      ctx.beginPath();
      ctx.arc(x, y, brushSize, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x - brushSize, y - brushSize, brushSize * 2, brushSize * 2);
    }
    
    lastPosRef.current = { x, y };
  };

  const notifyParentOfChange = () => {
    const canvas = canvasRef.current;
    if (!canvas || !onImageChange) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    onImageChange(imageData);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    // Save state for undo before starting new stroke
    saveStateForUndo();

    setIsDrawing(true);
    isDrawingRef.current = true;
    lastPosRef.current = null; // Reset last position for new stroke
    draw(coords.x, coords.y, false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    draw(coords.x, coords.y, true); // Connect with line for smooth drawing
  };

  const handleMouseUp = () => {
    if (isDrawingRef.current) {
      setIsDrawing(false);
      isDrawingRef.current = false;
      lastPosRef.current = null;
      notifyParentOfChange();
    }
  };

  const saveStateForUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = ctx.getImageData(0, 0, width, height);
    undoStackRef.current.push(state);
    
    // Limit undo stack to 20 states
    if (undoStackRef.current.length > 20) {
      undoStackRef.current.shift();
    }
    
    setCanUndo(undoStackRef.current.length > 1);
  };

  const handleUndo = () => {
    if (undoStackRef.current.length <= 1) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Remove current state
    undoStackRef.current.pop();
    
    // Restore previous state
    const previousState = undoStackRef.current[undoStackRef.current.length - 1];
    ctx.putImageData(previousState, 0, 0);
    
    setCanUndo(undoStackRef.current.length > 1);
    notifyParentOfChange();
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    saveStateForUndo();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    notifyParentOfChange();
  };

  const rgbToHex = (r: number, g: number, b: number) => {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 0, b: 0 };
  };

  return (
    <div className="drawing-canvas-container">
      <div className="canvas-toolbar">
        <div className="tool-group">
          <button
            className={tool === 'draw' ? 'active' : ''}
            onClick={() => setTool('draw')}
            title="Draw"
          >
            <span role="img" aria-label="Pencil">✏️</span> Draw
          </button>
          <button
            className={tool === 'erase' ? 'active' : ''}
            onClick={() => setTool('erase')}
            title="Erase"
          >
            <span role="img" aria-label="Eraser">🧹</span> Erase
          </button>
        </div>

        <div className="tool-group">
          <label>Brush Shape:</label>
          <button
            className={brushShape === 'circle' ? 'active' : ''}
            onClick={() => setBrushShape('circle')}
            title="Circle brush"
          >
            <span role="img" aria-label="Circle">⚫</span>
          </button>
          <button
            className={brushShape === 'square' ? 'active' : ''}
            onClick={() => setBrushShape('square')}
            title="Square brush"
          >
            <span role="img" aria-label="Square">⬛</span>
          </button>
        </div>

        <div className="tool-group">
          <label>
            Size:
            <input
              type="range"
              min="1"
              max="30"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
            />
            <span>{brushSize}px</span>
          </label>
        </div>

        <div className="tool-group color-picker-group">
          <label>
            Color:
            <input
              type="color"
              value={rgbToHex(brushColor.r, brushColor.g, brushColor.b)}
              onChange={(e) => setBrushColor(hexToRgb(e.target.value))}
              className="color-input"
            />
          </label>
          <div className="rgb-values">
            <span>R:{brushColor.r}</span>
            <span>G:{brushColor.g}</span>
            <span>B:{brushColor.b}</span>
          </div>
        </div>

        <div className="tool-group">
          <button onClick={handleUndo} disabled={!canUndo} title="Undo last action">
            <span role="img" aria-label="Undo">↶</span> Undo
          </button>
          <button onClick={handleClear} title="Clear canvas">
            <span role="img" aria-label="Clear">🗑️</span> Clear
          </button>
        </div>
      </div>

      <div className="canvas-wrapper" style={{ width: width }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="drawing-canvas"
        />
        <div className="canvas-info">
          {width} × {height} pixels
        </div>
      </div>
    </div>
  );
}

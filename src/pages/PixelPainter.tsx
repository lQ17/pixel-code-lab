import { useEffect, useRef, useState, type PointerEvent } from "react";
import { colorNames, palette } from "../engine/levels";

type Tool = "draw" | "erase" | "pick";

export function PixelPainter({
  colors,
  radius,
  color,
  tool,
  onStroke,
  onPick,
  label = "手动像素画布",
  layer,
}: {
  colors: number[];
  radius: number;
  color: number;
  tool: Tool;
  onStroke: (indices: number[], value: number) => void;
  onPick: (color: number) => void;
  label?: string;
  layer?: number;
}) {
  const side = radius * 2 + 1;
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const drawing = useRef<number[]>([]);
  const pointerId = useRef<number | null>(null);
  const pan = useRef<{ x: number; y: number; left: number; top: number; id: number } | null>(null);
  const [stroke, setStroke] = useState<number[]>([]);
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const [space, setSpace] = useState(false);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const cell = 24;
    ctx.clearRect(0, 0, side * cell, side * cell);
    ctx.fillStyle = "#172a36";
    ctx.fillRect(0, 0, side * cell, side * cell);
    colors.forEach((value, i) => {
      if (!value) return;
      ctx.fillStyle = palette[value];
      ctx.fillRect((i % side) * cell, Math.floor(i / side) * cell, cell, cell);
    });
    if (stroke.length) {
      ctx.fillStyle = tool === "erase" || color === 0 ? "#172a36" : palette[color];
      for (const i of stroke)
        ctx.fillRect((i % side) * cell, Math.floor(i / side) * cell, cell, cell);
    }
    ctx.strokeStyle = "#315064";
    ctx.lineWidth = 1;
    for (let i = 0; i <= side; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell + 0.5, 0);
      ctx.lineTo(i * cell + 0.5, side * cell);
      ctx.moveTo(0, i * cell + 0.5);
      ctx.lineTo(side * cell, i * cell + 0.5);
      ctx.stroke();
    }
  }, [colors, side, stroke, tool, color]);

  const at = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * side);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * side);
    return x >= 0 && y >= 0 && x < side && y < side ? y * side + x : -1;
  };
  const add = (next: number) => {
    if (next < 0) return;
    const previous = drawing.current.at(-1);
    if (previous === undefined) drawing.current.push(next);
    else {
      const px = previous % side;
      const py = Math.floor(previous / side);
      const nx = next % side;
      const ny = Math.floor(next / side);
      const steps = Math.max(Math.abs(nx - px), Math.abs(ny - py));
      for (let i = 1; i <= steps; i++)
        drawing.current.push(
          Math.round(py + ((ny - py) * i) / steps) * side +
            Math.round(px + ((nx - px) * i) / steps),
        );
    }
    setStroke([...new Set(drawing.current)]);
  };
  const finish = () => {
    if (drawing.current.length)
      onStroke([...new Set(drawing.current)], tool === "erase" ? 0 : color);
    drawing.current = [];
    pointerId.current = null;
    pan.current = null;
    setStroke([]);
  };
  return (
    <div className="admin-pixel-editor" tabIndex={0} onKeyDown={(event) => {
      if (event.code === "Space" && event.target === event.currentTarget) {
        event.preventDefault();
        setSpace(true);
      }
    }} onKeyUp={(event) => {
      if (event.code === "Space") setSpace(false);
    }} onBlur={() => setSpace(false)}>
      <div className="admin-row">
        <button onClick={() => setZoom((v) => Math.max(0.5, v / 1.25))} aria-label="缩小网格">－</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((v) => Math.min(4, v * 1.25))} aria-label="放大网格">＋</button>
        <button onClick={() => setZoom(1)}>重置缩放</button>
        <span className="admin-coordinate" aria-live="off">
          {hover === null ? "移动到网格查看坐标" : `x ${hover % side - radius} · y ${radius - Math.floor(hover / side)}${layer === undefined ? "" : ` · z ${layer}`} · ${colorNames[colors[hover]]}`}
        </span>
      </div>
      <div className="admin-pixel-scroll" ref={scroller}>
        <canvas
          ref={canvas}
          className="admin-pixel-canvas"
          width={side * 24}
          height={side * 24}
          aria-label={label}
          style={{ width: `${side * 24 * zoom}px`, cursor: space ? "grab" : "crosshair" }}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (event.button !== 0 && event.button !== 1) return;
            scroller.current?.parentElement?.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            if (event.button === 1 || space) {
              const element = scroller.current;
              if (element) pan.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop, id: event.pointerId };
              return;
            }
            const i = at(event);
            if (tool === "pick") { if (i >= 0) onPick(colors[i]); return; }
            pointerId.current = event.pointerId;
            drawing.current = [];
            add(i);
          }}
          onPointerMove={(event) => {
            const i = at(event);
            setHover(i >= 0 ? i : null);
            if (pan.current?.id === event.pointerId && scroller.current) {
              scroller.current.scrollLeft = pan.current.left + pan.current.x - event.clientX;
              scroller.current.scrollTop = pan.current.top + pan.current.y - event.clientY;
            } else if (pointerId.current === event.pointerId) add(i);
          }}
          onPointerLeave={() => setHover(null)}
          onPointerUp={finish}
          onPointerCancel={() => { drawing.current = []; pointerId.current = null; pan.current = null; setStroke([]); }}
        />
      </div>
      <p className="admin-hint">左键绘制 · 中键或空格拖动平移 · 一次笔画可整体撤销</p>
    </div>
  );
}

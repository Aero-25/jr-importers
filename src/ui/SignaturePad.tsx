import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export interface SignaturePadHandle {
  /** PNG data URI, or null when nothing has been drawn. */
  toDataUrl: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

/**
 * Finger/stylus signature capture.
 *
 * Most customers open the acceptance link on a phone, so this is pointer-based
 * (covering touch, pen and mouse in one path) and sized to stay comfortably
 * within a mobile viewport. The canvas is drawn at devicePixelRatio so the
 * exported signature is not soft on a retina screen.
 */
export function SignaturePad({
  onChange,
  disabled = false,
  height = 180,
  className,
}: {
  /** Fires with the PNG data URI on every stroke end, or null once cleared. */
  onChange?: (dataUrl: string | null) => void;
  disabled?: boolean;
  height?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Ink is always dark: the exported PNG sits on white paper in the PDF,
    // regardless of the theme the customer's phone is using.
    ctx.strokeStyle = '#0f172a';
  }, []);

  useEffect(() => {
    setup();
    window.addEventListener('resize', setup);
    return () => window.removeEventListener('resize', setup);
  }, [setup]);

  function pointFor(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const { x, y } = pointFor(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawingRef.current = true;
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const { x, y } = pointFor(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    onChange?.(hasInk ? (canvasRef.current?.toDataURL('image/png') ?? null) : null);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange?.(null);
  }

  return (
    <div className={className}>
      <div
        className={cn(
          'relative overflow-hidden rounded-lg border-2 border-dashed border-hairline bg-white',
          disabled && 'opacity-60',
        )}
      >
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: 'none' }}
          className="w-full cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label="Signature area — sign with your finger or mouse"
          role="img"
        />

        {!hasInk && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Sign here
          </p>
        )}

        {/* Signing baseline, the way a paper form has one. */}
        <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-slate-300" />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-ink-subtle">
          {hasInk ? 'Signature captured.' : 'Use your finger, stylus or mouse.'}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!hasInk || disabled}
          onClick={clear}
          icon={<Eraser className="h-3.5 w-3.5" />}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

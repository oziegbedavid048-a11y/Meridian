import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { bollinger, ema, macd, rsi, sma } from '../lib/indicators.js';

/**
 * Price chart drawn from real market candles.
 *
 * Nothing here invents prices: it renders exactly the open, high, low and
 * close values the server returned. Lines mark the client's own entry, stop
 * loss and take profit, and the stop loss and take profit can be dragged.
 *
 * Gestures: scroll or pinch to zoom, drag to move through time.
 */

const PAD = { top: 14, right: 72, bottom: 26, left: 8 };
const MIN_CANDLE_W = 3;
const SUB_H = 92; // height of an indicator pane such as RSI
const SUB_GAP = 10;
const HIT = 10; // how close, in pixels, a tap must be to a drawing to pick it

function niceTicks(min, max, count = 6) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const first = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = first; v <= max + step * 0.001; v += step) ticks.push(v);
  return ticks;
}

function formatTime(seconds, timeframe) {
  const d = new Date(seconds * 1000);
  const intraday = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4'].includes(timeframe);
  return intraday
    ? d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function formatDateTime(seconds) {
  return new Date(seconds * 1000).toLocaleString('en-CA', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** Points of a series as an SVG path, lifting the pen where the series has gaps. */
function pathOf(values, x, y) {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || v === undefined || Number.isNaN(v)) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export default function CandleChart({
  candles = [],
  digits = 2,
  timeframe = 'H1',
  bid = null,
  ask = null,
  lines = [],
  loading = false,
  height = 420,
  type = 'candles',
  indicators = {},
  drawings = [],
  tool = 'none',
  onDrawingsChange = null,
  onLevelChange = null,
}) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState(null);
  const [visible, setVisible] = useState(120);
  const [offset, setOffset] = useState(0); // candles scrolled off the right edge
  const [panning, setPanning] = useState(false);
  const [dragLevel, setDragLevel] = useState(null); // { line, price } while a stop is being dragged
  const [pending, setPending] = useState(null); // first point of a trend line
  const dragRef = useRef(null);
  const [cursor, setCursor] = useState(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const total = candles.length;
  const point = 10 ** -digits;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)));
    ro.observe(el);
    setWidth(Math.max(320, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // A half-drawn trend line is dropped when the tool changes.
  useEffect(() => { setPending(null); }, [tool]);

  const clampView = useCallback((v, o) => {
    const count = Math.min(Math.max(20, Math.round(v)), Math.max(20, total));
    return [count, Math.min(Math.max(0, Math.round(o)), Math.max(0, total - count))];
  }, [total]);

  const zoomBy = useCallback((factor) => {
    setVisible((v) => clampView(v * factor, 0)[0]);
  }, [clampView]);

  const [count, off] = clampView(visible, offset);
  const startIdx = Math.max(0, total - count - off);
  const endIdx = total - off;
  const shown = useMemo(() => candles.slice(startIdx, endIdx), [candles, startIdx, endIdx]);

  // Indicators are worked out on all the candles, then cut to what is on screen.
  const series = useMemo(() => {
    const closes = candles.map((c) => c.c);
    return {
      sma: indicators.sma ? sma(closes, 20) : null,
      ema: indicators.ema ? ema(closes, 50) : null,
      bb: indicators.bb ? bollinger(closes, 20, 2) : null,
      rsi: indicators.rsi ? rsi(closes, 14) : null,
      macd: indicators.macd ? macd(closes, 12, 26, 9) : null,
    };
  }, [candles, indicators.sma, indicators.ema, indicators.bb, indicators.rsi, indicators.macd]);
  const cut = (arr) => (arr ? arr.slice(startIdx, endIdx) : null);

  const subs = [indicators.rsi && 'rsi', indicators.macd && 'macd'].filter(Boolean);
  const svgHeight = height + subs.length * (SUB_H + SUB_GAP);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const plot = useMemo(() => {
    const w = width - PAD.left - PAD.right;
    const h = height - PAD.top - PAD.bottom;
    if (!shown.length || w <= 0) return null;

    let lo = Math.min(...shown.map((c) => c.l));
    let hi = Math.max(...shown.map((c) => c.h));
    if (series.bb) {
      [series.bb.upper, series.bb.lower].forEach((arr) => arr.slice(startIdx, endIdx).forEach((v) => {
        if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      }));
    }
    // Keep marker lines (stop loss, take profit) inside the view.
    lines.forEach((l) => {
      if (typeof l.price !== 'number') return;
      lo = Math.min(lo, l.price);
      hi = Math.max(hi, l.price);
    });
    if (bid) { lo = Math.min(lo, bid); hi = Math.max(hi, bid); }
    const pad = (hi - lo) * 0.08 || Math.max(hi * 0.001, 10 ** -digits);
    lo -= pad;
    hi += pad;

    const step = w / shown.length;
    const body = Math.max(MIN_CANDLE_W, Math.min(16, step * 0.68));
    const x = (i) => PAD.left + step * (i + 0.5);
    const y = (p) => PAD.top + ((hi - p) / (hi - lo)) * h;
    const price = (py) => hi - ((py - PAD.top) / h) * (hi - lo);
    return { w, h, lo, hi, step, body, x, y, price };
  }, [shown, width, height, digits, lines, bid, series.bb, startIdx, endIdx]);

  /* ----- time and price from a position on the chart ----- */
  const barSeconds = total > 1 ? Math.max(1, candles[total - 1].t - candles[total - 2].t) : 3600;

  const timeToIdx = useCallback((t) => {
    if (!total) return 0;
    if (t <= candles[0].t) return (t - candles[0].t) / barSeconds;
    let lo = 0;
    let hi = total - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (candles[mid].t <= t) lo = mid; else hi = mid - 1;
    }
    if (lo >= total - 1) return lo + (t - candles[lo].t) / barSeconds;
    return lo + (t - candles[lo].t) / (candles[lo + 1].t - candles[lo].t);
  }, [candles, total, barSeconds]);

  const idxToTime = useCallback((gi) => {
    if (!total) return 0;
    if (gi <= 0) return candles[0].t + gi * barSeconds;
    const f = Math.floor(gi);
    if (f >= total - 1) return candles[total - 1].t + (gi - (total - 1)) * barSeconds;
    return candles[f].t + (gi - f) * (candles[f + 1].t - candles[f].t);
  }, [candles, total, barSeconds]);

  const local = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  };
  const snap = (p) => Math.round(p / point) * point;
  const clampY = (py) => Math.min(Math.max(py, PAD.top), PAD.top + plot.h);
  const toChart = (e) => {
    const { px, py } = local(e);
    const gi = startIdx + (px - PAD.left) / plot.step - 0.5;
    return { px, py, t: Math.round(idxToTime(gi)), p: snap(plot.price(clampY(py))) };
  };
  const gx = (t) => plot.x(timeToIdx(t) - startIdx);

  /* ----- drawing tools ----- */
  const addDrawing = (d) => onDrawingsChange
    && onDrawingsChange([...drawings, { id: `${Date.now()}${Math.random().toString(16).slice(2, 6)}`, ...d }]);

  const hitDrawing = (px, py) => drawings.find((d) => {
    if (d.type === 'h') return Math.abs(plot.y(d.p) - py) <= HIT;
    return distToSegment(px, py, gx(d.a.t), plot.y(d.a.p), gx(d.b.t), plot.y(d.b.p)) <= HIT;
  });

  const drawWith = (e) => {
    const c = toChart(e);
    if (tool === 'hline') {
      addDrawing({ type: 'h', p: c.p });
    } else if (tool === 'trend') {
      if (!pending) {
        setPending({ t: c.t, p: c.p });
      } else {
        addDrawing({ type: 't', a: pending, b: { t: c.t, p: c.p } });
        setPending(null);
      }
    } else if (tool === 'erase') {
      const hit = hitDrawing(c.px, c.py);
      if (hit && onDrawingsChange) onDrawingsChange(drawings.filter((d) => d.id !== hit.id));
    }
  };

  /* ----- pointer: hover, drag to scroll, pinch to zoom ----- */
  const onMove = (e) => {
    if (!plot) return;
    const { px, py } = local(e);
    const i = Math.floor((px - PAD.left) / plot.step);
    setCursor(tool === 'trend' && pending ? toChart(e) : null);
    if (i < 0 || i >= shown.length) { setHover(null); return; }
    setHover({ i, y: py });
  };

  // Keeps a drag going when the finger or mouse leaves the element. Not every input supports it.
  const capture = (e) => {
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* the drag still works while the pointer stays over the chart */
    }
  };

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e) => {
    if (!plot) return;
    if (tool !== 'none') { drawWith(e); return; }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    capture(e);
    gesture.current = pointers.current.size === 2
      ? { kind: 'pinch', start: spread(), count }
      : { kind: 'pan', x: e.clientX, off };
    setPanning(true);
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) { onMove(e); return; }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g || !plot) return;
    if (g.kind === 'pinch' && pointers.current.size === 2) {
      setVisible(clampView(g.count * (g.start / Math.max(1, spread())), 0)[0]);
    } else if (g.kind === 'pan') {
      setOffset(clampView(count, g.off + Math.round((e.clientX - g.x) / plot.step))[1]);
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
    if (pointers.current.size === 1) {
      const [only] = [...pointers.current.values()];
      gesture.current = { kind: 'pan', x: only.x, off: clampView(count, offset)[1] };
    }
    if (!pointers.current.size) setPanning(false);
  };

  // Keyboard: + and - zoom, arrows move through time.
  const onKeyDown = (e) => {
    if (e.key === '+' || e.key === '=') zoomBy(0.8);
    if (e.key === '-' || e.key === '_') zoomBy(1.25);
    if (e.key === 'ArrowLeft') setOffset(clampView(count, off + 5)[1]);
    if (e.key === 'ArrowRight') setOffset(clampView(count, off - 5)[1]);
    if (e.key === 'Escape') setPending(null);
  };

  /* ----- dragging a stop loss or take profit ----- */
  // The drag is followed on the window, so it carries on even though the
  // handle on screen changes shape as soon as the drag starts.
  const startLevelDrag = (line, e) => {
    if (!onLevelChange || !plot) return;
    e.stopPropagation();
    const entry = lines.find((l) => l.tradeId === line.tradeId && l.kind === 'entry');
    const next = { line, price: typeof line.price === 'number' ? line.price : entry?.price ?? plot.price(PAD.top) };
    dragRef.current = next;
    setDragLevel(next);
  };

  const dragging = Boolean(dragLevel);
  useEffect(() => {
    if (!dragging) return undefined;
    const move = (e) => {
      const d = dragRef.current;
      if (!d || !plot || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const next = { ...d, price: snap(plot.price(clampY(e.clientY - rect.top))) };
      dragRef.current = next;
      setDragLevel(next);
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragLevel(null);
      if (d && onLevelChange && d.price !== d.line.price) onLevelChange(d.line, d.price);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, plot, onLevelChange]);

  const fmt = (p) => p.toFixed(digits);
  const hovered = hover ? shown[hover.i] : null;
  const lastIdx = shown.length - 1;
  const bottomOfPlots = svgHeight - PAD.bottom;
  const rsiNow = series.rsi ? series.rsi[hover ? startIdx + hover.i : endIdx - 1] : null;

  const subTop = (n) => PAD.top + (height - PAD.top - PAD.bottom) + SUB_GAP + n * (SUB_H + SUB_GAP);
  const bars = type === 'bars';

  const renderRsi = (top) => {
    const s = cut(series.rsi);
    const yy = (v) => top + ((100 - v) / 100) * SUB_H;
    return (
      <g className="chart__sub">
        <rect x={PAD.left} y={top} width={plot.w} height={SUB_H} className="chart__subbox" />
        {[30, 70].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={PAD.left + plot.w} y1={yy(v)} y2={yy(v)} className="chart__grid" />
            <text x={PAD.left + plot.w + 6} y={yy(v) + 3} className="chart__axis">{v}</text>
          </g>
        ))}
        <path d={pathOf(s, (i) => plot.x(i), yy)} className="chart__ind chart__ind--rsi" />
        <text x={PAD.left + 6} y={top + 13} className="chart__sublabel">
          RSI(14){rsiNow !== null && rsiNow !== undefined ? ` ${rsiNow.toFixed(2)}` : ''}
        </text>
      </g>
    );
  };

  const renderMacd = (top) => {
    const m = series.macd;
    const line = cut(m.line);
    const sig = cut(m.signal);
    const hist = cut(m.hist);
    const vals = [...line, ...sig, ...hist].filter((v) => v !== null);
    const bound = Math.max(...vals.map((v) => Math.abs(v)), point) * 1.1;
    const yy = (v) => top + SUB_H / 2 - (v / bound) * (SUB_H / 2);
    const idx = hover ? hover.i : lastIdx;
    return (
      <g className="chart__sub">
        <rect x={PAD.left} y={top} width={plot.w} height={SUB_H} className="chart__subbox" />
        <line x1={PAD.left} x2={PAD.left + plot.w} y1={yy(0)} y2={yy(0)} className="chart__grid" />
        {hist.map((v, i) => (v === null ? null : (
          <rect key={i} x={plot.x(i) - plot.body / 2} width={plot.body}
            y={Math.min(yy(0), yy(v))} height={Math.max(1, Math.abs(yy(v) - yy(0)))}
            className={v >= 0 ? 'chart__macdbar chart__macdbar--up' : 'chart__macdbar chart__macdbar--down'} />
        )))}
        <path d={pathOf(line, (i) => plot.x(i), yy)} className="chart__ind chart__ind--macd" />
        <path d={pathOf(sig, (i) => plot.x(i), yy)} className="chart__ind chart__ind--signal" />
        <text x={PAD.left + 6} y={top + 13} className="chart__sublabel">
          MACD(12,26,9){line[idx] !== null && line[idx] !== undefined ? ` ${line[idx].toFixed(digits + 1)}` : ''}
        </text>
      </g>
    );
  };

  const entryOf = (tradeId) => lines.find((l) => l.tradeId === tradeId && l.kind === 'entry');
  const canDrag = !!onLevelChange && tool === 'none';

  return (
    <div className={`chart ${tool !== 'none' ? 'chart--drawing' : ''}`} ref={wrapRef}>
      {loading && <div className="chart__loading" role="status">Loading chart…</div>}
      {!loading && !shown.length && <div className="chart__loading" role="status">No chart data for this instrument.</div>}

      <svg
        ref={svgRef}
        width={width}
        height={svgHeight}
        className={`chart__svg ${panning ? 'is-dragging' : ''}`}
        role="img"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={`Price chart, ${timeframe} candles. ${shown.length ? `Latest close ${fmt(shown[shown.length - 1].c)}.` : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseLeave={() => { setHover(null); setCursor(null); }}
      >
        {plot && (
          <>
            {/* price grid */}
            {niceTicks(plot.lo, plot.hi).map((p) => (
              <g key={`p${p}`}>
                <line x1={PAD.left} x2={PAD.left + plot.w} y1={plot.y(p)} y2={plot.y(p)} className="chart__grid" />
                <text x={PAD.left + plot.w + 6} y={plot.y(p) + 3} className="chart__axis">{fmt(p)}</text>
              </g>
            ))}

            {/* time grid */}
            {shown.map((c, i) => {
              const every = Math.max(1, Math.round(shown.length / 7));
              if (i % every !== 0 || i === 0) return null;
              return (
                <g key={`t${c.t}`}>
                  <line x1={plot.x(i)} x2={plot.x(i)} y1={PAD.top} y2={bottomOfPlots} className="chart__grid chart__grid--v" />
                  <text x={plot.x(i)} y={svgHeight - 8} textAnchor="middle" className="chart__axis">{formatTime(c.t, timeframe)}</text>
                </g>
              );
            })}

            {/* Bollinger bands sit behind the price */}
            {series.bb && (
              <g className="chart__bb">
                <path d={pathOf(cut(series.bb.upper), (i) => plot.x(i), plot.y)} className="chart__ind chart__ind--bb" />
                <path d={pathOf(cut(series.bb.lower), (i) => plot.x(i), plot.y)} className="chart__ind chart__ind--bb" />
                <path d={pathOf(cut(series.bb.mid), (i) => plot.x(i), plot.y)} className="chart__ind chart__ind--bbmid" />
              </g>
            )}

            {/* price */}
            {type === 'line' ? (
              <path d={pathOf(shown.map((c) => c.c), (i) => plot.x(i), plot.y)} className="chart__priceline" />
            ) : shown.map((c, i) => {
              const up = c.c >= c.o;
              const top = plot.y(Math.max(c.o, c.c));
              const bottom = plot.y(Math.min(c.o, c.c));
              const tick = Math.max(3, plot.body / 2);
              return (
                <g key={c.t} className={up ? 'candle candle--up' : 'candle candle--down'}>
                  <line x1={plot.x(i)} x2={plot.x(i)} y1={plot.y(c.h)} y2={plot.y(c.l)} className="candle__wick" />
                  {bars ? (
                    <>
                      <line x1={plot.x(i) - tick} x2={plot.x(i)} y1={plot.y(c.o)} y2={plot.y(c.o)} className="candle__wick" />
                      <line x1={plot.x(i)} x2={plot.x(i) + tick} y1={plot.y(c.c)} y2={plot.y(c.c)} className="candle__wick" />
                    </>
                  ) : (
                    <rect x={plot.x(i) - plot.body / 2} y={top} width={plot.body}
                      height={Math.max(1, bottom - top)} className="candle__body" />
                  )}
                </g>
              );
            })}

            {/* moving averages */}
            {series.sma && <path d={pathOf(cut(series.sma), (i) => plot.x(i), plot.y)} className="chart__ind chart__ind--sma" />}
            {series.ema && <path d={pathOf(cut(series.ema), (i) => plot.x(i), plot.y)} className="chart__ind chart__ind--ema" />}

            {/* the client's own drawings */}
            {drawings.map((d) => (d.type === 'h' ? (
              <g key={d.id} className="chart__drawing">
                <line x1={PAD.left} x2={PAD.left + plot.w} y1={plot.y(d.p)} y2={plot.y(d.p)} />
                <text x={PAD.left + plot.w - 4} y={plot.y(d.p) - 4} textAnchor="end">{fmt(d.p)}</text>
              </g>
            ) : (
              <g key={d.id} className="chart__drawing">
                <line x1={gx(d.a.t)} y1={plot.y(d.a.p)} x2={gx(d.b.t)} y2={plot.y(d.b.p)} />
                <circle cx={gx(d.a.t)} cy={plot.y(d.a.p)} r="3.5" />
                <circle cx={gx(d.b.t)} cy={plot.y(d.b.p)} r="3.5" />
              </g>
            )))}
            {pending && cursor && (
              <g className="chart__drawing chart__drawing--draft">
                <line x1={gx(pending.t)} y1={plot.y(pending.p)} x2={gx(cursor.t)} y2={plot.y(cursor.p)} />
                <circle cx={gx(pending.t)} cy={plot.y(pending.p)} r="3.5" />
              </g>
            )}

            {/* bid / ask */}
            {bid != null && (
              <g className="chart__last">
                <line x1={PAD.left} x2={PAD.left + plot.w} y1={plot.y(bid)} y2={plot.y(bid)} />
                <rect x={PAD.left + plot.w + 2} y={plot.y(bid) - 9} width={PAD.right - 6} height={18} rx="2" />
                <text x={PAD.left + plot.w + 7} y={plot.y(bid) + 4}>{fmt(bid)}</text>
              </g>
            )}
            {ask != null && Math.abs(plot.y(ask) - plot.y(bid ?? ask)) > 10 && (
              <line x1={PAD.left} x2={PAD.left + plot.w} y1={plot.y(ask)} y2={plot.y(ask)} className="chart__ask" />
            )}

            {/* the client's own entry, stop loss and take profit */}
            {lines.map((l, idx) => {
              const beingDragged = dragLevel && dragLevel.line.tradeId === l.tradeId && dragLevel.line.kind === l.kind;
              const value = beingDragged ? dragLevel.price : l.price;
              const entry = entryOf(l.tradeId);
              const draggable = canDrag && l.draggable && (l.kind === 'sl' || l.kind === 'tp');
              const key = `${l.kind}-${l.tradeId}-${idx}`;

              // A level that is not set yet is a small tab on the entry line to pull out.
              if (typeof value !== 'number') {
                if (!draggable || !entry) return null;
                const cx = PAD.left + plot.w - (l.kind === 'sl' ? 74 : 38);
                return (
                  <g key={key} className={`chart__tab chart__line--${l.kind}`}
                    onPointerDown={(e) => startLevelDrag(l, e)}>
                    <rect x={cx} y={plot.y(entry.price) - 12} width="32" height="24" rx="12" />
                    <text x={cx + 16} y={plot.y(entry.price) + 4} textAnchor="middle">{l.kind === 'sl' ? 'SL' : 'TP'}</text>
                  </g>
                );
              }
              const yy = plot.y(value);
              return (
                <g key={key} className={`chart__line chart__line--${l.kind}`}>
                  <line x1={PAD.left} x2={PAD.left + plot.w} y1={yy} y2={yy} />
                  <text x={PAD.left + 6} y={yy - 5}>{l.label}</text>
                  {draggable && (
                    <g className="chart__handle" onPointerDown={(e) => startLevelDrag(l, e)}>
                      <rect x={PAD.left} y={yy - 12} width={plot.w + PAD.right - 8} height="24" className="chart__hit" />
                      <rect x={PAD.left + plot.w + 2} y={yy - 9} width={PAD.right - 6} height="18" rx="9" className="chart__pill" />
                      <text x={PAD.left + plot.w + PAD.right / 2 - 1} y={yy + 4} textAnchor="middle" className="chart__pilltext">{fmt(value)}</text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* indicator panes */}
            {subs.map((name, n) => (name === 'rsi'
              ? <g key="rsi">{renderRsi(subTop(n))}</g>
              : <g key="macd">{renderMacd(subTop(n))}</g>))}

            {/* crosshair */}
            {hovered && !dragLevel && (
              <g className="chart__cross">
                <line x1={plot.x(hover.i)} x2={plot.x(hover.i)} y1={PAD.top} y2={bottomOfPlots} />
                <line x1={PAD.left} x2={PAD.left + plot.w} y1={hover.y} y2={hover.y} />
              </g>
            )}
          </>
        )}
      </svg>

      <div className="chart__readout" aria-live="off">
        {dragLevel ? (
          <span>Release to set {dragLevel.line.kind === 'sl' ? 'stop loss' : 'take profit'} at <b>{fmt(dragLevel.price)}</b></span>
        ) : tool !== 'none' ? (
          <span className="chart__hint">
            {tool === 'hline' && 'Tap the chart to place a horizontal line.'}
            {tool === 'trend' && (pending ? 'Tap a second point to finish the trend line.' : 'Tap a first point for the trend line.')}
            {tool === 'erase' && 'Tap a line to remove it.'}
          </span>
        ) : hovered ? (
          <>
            <span>{formatDateTime(hovered.t)}</span>
            <span>O <b>{fmt(hovered.o)}</b></span>
            <span>H <b>{fmt(hovered.h)}</b></span>
            <span>L <b>{fmt(hovered.l)}</b></span>
            <span>C <b className={hovered.c >= hovered.o ? 'up' : 'down'}>{fmt(hovered.c)}</b></span>
            {hovered.v > 0 && <span>V <b>{hovered.v.toLocaleString('en-CA')}</b></span>}
          </>
        ) : (
          <span className="chart__hint">Scroll or pinch to zoom. Drag to move through time. Drag a stop loss or take profit line to change it.</span>
        )}
      </div>
    </div>
  );
}

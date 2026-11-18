/*
 * Skeleton placeholders: grey shapes that shimmer where content will appear,
 * so a screen keeps its layout while its data loads. Screen readers hear one
 * "Loading" instead of the shapes.
 */

export function Skel({ w = '100%', h = 14, r = 6, className = '' }) {
  return <span className={`skel ${className}`} style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}

/** A list of rows: a title and subtitle on the left, one or two figures on the right. */
export function SkeletonRows({ rows = 6, right = 2, label = 'Loading' }) {
  return (
    <div className="skel-list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-row" key={i}>
          <span className="skel-row__left">
            <Skel w={`${55 + ((i * 17) % 30)}%`} h={14} />
            <Skel w="35%" h={11} />
          </span>
          {Array.from({ length: right }, (_, j) => <Skel key={j} w={64} h={16} />)}
        </div>
      ))}
    </div>
  );
}

/** Label-and-value lines, like the balance figures. */
export function SkeletonFigures({ lines = 4, label = 'Loading' }) {
  return (
    <div className="skel-figures" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, i) => (
        <div className="skel-figure" key={i}><Skel w={`${30 + ((i * 13) % 20)}%`} h={13} /><Skel w={72} h={13} /></div>
      ))}
    </div>
  );
}

/** Headline cards: a line of title text over a short source line. */
export function SkeletonNews({ items = 5, label = 'Loading news' }) {
  return (
    <div className="skel-list" role="status" aria-label={label}>
      {Array.from({ length: items }, (_, i) => (
        <div className="skel-news" key={i}>
          <Skel w="92%" h={15} />
          <Skel w={`${50 + ((i * 11) % 30)}%`} h={15} />
          <Skel w="30%" h={11} />
        </div>
      ))}
    </div>
  );
}

/** A chart-shaped placeholder: bars of different heights over a baseline. */
export function SkeletonChart({ height = 320 }) {
  const bars = [42, 55, 48, 63, 58, 70, 52, 61, 74, 66, 57, 69, 80, 72, 64, 77, 70, 83, 76, 68, 79, 73];
  return (
    <div className="skel-chart" style={{ height }} role="status" aria-label="Loading chart">
      {bars.map((b, i) => <span key={i} className="skel skel-chart__bar" style={{ height: `${b}%` }} />)}
    </div>
  );
}

/** A whole dashboard page while the account is being checked. */
export function SkeletonPage() {
  return (
    <div className="skel-page" role="status" aria-label="Loading your dashboard">
      <div className="skel-page__bar"><Skel w={180} h={20} /><span style={{ flex: 1 }} /><Skel w={32} h={32} r={16} /></div>
      <div className="skel-page__body">
        <SkeletonChart height={360} />
        <SkeletonRows rows={4} />
      </div>
    </div>
  );
}

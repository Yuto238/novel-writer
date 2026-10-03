export interface Series { name: string; color: string; points: { x: number; y: number; label?: string }[]; dashed?: boolean }

export function CurveChart({ series, xMax, xUnit, yMin = 0, yMax = 1, height = 200, markers }: { series: Series[]; xMax: number; xUnit: string; yMin?: number; yMax?: number; height?: number; markers?: { x: number; label: string }[] }) {
  const W = 640, H = height, pl = 34, pr = 10, pt = 10, pb = 24;
  const sx = (x: number) => pl + (x / Math.max(1, xMax)) * (W - pl - pr);
  const sy = (y: number) => pt + (1 - (y - yMin) / (yMax - yMin || 1)) * (H - pt - pb);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg className="sd-chart" viewBox={`0 0 ${W} ${H}`} role="img">
      {[yMin, (yMin + yMax) / 2, yMax].map((v) => <g key={v}><line x1={pl} x2={W - pr} y1={sy(v)} y2={sy(v)} className="grid" /><text x={pl - 5} y={sy(v) + 3} textAnchor="end">{v.toFixed(1)}</text></g>)}
      {ticks.map((t) => <text key={t} x={sx(t * xMax)} y={H - 6} textAnchor="middle">{Math.round(t * xMax)}{xUnit}</text>)}
      {markers?.map((m) => <g key={m.label}><line x1={sx(m.x)} x2={sx(m.x)} y1={pt} y2={H - pb} className="marker" /><text x={sx(m.x)} y={pt + 8} textAnchor="middle" className="marker-label">{m.label}</text></g>)}
      {series.map((s) => s.points.length > 0 && <g key={s.name}>
        <polyline fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")} />
        {s.points.length <= 80 && s.points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.6} fill={s.color}><title>{p.label ?? `${p.y.toFixed(2)}`}</title></circle>)}
      </g>)}
    </svg>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return <div className="sd-legend">{items.map((i) => <span key={i.name}><i style={{ background: i.color }} />{i.name}</span>)}</div>;
}

export function Radar({ axes, series, size = 280 }: { axes: string[]; series: { name: string; color: string; values: number[] }[]; size?: number }) {
  const c = size / 2, R = size / 2 - 42, n = axes.length;
  const pt = (i: number, v: number) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v] as const; };
  return (
    <svg className="sd-radar" viewBox={`0 0 ${size} ${size}`} role="img">
      {[0.25, 0.5, 0.75, 1].map((r) => <polygon key={r} className="grid" fill="none" points={axes.map((_, i) => pt(i, r).join(",")).join(" ")} />)}
      {axes.map((a, i) => { const [x, y] = pt(i, 1.0); const [lx, ly] = pt(i, 1.2); return <g key={a}><line className="grid" x1={c} y1={c} x2={x} y2={y} /><text x={lx} y={ly + 3} textAnchor="middle">{a}</text></g>; })}
      {series.map((s) => <polygon key={s.name} points={s.values.map((v, i) => pt(i, Math.max(0.02, v)).join(",")).join(" ")} fill={s.color} fillOpacity={0.14} stroke={s.color} strokeWidth={2} />)}
    </svg>
  );
}

export function StackBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="sd-stack">
      <div className="bar">{parts.map((p) => <i key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label} ${Math.round((p.value / total) * 100)}%`} />)}</div>
      <div className="sd-legend">{parts.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label} {Math.round((p.value / total) * 100)}%</span>)}</div>
    </div>
  );
}

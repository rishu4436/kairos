export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) {
    return null;
  }
  const width = 128;
  const height = 36;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="text-signal">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.6" points={points} />
    </svg>
  );
}

import type { ChartBar } from "@/domain/observation";

export function CandleChart({ bars }: { bars: readonly ChartBar[] }) {
  if (bars.length < 2) {
    return <p className="text-sm text-muted">Not enough candles to draw a chart.</p>;
  }
  const width = 720;
  const height = 240;
  const pad = 12;
  const values = bars.flatMap((bar) => [Number(bar.high), Number(bar.low)]);
  if (values.some((value) => !Number.isFinite(value))) {
    return <p className="text-sm text-muted">Candle values could not be drawn.</p>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const slot = (width - pad * 2) / bars.length;
  const y = (value: number) => pad + ((max - value) / span) * (height - pad * 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Candlestick chart" className="h-60 w-full">
      {bars.map((bar, index) => {
        const open = Number(bar.open);
        const close = Number(bar.close);
        const high = Number(bar.high);
        const low = Number(bar.low);
        const up = close >= open;
        const x = pad + index * slot + slot / 2;
        const bodyTop = y(Math.max(open, close));
        const bodyHeight = Math.max(1, Math.abs(y(open) - y(close)));
        return (
          <g key={bar.timeMs} className={up ? "text-gain" : "text-loss"}>
            <line x1={x} x2={x} y1={y(high)} y2={y(low)} stroke="currentColor" strokeWidth="1" />
            <rect x={x - Math.max(1, slot * 0.28)} y={bodyTop} width={Math.max(2, slot * 0.56)} height={bodyHeight} fill="currentColor" />
          </g>
        );
      })}
    </svg>
  );
}

/** A circular progress meter. The colour is the brand's in both themes. */
export default function ProgressRing({ percent, size = 96, stroke = 9, label }: {
  percent: number; size?: number; stroke?: number; label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative inline-flex flex-shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-gray-200" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className="stroke-brand-500 transition-[stroke-dashoffset] duration-700"
          strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)}
        />
      </svg>
      <span className="absolute flex flex-col items-center leading-none">
        <span className="text-xl font-bold tabular-nums text-gray-900" style={{ fontSize: size / 4.5 }}>{p}%</span>
        {label && <span className="mt-0.5 text-[10px] text-gray-500">{label}</span>}
      </span>
    </div>
  );
}

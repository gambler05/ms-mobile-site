/** Barres horizontales simples (serveur), une seule teinte : magnitude par catégorie. */
export function KindBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <ul className="space-y-2" role="list">
      {sorted.map((d) => (
        <li key={d.label} className="grid grid-cols-[120px_1fr_32px] items-center gap-2 text-[12.5px]">
          <span className="truncate text-muted">{d.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-hover"><span className="block h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: "var(--chart-1)" }} /></span>
          <span className="tnum text-end font-medium">{d.value}</span>
        </li>
      ))}
      {sorted.length === 0 ? <li className="text-muted">—</li> : null}
    </ul>
  );
}

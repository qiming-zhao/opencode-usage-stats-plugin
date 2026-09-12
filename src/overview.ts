export function compact(value: number): string {
  const units = ["", "K", "M", "B", "T", "P"];
  let unit = 0;
  while (Math.abs(value) >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
  const rounded = Number(value.toFixed(unit ? 2 : 0));
  if (Math.abs(rounded) >= 1000 && unit < units.length - 1) return `${Number((rounded / 1000).toFixed(2))}${units[unit + 1]}`;
  return `${rounded}${units[unit]}`;
}

function levels(values: number[]): number[] {
  const peak = values.reduce((max, value) => value > max ? value : max, 0);
  return values.map(value => {
    if (value <= 0 || peak <= 0) return 0;
    const ratio = value / peak;
    return ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4;
  });
}

const DAY = 86400000;
const date = (label: string) => Date.parse(`${label}T00:00:00Z`);
const label = (at: number) => new Date(at).toISOString().slice(0, 10);
const monday = (at: number) => at - ((new Date(at).getUTCDay() + 6) % 7) * DAY;

export function overview(days: { label: string; total: number }[], today: string, mode: number, width: number) {
  width = Math.max(0, Math.floor(width));
  const totals = new Map<number, number>();
  for (const day of days) {
    const at = date(day.label);
    totals.set(at, (totals.get(at) ?? 0) + day.total);
  }
  const now = date(today), weekly = mode === 1;
  const columns = weekly ? (width >= 52 || width === 0 ? 13 : Math.max(7, Math.floor((width + 1) / 4))) : 7;
  const rows = 7;
  const slots = columns * rows;
  const startAt = monday(now) - (columns - 1) * 7 * DAY;
  const start = label(startAt), end = label(startAt + (slots - 1) * DAY);
  const values = Array<number>(slots).fill(0);
  for (const [at, total] of totals) {
    if (at >= startAt && at <= now) {
      const bucket = Math.floor((at - startAt) / DAY);
      const row = bucket % 7;
      const col = Math.floor(bucket / 7);
      const index = row * columns + col;
      if (index >= 0 && index < values.length) values[index]! += total;
    }
  }
  const weekValues = Array<number>(columns).fill(0);
  for (let i = 0; i < values.length; i++) weekValues[i % columns]! += values[i]!;
  const currentIndex = weekly ? columns - 1 : ((new Date(now).getUTCDay() + 6) % 7) * columns + (columns - 1);
  const labels = Array.from({ length: slots }, (_, i) => {
    const row = Math.floor(i / columns);
    const col = i % columns;
    return label(startAt + (col * 7 + row) * DAY);
  });
  return {
    start, end,
    title: weekly ? "This week" : "Today",
    range: "",
    current: weekly ? weekValues[columns - 1]! : values[currentIndex] ?? 0,
    currentIndex,
    columns,
    rows: 7,
    values,
    weekValues,
    labels,
    trend: levels(values),
    empty: days.length === 0,
    inactive: values.every(value => value === 0),
  };
}

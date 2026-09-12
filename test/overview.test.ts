import { expect, test } from "bun:test";
import { compact, overview } from "../src/overview";

test("compact rounds without a dangling decimal or 1000K", () => {
  expect([0, 999, 1200, 1234, 1000000, 999999, 24132228, 1686543].map(compact)).toEqual(["0", "999", "1.2K", "1.23K", "1M", "1M", "24.13M", "1.69M"]);
});

test("empty and zero records remain distinct with a neutral zero trend", () => {
  for (const mode of [0, 1]) {
    expect(overview([], "2026-03-09", mode, 56).empty).toBe(true);
    const view = overview([{ label: "2026-03-09", total: 0 }], "2026-03-09", mode, 56);
    expect(view.empty).toBe(false);
    expect(view.inactive).toBe(true);
    expect(view.current).toBe(0);
    const expectedSlots = mode === 1 ? 91 : 49;
    const expectedCols = mode === 1 ? 13 : 7;
    expect(view.trend).toEqual(Array(expectedSlots).fill(0));
    expect(view.weekValues).toEqual(Array(expectedCols).fill(0));
  }
});

test("daily window boundaries exclude older and future days across DST", () => {
  const view = overview([
    { label: "2026-01-25", total: 1000 }, { label: "2026-01-26", total: 5 },
    { label: "2026-02-28", total: 500 }, { label: "2026-03-01", total: 10 },
    { label: "2026-03-09", total: 20 }, { label: "2026-03-10", total: 2000 },
  ], "2026-03-09", 0, 56);
  expect(view.start).toBe("2026-01-26");
  expect(view.end).toBe("2026-03-15");
  expect(view.current).toBe(20);
  expect(view.values.reduce((sum, value) => sum + value, 0)).toBe(535);
  expect(view.values[0]).toBe(5);
  expect(view.trend).toEqual(Array.from({length:49}, (_, i) => i === 39 ? 4 : i === 0 || i === 46 || i === 6 ? 1 : 0));
  for (let row = 1; row < 7; row++) expect(view.values[row * 7 + 6]).toBe(0);
});

test("weekly grid spans 13 weeks across the year and excludes older and future records", () => {
  const view = overview([
    { label: "2025-10-05", total: 900 }, { label: "2025-10-06", total: 4 },
    { label: "2025-12-28", total: 20 }, { label: "2025-12-29", total: 10 },
    { label: "2026-01-01", total: 30 }, { label: "2026-01-03", total: 900 },
    { label: "2026-01-05", total: 1000 },
  ], "2026-01-02", 1, 56);
  expect(view.start).toBe("2025-10-06");
  expect(view.end).toBe("2026-01-04");
  expect(view.rows).toBe(7);
  expect(view.columns).toBe(13);
  expect(view.values).toHaveLength(91);
  expect(view.labels[12]).toBe("2025-12-29");
  expect(view.currentIndex).toBe(12);
  expect(view.title).toBe("This week");
  expect(view.current).toBe(40);
  expect(view.weekValues).toEqual([4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 40]);
  expect(view.values.reduce((sum, value) => sum + value, 0)).toBe(64);
  expect(view.trend).toEqual(Array.from({length:91}, (_, i) => i === 51 ? 4 : i === 89 ? 3 : i === 12 ? 2 : i === 0 ? 1 : 0));
  expect(view.values[77]).toBe(0);
  expect(view.values[90]).toBe(0);
});

test("sparse trend keeps the small day visible", () => {
  const days = [{ label: "2026-09-10", total: 30500000 }, { label: "2026-09-11", total: 1686543 }];
  const view = overview(days, "2026-09-11", 0, 56);
  expect(view.trend).toEqual(Array.from({length:49}, (_, i) => i === 27 ? 4 : i === 34 ? 1 : 0));
  expect(view.current).toBe(1686543);
  expect(view.currentIndex).toBe(34);
  expect(view.labels[27]).toBe("2026-09-10");
  expect(view.labels[34]).toBe("2026-09-11");
  expect(view.values[27]).toBe(30500000);
  expect(view.values[34]).toBe(1686543);
});

test("weekly totals retain daily cells, colors and single-day Peak", () => {
  const days = [
    { label: "2026-09-10", total: 30500000 }, { label: "2026-09-11", total: 1686543 },
  ];
  const view = overview(days, "2026-09-11", 1, 56);
  const daily = overview(days, "2026-09-11", 0, 56);
  expect(view.current).toBe(32186543);
  expect(view.currentIndex).toBe(12);
  expect(view.labels[12]).toBe("2026-09-07");
  expect(view.weekValues).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 32186543]);
  expect(view.columns).toBe(13);
  expect(view.values).toHaveLength(91);
  expect(Math.max(...view.values)).toBe(30500000);
  expect(Math.max(...view.values)).toBe(Math.max(...daily.values));
});

test("resizing retains activity in daily and weekly buckets", () => {
  const days = [{ label: "2026-03-01", total: 100 }, { label: "2026-03-09", total: 2 }];
  for (const mode of [0, 1]) for (const width of [0, 1, 5, 14, 24, 80]) {
    const view = overview(days, "2026-03-09", mode, width);
    const slots = mode === 1 ? view.columns * 7 : 49;
    expect([...view.trend]).toHaveLength(slots);
    expect(view.trend.some(level => level > 0)).toBe(true);
    expect(view.current).toBe(2);
  }
});

test("both modes share daily cells across year, week, leap day and DST boundaries", () => {
  for (const [today, start, end, weekday] of [
    ["2026-01-02", "2025-11-17", "2026-01-04", 4],
    ["2026-01-04", "2025-11-17", "2026-01-04", 6],
    ["2026-01-05", "2025-11-24", "2026-01-11", 0],
    ["2024-02-29", "2024-01-15", "2024-03-03", 3],
    ["2026-03-09", "2026-01-26", "2026-03-15", 0],
    ["2026-11-01", "2026-09-14", "2026-11-01", 6],
    ["2026-12-31", "2026-11-16", "2027-01-03", 3],
  ] as const) {
    const startAt = Date.parse(`${start}T00:00:00Z`);
    const dates = Array.from({ length: 49 }, (_, i) => new Date(startAt + i * 86400000).toISOString().slice(0, 10));
    const view = overview(dates.map((label, i) => ({ label, total: i + 1 })), today, 0, 24);
    const weekly = overview(dates.map((label, i) => ({ label, total: i + 1 })), today, 1, 56);
    expect(view.title).toBe("Today");
    expect(weekly.title).toBe("This week");
    expect(view.columns).toBe(7);
    expect(weekly.columns).toBe(13);
    expect(view.currentIndex).toBe(weekday * 7 + 6);
    expect(weekly.currentIndex).toBe(12);
    expect(weekly.weekValues).toHaveLength(13);
    expect(weekly.weekValues[12]).toBe(view.weekValues[6]);
    expect(weekly.current).toBe(weekly.weekValues[12]!);
    expect(view.start).toBe(start);
    expect(view.end).toBe(end);
    for (let row = 0; row < 7; row++) {
      expect(weekly.values[row * 13 + 12]).toBe(view.values[row * 7 + 6]);
      expect(weekly.labels[row * 13 + 12]).toBe(view.labels[row * 7 + 6]);
    }
    expect(view.columns).toBe(7);
    expect(view.rows).toBe(7);
    expect(view.range).toBe("");
    expect(view.labels).toHaveLength(49);
    expect(new Set(view.labels).size).toBe(49);
    expect([...view.labels].sort()).toEqual(dates);
    expect(view.currentIndex).toBe(weekday * 7 + 6);
    expect(view.labels[view.currentIndex]).toBe(today);
    expect(view.current).toBe(43 + weekday);
    for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) {
      const index = row * 7 + col;
      const day = col * 7 + row;
      expect(view.labels[index]).toBe(dates[day]!);
      expect(view.values[index]).toBe(dates[day]! > today ? 0 : day + 1);
      if (dates[day]! > today) expect(view.trend[index]).toBe(0);
    }
  }
});

test("both modes use the single-day visible peak and preserve all color quartile boundaries", () => {
  const totals = [0, 1, 25, 26, 50, 51, 75, 76, 100];
  const days = totals.map((total, i) => ({ label: `2026-09-${String(i + 1).padStart(2, "0")}`, total }));
  for (const mode of [0, 1]) {
    const view = overview([
      ...days, { label: "2026-01-01", total: 1000000 }, { label: "2026-09-12", total: 1000000 },
    ], "2026-09-11", mode, 56);
    expect(Math.max(...view.values)).toBe(100);
    expect(days.map(day => view.trend[view.labels.indexOf(day.label)])).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  }
});

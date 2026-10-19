export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// Calendar dates are represented as UTC midnight Date objects.
export function dateOnly(year: number, month1: number, day: number): Date {
  return new Date(Date.UTC(year, month1 - 1, day));
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function parseISODate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = dateOnly(Number(m[1]), Number(m[2]), Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function formatLongDate(d: Date): string {
  return `${WEEKDAY_NAMES[weekday(d)].slice(0, 3)} ${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(
    d.getUTCDate(),
  ).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(-2)}`;
}

export function weekday(date: Date): number {
  return date.getUTCDay();
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

export function daysBetweenInclusive(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function eachDate(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(new Date(d));
  return out;
}

export function compareDates(a: Date, b: Date): number {
  return a.getTime() - b.getTime();
}

// Default 15-day cutoff containing the given date.
export function cutoffRange(reference: Date = todayUtc()): { start: Date; end: Date } {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth() + 1;
  const day = reference.getUTCDate();
  if (day <= 15) {
    return { start: dateOnly(y, m, 1), end: dateOnly(y, m, 15) };
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: dateOnly(y, m, 16), end: dateOnly(y, m, lastDay) };
}

export function formatLong(value: Date): string {
  const d = value;
  return `${WEEKDAY_NAMES[d.getUTCDay()]}, ${d.toISOString().slice(0, 10)}`;
}

// Convert "HH:mm" to minutes since midnight.
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTime12(time: string): string {
  const [hStr, m] = time.split(":");
  let h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

// Expand a slot's [start,end) into one entry per scheduled hour.
export function hoursOfRange(start: string, end: string): string[] {
  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  const hours: string[] = [];
  for (let t = from; t < to; t += 60) hours.push(minutesToTime(t));
  if (hours.length === 0) hours.push(minutesToTime(from));
  return hours;
}

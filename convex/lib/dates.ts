export function formatDateKey(date: Date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfDayMs(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

export function endOfDayMs(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

export function startOfWeekMonday(date: Date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function nextDayDateKey(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  return formatDateKey(next);
}

export function sameClockTimeNextDay(startMs: number) {
  const d = new Date(startMs);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatTaskRollup(
  stats: { spentMinutes: number; blockCount: number },
  estimateMinutes?: number,
) {
  const spent = formatMinutes(stats.spentMinutes);
  const estimate = estimateMinutes ? formatMinutes(estimateMinutes) : null;
  const blocks = `${stats.blockCount} block${stats.blockCount === 1 ? '' : 's'}`;
  return estimate ? `${spent} / ${estimate} · ${blocks}` : `${spent} · ${blocks}`;
}

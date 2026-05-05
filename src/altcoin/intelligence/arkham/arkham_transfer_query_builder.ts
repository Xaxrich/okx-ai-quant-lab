export interface TransferQuery {
  chains: string;
  tokens: string;
  flow?: string;
  timeGte?: number;
  timeLte?: number;
  limit?: number;
  offset?: number;
  sortKey?: string;
  sortDir?: string;
  usdGte?: number;
  usdLte?: number;
  base?: string;
}

export function buildTransferQuery(q: TransferQuery): string {
  const params: string[] = [];
  params.push(`chains=${encodeURIComponent(q.chains)}`);
  params.push(`tokens=${encodeURIComponent(q.tokens)}`);
  params.push(`flow=${encodeURIComponent(q.flow || "all")}`);
  if (q.sortKey) params.push(`sortKey=${encodeURIComponent(q.sortKey)}`);
  if (q.sortDir) params.push(`sortDir=${encodeURIComponent(q.sortDir)}`);
  if (q.timeGte !== undefined) params.push(`timeGte=${q.timeGte}`);
  if (q.timeLte !== undefined) params.push(`timeLte=${q.timeLte}`);
  if (q.limit !== undefined) params.push(`limit=${q.limit}`);
  if (q.offset !== undefined) params.push(`offset=${q.offset}`);
  if (q.usdGte !== undefined) params.push(`usdGte=${q.usdGte}`);
  if (q.usdLte !== undefined) params.push(`usdLte=${q.usdLte}`);
  if (q.base) params.push(`base=${encodeURIComponent(q.base)}`);
  return `/transfers?${params.join("&")}`;
}

export function windowToUnixSeconds(startDate: string, endDate: string): { timeGte: number; timeLte: number } {
  return {
    timeGte: Math.floor(new Date(startDate).getTime() / 1000),
    timeLte: Math.floor(new Date(endDate).getTime() / 1000) + 86400,
  };
}

export function eventWindow(token: { breakoutDate: string; peakDate: string }, daysBefore: number, daysAfter: number): { timeGte: number; timeLte: number; label: string } {
  const breakout = new Date(token.breakoutDate);
  const start = new Date(breakout.getTime() - daysBefore * 86400000);
  const end = new Date(breakout.getTime() + daysAfter * 86400000);
  return {
    timeGte: Math.floor(start.getTime() / 1000),
    timeLte: Math.floor(end.getTime() / 1000),
    label: `T-${daysBefore}_to_T+${daysAfter}`,
  };
}

export interface MarketTimeSeriesRow {
  token: string;
  timestamp: string;
  price: number;
  marketCap: number;
  volume: number;
  circulatingSupply: number | null;
  totalSupply: number | null;
  impliedSupply: number | null;
  return1d: number;
  return3d: number;
  return7d: number;
  return14d: number;
  return30d: number;
  relativeReturnVsBtc7d: number;
  relativeReturnVsEth7d: number;
  volumeZscore7d: number;
  volumeZscore30d: number;
  realizedVolatility7d: number;
  realizedVolatility30d: number;
  distanceTo7dHigh: number;
  distanceTo30dHigh: number;
  source: "coingecko" | "coinmarketcap";
}

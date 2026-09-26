/** Shapes returned by the FundLab API. Money, units and NAVs arrive as strings to keep full precision. */

export type Role = 'TEACHER' | 'STUDENT';
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';

export interface Fund {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
  category: string;
  blurb: string;
  riskLevel: RiskLevel;
  nav: string | null;
  navDate: string | null;
  navStale: boolean;
}
export interface FundListItem extends Fund {
  return1y: string | null;
}
export interface FundDetail extends Fund {
  active: boolean;
  returns: Record<'1M' | '6M' | '1Y' | '3Y' | '5Y', string | null>;
}

export interface Holding {
  schemeCode: number;
  schemeName: string;
  category: string;
  units: string;
  costBasis: string;
  nav: string;
  navDate: string;
  value: string;
  gain: string;
  returnPct: string | null;
  share: string;
}

export interface Portfolio {
  startingCorpus: string;
  cash: string;
  invested: string;
  holdingsValue: string;
  totalValue: string;
  gain: string;
  returnPct: string;
  holdings: Holding[];
}

export interface Trade {
  id: string;
  type: 'BUY' | 'SELL';
  schemeCode: number;
  schemeName: string;
  units: string;
  navUsed: string;
  navDate: string;
  amount: string;
  reason: string | null;
  createdAt: string;
}

export interface Nudge {
  code: 'NOT_STARTED' | 'CONCENTRATED' | 'THIN_REASONING' | 'IDLE_CASH' | 'CHURNING';
  message: string;
}

export interface Me {
  student: { id: string; displayName: string; joinedAt: string };
  classroom: { name: string };
  portfolio: Portfolio;
  tradeCount: number;
}

export interface ClassroomSummary {
  id: string;
  name: string;
  joinCode: string;
  startingCorpus: string;
  studentCount: number;
  createdAt: string;
}

export interface LeaderboardRow {
  rank: number | null;
  studentId: string;
  displayName: string;
  joinedAt: string;
  started: boolean;
  totalValue: string;
  gain: string;
  returnPct: string;
  cashSharePct: string;
  fundsHeld: number;
  tradeCount: number;
  lastActivityAt: string | null;
  nudges: Nudge[];
}

export interface Dashboard {
  classroom: { id: string; name: string; joinCode: string; startingCorpus: string };
  stats: {
    students: number;
    investedStudents: number;
    averageReturnPct: string | null;
    medianReturnPct: string | null;
    needsNudge: number;
  };
  leaderboard: LeaderboardRow[];
}

export interface StudentDetail {
  student: { id: string; displayName: string; joinedAt: string };
  classroom: { id: string; name: string };
  portfolio: Portfolio;
  nudges: Nudge[];
  trades: Trade[];
}

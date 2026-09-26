/**
 * The curated fund universe. 16 real schemes, all Direct plan + Growth option.
 *
 * Why these rules:
 *  - Direct only: Regular plans are the same portfolio with a higher expense ratio.
 *    Showing both would teach nothing except how to pick the wrong one.
 *  - Growth only: IDCW (dividend) plans' NAV drops on each payout. We don't model
 *    payouts, so an IDCW holder would look like they lost money when they didn't.
 *  - Spread across categories so the decision a student makes is *allocation*.
 *
 * `expectName` is checked against the live provider in the seed, so a scheme
 * code that gets reassigned or wound up fails loudly instead of silently.
 */
import type { RiskLevel } from '../src/generated/prisma/client';

export interface CuratedFund {
  schemeCode: number;
  expectName: RegExp;
  schemeName: string;
  fundHouse: string;
  category: string;
  riskLevel: RiskLevel;
  blurb: string;
}

export const CURATED_FUNDS: CuratedFund[] = [
  {
    schemeCode: 120716,
    expectName: /UTI Nifty 50 Index Fund.*Direct.*Growth/i,
    schemeName: 'UTI Nifty 50 Index Fund',
    fundHouse: 'UTI Mutual Fund',
    category: 'Index',
    riskLevel: 'HIGH',
    blurb: "Owns India's 50 biggest listed companies in fixed proportions. No manager picking stocks, very low cost.",
  },
  {
    schemeCode: 143341,
    expectName: /UTI.*Nifty Next 50 Index Fund.*Direct.*Growth/i,
    schemeName: 'UTI Nifty Next 50 Index Fund',
    fundHouse: 'UTI Mutual Fund',
    category: 'Index',
    riskLevel: 'VERY_HIGH',
    blurb: 'Owns the 50 companies just below the top 50 — tomorrow’s possible giants. Bumpier than the Nifty 50.',
  },
  {
    schemeCode: 120586,
    expectName: /ICICI Prudential Large Cap Fund.*Direct.*Growth/i,
    schemeName: 'ICICI Prudential Large Cap Fund',
    fundHouse: 'ICICI Prudential Mutual Fund',
    category: 'Large cap',
    riskLevel: 'HIGH',
    blurb: 'A manager picks mostly from the 100 largest companies, trying to beat the index.',
  },
  {
    schemeCode: 118825,
    expectName: /Mirae Asset Large Cap Fund.*Direct.*Growth/i,
    schemeName: 'Mirae Asset Large Cap Fund',
    fundHouse: 'Mirae Asset Mutual Fund',
    category: 'Large cap',
    riskLevel: 'HIGH',
    blurb: 'Another actively managed fund of big, established companies. Compare it with the index funds.',
  },
  {
    schemeCode: 120465,
    expectName: /Axis Large Cap Fund.*Direct.*Growth/i,
    schemeName: 'Axis Large Cap Fund',
    fundHouse: 'Axis Mutual Fund',
    category: 'Large cap',
    riskLevel: 'HIGH',
    blurb: 'Large companies chosen with a focus on quality businesses. Same category, different manager style.',
  },
  {
    schemeCode: 122639,
    expectName: /Parag Parikh Flexi Cap Fund.*Direct.*Growth/i,
    schemeName: 'Parag Parikh Flexi Cap Fund',
    fundHouse: 'PPFAS Mutual Fund',
    category: 'Flexi cap',
    riskLevel: 'VERY_HIGH',
    blurb: 'Can buy companies of any size, including some outside India, and holds some cash.',
  },
  {
    schemeCode: 118955,
    expectName: /HDFC Flexi Cap Fund.*Direct.*Growth/i,
    schemeName: 'HDFC Flexi Cap Fund',
    fundHouse: 'HDFC Mutual Fund',
    category: 'Flexi cap',
    riskLevel: 'VERY_HIGH',
    blurb: 'Free to move between big, medium and small companies. Note the high NAV — that alone says nothing about value.',
  },
  {
    schemeCode: 118989,
    expectName: /HDFC Mid Cap Fund.*Direct.*Growth/i,
    schemeName: 'HDFC Mid Cap Fund',
    fundHouse: 'HDFC Mutual Fund',
    category: 'Mid cap',
    riskLevel: 'VERY_HIGH',
    blurb: 'Medium-sized companies: more room to grow than giants, but bigger ups and downs.',
  },
  {
    schemeCode: 147622,
    expectName: /Motilal Oswal Nifty Midcap 150 Index Fund.*Direct.*Growth/i,
    schemeName: 'Motilal Oswal Nifty Midcap 150 Index Fund',
    fundHouse: 'Motilal Oswal Mutual Fund',
    category: 'Mid cap',
    riskLevel: 'VERY_HIGH',
    blurb: 'Tracks 150 mid-sized companies automatically. An index version of the mid cap idea.',
  },
  {
    schemeCode: 118778,
    expectName: /Nippon India Small Cap Fund.*Direct.*Growth/i,
    schemeName: 'Nippon India Small Cap Fund',
    fundHouse: 'Nippon India Mutual Fund',
    category: 'Small cap',
    riskLevel: 'VERY_HIGH',
    blurb: 'Small companies. Can grow fast and can fall hard — the riskiest equity category here.',
  },
  {
    schemeCode: 125497,
    expectName: /SBI Small Cap Fund.*Direct.*Growth/i,
    schemeName: 'SBI Small Cap Fund',
    fundHouse: 'SBI Mutual Fund',
    category: 'Small cap',
    riskLevel: 'VERY_HIGH',
    blurb: 'Another small cap fund. Two in the same category lets you see how managers differ.',
  },
  {
    schemeCode: 118968,
    expectName: /HDFC Balanced Advantage Fund.*Direct.*Growth/i,
    schemeName: 'HDFC Balanced Advantage Fund',
    fundHouse: 'HDFC Mutual Fund',
    category: 'Hybrid',
    riskLevel: 'HIGH',
    blurb: 'Mixes shares and bonds, shifting between them as markets move. Aims for a smoother ride.',
  },
  {
    schemeCode: 118987,
    expectName: /HDFC Corporate Bond Fund.*Direct.*Growth/i,
    schemeName: 'HDFC Corporate Bond Fund',
    fundHouse: 'HDFC Mutual Fund',
    category: 'Debt',
    riskLevel: 'MODERATE',
    blurb: 'Lends money to large companies and earns interest. Grows slowly and steadily.',
  },
  {
    schemeCode: 119533,
    expectName: /Aditya Birla Sun Life Corporate Bond Fund.*Direct.*Growth/i,
    schemeName: 'Aditya Birla Sun Life Corporate Bond Fund',
    fundHouse: 'Aditya Birla Sun Life Mutual Fund',
    category: 'Debt',
    riskLevel: 'MODERATE',
    blurb: 'A second corporate bond fund, for comparing two funds that should behave almost the same.',
  },
  {
    schemeCode: 119091,
    expectName: /HDFC Liquid Fund.*Direct.*Growth/i,
    schemeName: 'HDFC Liquid Fund',
    fundHouse: 'HDFC Mutual Fund',
    category: 'Liquid',
    riskLevel: 'LOW',
    blurb: 'Very short-term loans. Barely moves — closer to a savings account than to shares.',
  },
  {
    schemeCode: 119788,
    expectName: /SBI Gold Fund.*Direct.*Growth/i,
    schemeName: 'SBI Gold Fund',
    fundHouse: 'SBI Mutual Fund',
    category: 'Gold',
    riskLevel: 'HIGH',
    blurb: 'Follows the price of gold. Often moves differently from shares, which is the point of holding it.',
  },
];

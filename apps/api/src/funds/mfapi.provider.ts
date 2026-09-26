import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { Dec } from '../finance/money';
import { FundDataProvider, FundDataUnavailableError, ProviderNav, ProviderNavPoint } from './fund-data.provider';

const BASE_URL = 'https://api.mfapi.in/mf';
const TIMEOUT_MS = 8000;

const NavRow = z.object({
  date: z.string().regex(/^\d{2}-\d{2}-\d{4}$/),
  nav: z.string().regex(/^\d+(\.\d+)?$/),
});
const MfapiResponse = z.object({
  status: z.literal('SUCCESS'),
  meta: z.object({ scheme_code: z.number(), scheme_name: z.string() }),
  data: z.array(NavRow),
});

/** MFAPI uses DD-MM-YYYY. */
function toIsoDate(ddmmyyyy: string): string {
  const [dd, mm, yyyy] = ddmmyyyy.split('-');
  const iso = `${yyyy}-${mm}-${dd}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso) throw new Error(`Invalid date ${ddmmyyyy}`);
  return iso;
}

function toPoint(row: z.infer<typeof NavRow>): ProviderNavPoint {
  const nav = new Dec(row.nav);
  if (nav.lte(0)) throw new Error(`Non-positive NAV ${row.nav}`);
  return { date: toIsoDate(row.date), nav };
}

/**
 * MFAPI (mfapi.in) adapter. MFAPI republishes AMFI's daily NAV file.
 *
 * Gotcha found while building: for a scheme code that doesn't exist MFAPI
 * answers HTTP 200, status "SUCCESS", scheme_code 0 and an empty data array.
 * So we check the scheme code and that data is non-empty, not just the status.
 */
@Injectable()
export class MfapiProvider implements FundDataProvider {
  private readonly logger = new Logger(MfapiProvider.name);

  private async fetchScheme(schemeCode: number, path: string): Promise<z.infer<typeof MfapiResponse>> {
    let body: unknown;
    try {
      const res = await fetch(`${BASE_URL}/${schemeCode}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = await res.json();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`MFAPI request failed for ${schemeCode}${path}: ${reason}`);
      throw new FundDataUnavailableError(schemeCode, reason);
    }
    const parsed = MfapiResponse.safeParse(body);
    if (!parsed.success) throw new FundDataUnavailableError(schemeCode, 'unexpected response shape');
    if (parsed.data.meta.scheme_code !== schemeCode) throw new FundDataUnavailableError(schemeCode, 'unknown scheme');
    if (parsed.data.data.length === 0) throw new FundDataUnavailableError(schemeCode, 'no NAV data');
    return parsed.data;
  }

  async getLatestNav(schemeCode: number): Promise<ProviderNav> {
    const body = await this.fetchScheme(schemeCode, '/latest');
    try {
      const point = toPoint(body.data[0]);
      return { schemeCode, schemeName: body.meta.scheme_name, navDate: point.date, nav: point.nav };
    } catch (err) {
      throw new FundDataUnavailableError(schemeCode, (err as Error).message);
    }
  }

  async getHistory(schemeCode: number): Promise<ProviderNavPoint[]> {
    const body = await this.fetchScheme(schemeCode, '');
    const points: ProviderNavPoint[] = [];
    for (const row of body.data) {
      try {
        points.push(toPoint(row));
      } catch {
        // Skip individual bad rows in a long history rather than losing the whole chart.
      }
    }
    // MFAPI returns newest first; the app works oldest first.
    return points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
}

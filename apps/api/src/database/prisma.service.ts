import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { APP_CONFIG, AppConfig } from '../config';

// Neon's driver talks to Postgres over WebSockets, which supports interactive
// transactions and works in environments where port 5432 is blocked.
neonConfig.webSocketConstructor = ws;

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  readonly schema: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ adapter: new PrismaNeon({ connectionString: config.DATABASE_URL }, { schema: config.DB_SCHEMA }) });
    this.schema = config.DB_SCHEMA;
  }

  /**
   * Serialises all money-moving work for one student.
   * Cash is derived from the ledger, so without this two concurrent BUYs could
   * both read ₹1,00,000 of cash and overspend. The row lock is held until the
   * surrounding transaction commits.
   */
  async lockStudent(tx: Tx, studentId: string): Promise<boolean> {
    // Raw SQL is not schema-qualified by the adapter, so qualify it here.
    // `schema` is validated against /^[a-z_][a-z0-9_]*$/ in config.ts.
    const table = Prisma.raw(`"${this.schema}"."Student"`);
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ${table} WHERE id = ${studentId}::uuid FOR UPDATE`;
    return rows.length === 1;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

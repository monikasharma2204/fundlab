import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 reads connection details from here, not from schema.prisma.
// The app itself connects through the Neon adapter (see src/database/prisma.service.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});

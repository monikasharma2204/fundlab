import 'reflect-metadata';
import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModuleOptions, createAppModule } from './app.module';
import { loadConfig } from './config';

export async function createApp(options: AppModuleOptions): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(createAppModule(options), {
    logger: process.env.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
    bodyParser: false,
  });
  // Every legitimate request body is tiny; cap it well below Express's 100kb default.
  app.useBodyParser('json', { limit: '16kb' });
  // Behind a hosting proxy, use the client's IP (for the auth rate limit), not the proxy's.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: options.config.CORS_ORIGIN.split(',').map((o) => o.trim()) });
  app.enableShutdownHooks();
  return app;
}

async function main() {
  const config = loadConfig();
  const app = await createApp({ config });
  await app.listen(config.PORT);
  console.log(`FundLab API listening on http://localhost:${config.PORT}/api`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

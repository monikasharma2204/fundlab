import { Controller, Get, Module, Provider } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthGuard, Public } from './auth/auth.guard';
import { AuthService, PinAttemptLimiter } from './auth/auth.service';
import { ClassroomsController } from './classrooms/classrooms.controller';
import { ClassroomsService } from './classrooms/classrooms.service';
import { ErrorFilter } from './common/errors';
import { APP_CONFIG, AppConfig } from './config';
import { PrismaService } from './database/prisma.service';
import { FUND_DATA_PROVIDER, FundDataProvider } from './funds/fund-data.provider';
import { FundsController } from './funds/funds.controller';
import { MfapiProvider } from './funds/mfapi.provider';
import { NavService } from './funds/nav.service';
import { PortfolioService } from './portfolio/portfolio.service';
import { StudentController } from './trading/student.controller';
import { TradingService } from './trading/trading.service';

@Public()
@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

export interface AppModuleOptions {
  config: AppConfig;
  /** Tests swap in a fake provider to control NAVs and simulate outages. */
  fundDataProvider?: FundDataProvider;
}

/**
 * One module. The app is small enough that splitting into Nest feature modules
 * would add wiring without adding clarity; folders give the separation instead.
 */
export function createAppModule({ config, fundDataProvider }: AppModuleOptions) {
  const providers: Provider[] = [
    { provide: APP_CONFIG, useValue: config },
    { provide: FUND_DATA_PROVIDER, useValue: fundDataProvider ?? new MfapiProvider() },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
    PrismaService,
    AuthService,
    PinAttemptLimiter,
    NavService,
    PortfolioService,
    TradingService,
    ClassroomsService,
  ];

  @Module({
    imports: [
      ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.AUTH_RATE_LIMIT }]),
      JwtModule.register({ secret: config.JWT_SECRET, signOptions: { algorithm: 'HS256' }, verifyOptions: { algorithms: ['HS256'] } }),
    ],
    controllers: [HealthController, AuthController, FundsController, StudentController, ClassroomsController],
    providers,
  })
  class AppModule {}

  return AppModule;
}

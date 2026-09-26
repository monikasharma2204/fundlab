import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  PipeTransform,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError, ZodType } from 'zod';
import { FinanceRuleError } from '../finance/portfolio';

/** An error that is safe to show to the user, with a stable machine-readable code. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found.`);

/** Prisma's unique-constraint violation (P2002). Checked structurally to avoid coupling to Prisma's error classes. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

/** Errors thrown by Express's body parser (bad JSON, body too large) carry a 4xx status and expose=true. */
function clientHttpStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true ? status : null;
}

/** Validates a request body/query against a zod schema. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}

/**
 * One place that turns errors into responses. Anything we didn't anticipate
 * becomes a generic 500 — internal messages and stack traces are only logged.
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(err: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const send = (status: number, code: string, message: string, details?: unknown) =>
      res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });

    if (err instanceof AppError) return void send(err.status, err.code, err.message);
    if (err instanceof FinanceRuleError) {
      if (err.code === 'LEDGER_INCONSISTENT') {
        this.logger.error(`Ledger inconsistency: ${err.message}`);
        return void send(500, 'LEDGER_INCONSISTENT', 'Portfolio data is inconsistent. Please tell your teacher.');
      }
      return void send(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message);
    }
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      return void send(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', details[0]?.message ?? 'Invalid request.', details);
    }
    if (isUniqueViolation(err)) return void send(HttpStatus.CONFLICT, 'CONFLICT', 'That already exists.');
    const clientStatus = clientHttpStatus(err);
    if (clientStatus === 413) return void send(413, 'PAYLOAD_TOO_LARGE', 'That request is too large.');
    if (clientStatus) return void send(clientStatus, 'BAD_REQUEST', 'The request could not be read. Check that it is valid JSON.');
    if (err instanceof HttpException) {
      const status = err.getStatus();
      return void send(status, status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR', err.message);
    }
    this.logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    send(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL', 'Something went wrong on our side. Nothing was changed.');
  }
}

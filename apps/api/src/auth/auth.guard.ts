import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AppError } from '../common/errors';
import { PrismaService } from '../database/prisma.service';

export type Role = 'TEACHER' | 'STUDENT';

/** Everything the server trusts about the caller comes from the verified token, never the request body. */
export interface AuthUser {
  sub: string; // teacher id or student id
  role: Role;
}

/** What's inside the JWT. `tv` is the student's token version (see Student.tokenVersion). */
export interface TokenPayload extends AuthUser {
  tv?: number;
}

const ROLES_KEY = 'roles';
const PUBLIC_KEY = 'public';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user;
});

const unauthenticated = (message = 'Your session has expired. Please log in again.') =>
  new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', message);

/**
 * Global guard: every route needs a valid token unless marked @Public(), and must match @Roles().
 * It also checks the account still exists and, for students, that the token hasn't been
 * revoked by a PIN reset — one indexed lookup per request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthenticated('Please log in.');

    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      throw unauthenticated();
    }

    if (payload.role === 'STUDENT') {
      const student = await this.prisma.student.findUnique({ where: { id: payload.sub }, select: { tokenVersion: true } });
      if (!student || student.tokenVersion !== (payload.tv ?? 0)) throw unauthenticated();
    } else if (payload.role === 'TEACHER') {
      const teacher = await this.prisma.teacher.findUnique({ where: { id: payload.sub }, select: { id: true } });
      if (!teacher) throw unauthenticated();
    } else {
      throw unauthenticated('Invalid session.');
    }
    req.user = { sub: payload.sub, role: payload.role };

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(payload.role)) {
      throw new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You do not have access to this.');
    }
    return true;
  }
}

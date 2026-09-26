import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { AppError, isUniqueViolation } from '../common/errors';
import { PrismaService } from '../database/prisma.service';
import { AttemptLimiter } from './attempt-limiter';
import { TokenPayload } from './auth.guard';

const BCRYPT_ROUNDS = 10;
// Compared against when an account doesn't exist, so a missing account takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('fundlab-timing-equaliser', BCRYPT_ROUNDS);

export const TeacherSignupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});
export const TeacherLoginSchema = z.object({
  email: z.string().trim().toLowerCase().max(320),
  password: z.string().min(1).max(200),
});

const joinCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, 'Class codes are 6 letters/numbers');
const displayName = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(30, 'Name must be 30 characters or fewer')
      .regex(/^[\p{L}\p{N} .'-]+$/u, 'Use letters, numbers and spaces only'),
  );

export const StudentJoinSchema = z.object({ joinCode, displayName });
export const StudentLoginSchema = z.object({
  joinCode,
  displayName,
  pin: z.string().regex(/^\d{6}$/, 'Your PIN is 6 digits'),
});

/** "  Ravi   Kumar " and "ravi kumar" are the same student. */
export function nameKeyOf(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function generatePin(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** One limiter shared by login and the teacher's reset-PIN, so a reset also lifts a lockout. */
@Injectable()
export class PinAttemptLimiter extends AttemptLimiter {
  constructor() {
    super(5, 15 * 60_000);
  }
  static key(joinCode: string, nameKey: string) {
    return `${joinCode}:${nameKey}`;
  }
}

@Injectable()
export class AuthService {
  private readonly teacherLimiter = new AttemptLimiter(10, 15 * 60_000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly pinLimiter: PinAttemptLimiter,
  ) {}

  private sign(payload: TokenPayload, expiresIn: '7d' | '30d') {
    return this.jwt.signAsync(payload, { expiresIn });
  }

  async teacherSignup(input: z.infer<typeof TeacherSignupSchema>) {
    try {
      const teacher = await this.prisma.teacher.create({
        data: { name: input.name, email: input.email, passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS) },
      });
      return {
        token: await this.sign({ sub: teacher.id, role: 'TEACHER' }, '7d'),
        teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
      };
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'An account with this email already exists.');
      throw err;
    }
  }

  async teacherLogin(input: z.infer<typeof TeacherLoginSchema>) {
    if (!this.teacherLimiter.reserve(input.email)) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_ATTEMPTS', 'Too many failed logins. Try again in 15 minutes.');
    }
    const teacher = await this.prisma.teacher.findUnique({ where: { email: input.email } });
    const ok = await bcrypt.compare(input.password, teacher?.passwordHash ?? DUMMY_HASH);
    // Same message whether the email or the password is wrong.
    if (!teacher || !ok) throw new AppError(HttpStatus.UNAUTHORIZED, 'BAD_CREDENTIALS', 'Email or password is incorrect.');
    this.teacherLimiter.succeed(input.email);
    return {
      token: await this.sign({ sub: teacher.id, role: 'TEACHER' }, '7d'),
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
    };
  }

  /** Joining needs no email or password. The student gets a PIN to log back in from another device. */
  async studentJoin(input: z.infer<typeof StudentJoinSchema>) {
    const classroom = await this.prisma.classroom.findUnique({ where: { joinCode: input.joinCode } });
    if (!classroom) throw new AppError(HttpStatus.NOT_FOUND, 'CLASS_NOT_FOUND', 'No class uses that code. Check with your teacher.');

    const pin = generatePin();
    try {
      // No "does this name exist?" pre-check: the unique index decides, so two
      // students racing for the same name get one 201 and one 409, never a 500.
      const student = await this.prisma.student.create({
        data: {
          classroomId: classroom.id,
          displayName: input.displayName,
          nameKey: nameKeyOf(input.displayName),
          pinHash: await bcrypt.hash(pin, BCRYPT_ROUNDS),
        },
      });
      return {
        token: await this.sign({ sub: student.id, role: 'STUDENT', tv: student.tokenVersion }, '30d'),
        pin,
        student: { id: student.id, displayName: student.displayName, classroomName: classroom.name },
      };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AppError(
          HttpStatus.CONFLICT,
          'NAME_TAKEN',
          'Someone in this class already uses that name. Pick another, or log in with your PIN.',
        );
      }
      throw err;
    }
  }

  async studentLogin(input: z.infer<typeof StudentLoginSchema>) {
    const nameKey = nameKeyOf(input.displayName);
    const key = PinAttemptLimiter.key(input.joinCode, nameKey);
    if (!this.pinLimiter.reserve(key)) {
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_ATTEMPTS', 'Too many wrong PINs. Try again in 15 minutes or ask your teacher.');
    }
    const classroom = await this.prisma.classroom.findUnique({ where: { joinCode: input.joinCode } });
    const student = classroom
      ? await this.prisma.student.findUnique({ where: { classroomId_nameKey: { classroomId: classroom.id, nameKey } } })
      : null;
    const ok = await bcrypt.compare(input.pin, student?.pinHash ?? DUMMY_HASH);
    if (!student || !ok) throw new AppError(HttpStatus.UNAUTHORIZED, 'BAD_CREDENTIALS', 'Class code, name or PIN is incorrect.');
    this.pinLimiter.succeed(key);
    return {
      token: await this.sign({ sub: student.id, role: 'STUDENT', tv: student.tokenVersion }, '30d'),
      student: { id: student.id, displayName: student.displayName, classroomName: classroom!.name },
    };
  }
}

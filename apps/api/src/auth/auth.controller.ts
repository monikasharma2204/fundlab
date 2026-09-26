import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ZodPipe } from '../common/errors';
import { Public } from './auth.guard';
import {
  AuthService,
  StudentJoinSchema,
  StudentLoginSchema,
  TeacherLoginSchema,
  TeacherSignupSchema,
} from './auth.service';
import type { z } from 'zod';

/** Rate-limited per IP (AUTH_RATE_LIMIT/min) on top of the per-account attempt limits. */
@Public()
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('teacher/signup')
  signup(@Body(new ZodPipe(TeacherSignupSchema)) body: z.infer<typeof TeacherSignupSchema>) {
    return this.auth.teacherSignup(body);
  }

  @Post('teacher/login')
  @HttpCode(200)
  login(@Body(new ZodPipe(TeacherLoginSchema)) body: z.infer<typeof TeacherLoginSchema>) {
    return this.auth.teacherLogin(body);
  }

  @Post('student/join')
  join(@Body(new ZodPipe(StudentJoinSchema)) body: z.infer<typeof StudentJoinSchema>) {
    return this.auth.studentJoin(body);
  }

  @Post('student/login')
  @HttpCode(200)
  studentLogin(@Body(new ZodPipe(StudentLoginSchema)) body: z.infer<typeof StudentLoginSchema>) {
    return this.auth.studentLogin(body);
  }
}

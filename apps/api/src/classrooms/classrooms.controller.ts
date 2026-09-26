import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { z } from 'zod';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.guard';
import { ZodPipe } from '../common/errors';
import { ClassroomsService, CreateClassroomSchema } from './classrooms.service';

/** Teacher-only. Every route re-checks that the classroom belongs to the caller. */
@Roles('TEACHER')
@Controller('classrooms')
export class ClassroomsController {
  constructor(private readonly classrooms: ClassroomsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateClassroomSchema)) body: z.infer<typeof CreateClassroomSchema>) {
    return this.classrooms.create(user.sub, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.classrooms.list(user.sub);
  }

  @Get(':id')
  dashboard(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.classrooms.dashboard(user.sub, id);
  }

  @Get(':id/students/:studentId')
  student(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.classrooms.studentDetail(user.sub, id, studentId);
  }

  @Post(':id/students/:studentId/reset-pin')
  @HttpCode(200)
  resetPin(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.classrooms.resetPin(user.sub, id, studentId);
  }
}

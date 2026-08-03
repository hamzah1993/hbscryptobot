import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() request: Request & { user: { sub: string } }) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    });
  }
}

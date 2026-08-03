import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email is already registered');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { email, fullName: dto.fullName.trim(), passwordHash },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    });

    return { user, accessToken: await this.signToken(user.id, user.email, user.role) };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
      accessToken: await this.signToken(user.id, user.email, user.role),
    };
  }

  private signToken(sub: string, email: string, role: string) {
    return this.jwt.signAsync({ sub, email, role });
  }
}

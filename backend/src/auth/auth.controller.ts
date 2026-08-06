import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { getAuthRateLimitConfiguration } from './auth-rate-limit.config';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

const authRateLimit = getAuthRateLimitConfiguration();

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({
    default: {
      limit: authRateLimit.registerMaxRequests,
      ttl: authRateLimit.ttlMilliseconds,
    },
  })
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.authService.register(dto, this.loginMetadata(request));
  }

  @Post('login')
  @Throttle({
    default: {
      limit: authRateLimit.loginMaxRequests,
      ttl: authRateLimit.ttlMilliseconds,
    },
  })
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, this.loginMetadata(request));
  }


  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: authRateLimit.ttlMilliseconds } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: authRateLimit.ttlMilliseconds } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: authRateLimit.ttlMilliseconds } })
  changePassword(
    @Req() request: Request & { user: { sub: string } },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(request.user.sub, dto);
  }

  private loginMetadata(request: Request) {
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0]?.trim();
    return {
      userAgent: request.headers['user-agent'],
      ipAddress: forwardedIp || request.ip,
    };
  }
}

import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { getAuthRateLimitConfiguration } from './auth-rate-limit.config';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

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
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({
    default: {
      limit: authRateLimit.loginMaxRequests,
      ttl: authRateLimit.ttlMilliseconds,
    },
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}

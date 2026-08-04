import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const authThrottleTtlMilliseconds = parsePositiveInteger(
  process.env.AUTH_RATE_LIMIT_TTL_MS,
  60_000,
);
const registerThrottleLimit = parsePositiveInteger(
  process.env.AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS,
  5,
);
const loginThrottleLimit = parsePositiveInteger(
  process.env.AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS,
  10,
);

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({
    default: { limit: registerThrottleLimit, ttl: authThrottleTtlMilliseconds },
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: loginThrottleLimit, ttl: authThrottleTtlMilliseconds } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}

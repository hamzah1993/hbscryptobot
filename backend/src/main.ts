import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

/** Number of reverse proxies in front of the app (Render, Cloudflare, ...); rate limits key on the client IP they forward. */
export function trustProxyHops(value = process.env.TRUST_PROXY_HOPS) {
  const hops = Number.parseInt(value ?? '', 10);
  return Number.isFinite(hops) && hops >= 0 ? hops : 1;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', trustProxyHops());
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

import { Body, Controller, Headers, Post } from '@nestjs/common';
import { TelegramConnectionService, type TelegramUpdate } from './telegram-connection.service';

@Controller('notifications/telegram')
export class TelegramWebhookController {
  constructor(private readonly telegramConnection: TelegramConnectionService) {}

  @Post('webhook')
  webhook(
    @Body() update: unknown,
    @Headers('x-telegram-bot-api-secret-token') webhookSecret?: string,
  ) {
    return this.telegramConnection.processWebhook((update ?? {}) as TelegramUpdate, webhookSecret);
  }
}

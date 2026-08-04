import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaperTradingService } from './paper-trading.service';

interface AuthenticatedRequest extends Request {
  user: { sub: string };
}

@Controller('paper-trading')
@UseGuards(JwtAuthGuard)
export class PaperTradingController {
  constructor(private readonly paper: PaperTradingService) {}

  @Get('positions')
  listPositions(@Req() request: AuthenticatedRequest) {
    return this.paper.listPositions(request.user.sub);
  }

  @Post('positions/open')
  openPosition(
    @Req() request: AuthenticatedRequest,
    @Body() body: { strategyId: string; marketPrice: number },
  ) {
    return this.paper.openPosition(request.user.sub, body);
  }

  @Post('positions/:positionId/dca')
  addDca(
    @Req() request: AuthenticatedRequest,
    @Param('positionId') positionId: string,
    @Body() body: { marketPrice: number },
  ) {
    return this.paper.addDca(request.user.sub, { positionId, marketPrice: body.marketPrice });
  }

  @Post('positions/:positionId/close')
  closePosition(
    @Req() request: AuthenticatedRequest,
    @Param('positionId') positionId: string,
    @Body() body: { marketPrice: number },
  ) {
    return this.paper.closePosition(request.user.sub, positionId, body.marketPrice);
  }
}

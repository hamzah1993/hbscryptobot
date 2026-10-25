import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../admin/admin.guard';
import { AdminSessionGuard } from '../admin/admin-session.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContentService } from './content.service';
import { AnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

type AuthenticatedRequest = Request & { user: { sub: string } };

@Controller('content')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('announcements')
  announcements() {
    return this.content.listPublished();
  }

  @Get('recent-profits')
  recentProfits() {
    return this.content.recentProfits();
  }
}

@Controller('super/admin/control/announcements')
@UseGuards(JwtAuthGuard, AdminGuard, AdminSessionGuard)
export class AdminContentController {
  constructor(private readonly content: ContentService) {}

  @Get()
  list() {
    return this.content.adminList();
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: AnnouncementDto) {
    return this.content.adminCreate(request.user.sub, body);
  }

  @Patch(':id')
  update(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: UpdateAnnouncementDto) {
    return this.content.adminUpdate(request.user.sub, id, body);
  }

  @Delete(':id')
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.content.adminDelete(request.user.sub, id);
  }
}

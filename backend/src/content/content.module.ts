import { Module } from '@nestjs/common';
import { AdminContentController, ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  controllers: [ContentController, AdminContentController],
  providers: [ContentService],
})
export class ContentModule {}

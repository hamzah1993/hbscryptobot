import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class AnnouncementDto {
  @IsString()
  @Length(3, 120)
  title!: string;

  @IsString()
  @Length(1, 5000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @Length(3, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  body?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

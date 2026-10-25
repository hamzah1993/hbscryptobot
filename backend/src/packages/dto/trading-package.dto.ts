import { IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsPositive, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateTradingPackageDto {
  @IsString()
  @Length(2, 60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsNumber()
  @IsPositive()
  amountQuote!: number;

  @IsString()
  @Matches(/^[A-Za-z0-9]{5,20}$/, { message: 'symbol must be a Binance pair such as BTCUSDT' })
  symbol!: string;

  @IsObject()
  strategyTemplate!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateTradingPackageDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amountQuote?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{5,20}$/, { message: 'symbol must be a Binance pair such as BTCUSDT' })
  symbol?: string;

  @IsOptional()
  @IsObject()
  strategyTemplate?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

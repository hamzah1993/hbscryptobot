import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsPositive, IsString, IsUUID,
  Length, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const SYMBOL_PATTERN = /^[A-Za-z0-9/_-]{5,20}$/;
const SYMBOL_MESSAGE = { message: 'symbol must be a Binance pair such as BTCUSDT' };

export class StrategyBacktestDto {
  @IsString()
  @Matches(SYMBOL_PATTERN, SYMBOL_MESSAGE)
  symbol!: string;

  @IsObject()
  strategyTemplate!: Record<string, unknown>;

  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;

  @IsNumber()
  @Min(10)
  capitalQuote!: number;
}

export class CreatePackageStrategyTemplateDto {
  @IsString()
  @Length(2, 60)
  name!: string;

  @IsString()
  @Matches(SYMBOL_PATTERN, SYMBOL_MESSAGE)
  symbol!: string;

  @IsObject()
  strategyTemplate!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdatePackageStrategyTemplateDto {
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(SYMBOL_PATTERN, SYMBOL_MESSAGE)
  symbol?: string;

  @IsOptional()
  @IsObject()
  strategyTemplate?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PackageStrategyAllocationDto {
  @IsUUID()
  templateId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  allocationPercent!: number;
}

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

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PackageStrategyAllocationDto)
  strategies!: PackageStrategyAllocationDto[];

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
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PackageStrategyAllocationDto)
  strategies?: PackageStrategyAllocationDto[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

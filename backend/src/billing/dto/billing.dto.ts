import { ArrayMaxSize, IsArray, IsEmail, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateBillingSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  membershipFeeQuote?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3660)
  membershipDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  profitFeePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minBalanceQuote?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  referralPercents?: number[];
}

export class BalanceAdjustmentDto {
  @IsEmail()
  email!: string;

  @IsNumber()
  amountQuote!: number;

  @IsString()
  @Length(3, 200)
  reason!: string;
}

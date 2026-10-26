import { IsString, Matches, MinLength } from 'class-validator';

export class TwoFactorCodeDto {
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'Authentication code must be 6 digits' })
  code!: string;
}

export class DisableTwoFactorDto extends TwoFactorCodeDto {
  @IsString()
  @MinLength(8)
  password!: string;
}

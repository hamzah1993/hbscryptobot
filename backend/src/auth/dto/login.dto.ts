import { IsEmail, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsUUID()
  deviceId?: string;

  /** Authenticator-app code; required when the account has two-factor authentication on. */
  @IsOptional()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/, { message: 'Authentication code must be 6 digits' })
  totpCode?: string;
}

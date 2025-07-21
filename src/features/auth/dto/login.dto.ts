import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { IsNotEmpty, IsString, IsStrongPassword, MinLength } from "class-validator";

// Data Transfer Object (DTO) for login requests.
// Class-validator decorators ensure incoming data meets specified criteria.
@ApiSchema({ name: 'Credentials' })
export class LoginDto {
  @IsString({ message: 'Username must be a string.' })
  @IsNotEmpty({ message: 'Username cannot be empty.' })
  @ApiProperty()
  username: string;

  @IsString({ message: 'Password must be a string.' })
  @IsNotEmpty({ message: 'Password cannot be empty.' })
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @IsStrongPassword()
  @ApiProperty()
  password: string;
}
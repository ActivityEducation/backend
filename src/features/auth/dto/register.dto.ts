import { ApiProperty, ApiSchema } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MinLength } from "class-validator";

// Data Transfer Object (DTO) for user registration requests.
@ApiSchema({ name: 'Registration' })
export class RegisterDto {
  @IsString({ message: 'Username must be a string.' })
  @IsNotEmpty({ message: 'Username cannot be empty.' })
  @MinLength(3, { message: 'Username must be at least 3 characters long.' })
  @ApiProperty()
  username: string;

  @IsString({ message: 'Name must be a string.' })
  @IsNotEmpty({ message: 'Name cannot be empty.' })
  @MinLength(3, { message: 'Name must be at least 3 characters long.' })
  @ApiProperty()
  name: string;

  @IsString({ message: 'Summary must be a string.' })
  @IsNotEmpty({ message: 'Summary cannot be empty.' })
  @ApiProperty()
  summary: string;

  @IsString({ message: 'Password must be a string.' })
  @IsNotEmpty({ message: 'Password cannot be empty.' })
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @ApiProperty()
  password: string;
}
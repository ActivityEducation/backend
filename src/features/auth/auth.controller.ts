import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service'; // Authentication service
import { IsString, IsNotEmpty, MinLength } from 'class-validator'; // For DTO validation decorators
import { ApiProperty } from '@nestjs/swagger';
import { CustomLogger } from '../../core/custom-logger.service';

// Data Transfer Object (DTO) for login requests.
// Class-validator decorators ensure incoming data meets specified criteria.
class LoginDto {
  @IsString({ message: 'Username must be a string.' })
  @IsNotEmpty({ message: 'Username cannot be empty.' })
  @ApiProperty()
  username: string;

  @IsString({ message: 'Password must be a string.' })
  @IsNotEmpty({ message: 'Password cannot be empty.' })
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @ApiProperty()
  password: string;
}

// Data Transfer Object (DTO) for user registration requests.
class RegisterDto {
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

@Controller('auth') // Base route for authentication related endpoints
export class AuthController {
  constructor(
    private readonly authService: AuthService, // Inject AuthService
    private readonly logger: CustomLogger, // Inject custom logger
  ) {
    this.logger.setContext('AuthController'); // Set context for the logger
  }

  @Post('login') // Handles POST requests to /auth/login
  @HttpCode(HttpStatus.OK) // Explicitly set HTTP status to 200 OK on success
  async login(@Body() loginDto: LoginDto) {
    this.logger.log(`AuthController: Received login request for user: '${loginDto.username}'.`);
    // Call AuthService to validate credentials and get a JWT
    return this.authService.login(loginDto.username, loginDto.password);
  }

  @Post('register') // Handles POST requests to /auth/register
  @HttpCode(HttpStatus.CREATED) // Explicitly set HTTP status to 201 Created on success
  async register(@Body() registerDto: RegisterDto) {
    this.logger.log(`AuthController: Received registration request for user: '${registerDto.username}'.`);
    // Call AuthService to register the new user and create their ActivityPub actor
    const newActorPublicData = await this.authService.register(registerDto.username, registerDto.name, registerDto.summary, registerDto.password);
    
    // Return a success message and public details of the newly created actor.
    // Avoid returning sensitive information like private keys or password hashes.
    return {
      success: true,
      message: `User '${newActorPublicData.preferredUsername}' registered successfully.`,
      actorId: newActorPublicData.activityPubId, // ActivityPub ID of the new actor
      actorProfile: newActorPublicData.data, // Full ActivityPub profile data
    };
  }
}
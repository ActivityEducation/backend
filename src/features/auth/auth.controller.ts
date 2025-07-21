import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service'; // Authentication service
import { IsString, IsNotEmpty, MinLength } from 'class-validator'; // For DTO validation decorators
import { ApiProperty } from '@nestjs/swagger';
import { LoggerService } from 'src/shared/services/logger.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';



@Controller('auth') // Base route for authentication related endpoints
export class AuthController {
  constructor(
    private readonly authService: AuthService, // Inject AuthService
    private readonly logger: LoggerService, // Inject custom logger
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
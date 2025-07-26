// src/features/auth/auth.controller.ts

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ApiBody, ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LoggerService } from 'src/shared/services/logger.service';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { UserEntity } from './entities/user.entity'; // Import UserEntity
import { User as UserDecorator } from 'src/shared/decorators/user.decorator'; // Import custom User decorator

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly logger: LoggerService, // Inject LoggerService
  ) {
    this.logger.setContext('AuthController');
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully. Actor created.',
    type: UserEntity,
  })
  @ApiResponse({ status: 400, description: 'Bad Request (validation errors).' })
  @ApiResponse({ status: 409, description: 'Conflict (username already exists).' })
  async register(@Body() registerDto: RegisterDto): Promise<UserEntity> {
    this.logger.log(`Received registration request for username: ${registerDto.username}`);
    const { user } = await this.authService.register(registerDto);
    return user;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in a user and get JWT' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'User logged in successfully.',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async login(@Body() loginDto: LoginDto, @Request() req: any) {
    this.logger.log(`Login attempt for username: ${loginDto.username}`);
    // Passport local strategy would have authenticated the user and attached to req.user
    return this.authService.login(loginDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard) // Ensure this guard is active to protect the route
  @ApiOperation({ summary: 'Retrieve authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully.', type: UserEntity })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiBearerAuth('JWT-auth') // For Swagger UI to show the bearer token input
  @UseInterceptors(ClassSerializerInterceptor) // Ensure password and other excluded fields are hidden
  getProfile(@UserDecorator() user: UserEntity): UserEntity { // Use custom @User decorator for cleaner access
    this.logger.log(`Received request for user profile for user: ${user.username}`);
    // The JwtAuthGuard will attach the UserEntity to req.user,
    // and our @UserDecorator extracts it.
    return user;
  }
}

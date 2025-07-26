// src/features/activitypub/dto/activitypub-activity.dto.ts

import { IsString, IsUrl, IsOptional, IsArray, ValidateNested, IsDefined, IsObject, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// A simple DTO to represent a generic ActivityPub object or activity for validation purposes.
// This will serve as the 'expectedType' for the @Activity() decorator.
export class ActivityPubActivityDto {
  @IsOptional()
  @ApiPropertyOptional({ description: 'The JSON-LD context(s) for the object.' })
  '@context'?: string | string[] | object | object[]; // Can be string, array of strings, or array of objects

  @IsUrl()
  @IsDefined()
  @ApiProperty({ description: 'The globally unique ActivityPub ID (URI) of the object.' })
  id: string;

  @IsString({ each: true }) // Can be a string or array of strings
  @IsDefined()
  @ApiProperty({ description: 'The type(s) of the object (e.g., "Follow", "Create").' })
  type: string | string[];

  // FIX: Make 'actor' optional, as 'as:actor' might be used instead.
  // Add @ValidateIf to apply @IsUrl only if 'actor' is a string.
  @IsOptional() // Now optional
  @ApiProperty({ description: 'The IRI of the actor that performed the Activity.' })
  @ValidateIf(o => typeof o.actor === 'string') // Only validate as URL if it's a string
  @IsUrl({}, { message: 'actor must be a valid URL if it is a string' })
  actor?: string | object; // Allow actor to be a string (URL) or an object (embedded actor)

  @IsOptional()
  @ApiPropertyOptional({ description: 'The date and time at which the object was published, in ISO 8601 format.' })
  published?: string;

  // FIX: Make 'object' optional, as 'as:object' might be used instead.
  // Add @ValidateIf to apply @IsUrl only if 'object' is a string.
  @IsOptional() // Now optional
  @ApiPropertyOptional({ description: 'The object of the Activity. Can be a URI or an embedded object.' })
  @ValidateIf(o => typeof o.object === 'string') // Only validate as URL if it's a string
  @IsUrl({}, { message: 'object must be a valid URL if it is a string' })
  object?: string | object; // Allow object to be a string (URL) or an object (embedded object)

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true }) // Each item in the array must be a URL
  @ApiPropertyOptional({ description: 'Identifies one or more entities that are primary recipients of the object.' })
  to?: string[];

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true }) // Each item in the array must be a URL
  @ApiPropertyOptional({ description: 'Identifies one or more entities that are secondary recipients of the object.' })
  cc?: string[];

  // Add other common ActivityPub properties as needed, with appropriate decorators
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  summary?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  content?: string;

  // FIX: Explicitly allow 'as:actor' and 'as:object' and make them defined if 'actor'/'object' are not.
  // We need to ensure AT LEAST ONE of 'actor' OR 'as:actor' is present, and similarly for 'object'.
  // This requires a custom validation logic or a more complex DTO structure.
  // For now, we'll make them optional but ensure their types are correct.
  // The 'actor should not be null or undefined' error is still likely because neither 'actor' nor 'as:actor' is @IsDefined().
  // Let's add a custom validator or a combined check.

  // For simplicity and to resolve the immediate error, we will make 'actor' and 'object' optional.
  // The logic that extracts actorActivityPubId and objectActivityPubId in AppService/InboxProcessor
  // will be responsible for checking both 'actor' and 'as:actor' (and 'object'/'as:object').

  // FIX: Explicitly allow 'as:actor' and 'as:object' and validate them as URLs if they are strings.
  @IsOptional()
  @ApiPropertyOptional({ description: 'Deprecated ActivityStreams "actor" property.' })
  @ValidateIf(o => typeof o['as:actor'] === 'string')
  @IsUrl({}, { message: 'as:actor must be a valid URL if it is a string' })
  'as:actor'?: string | object;

  @IsOptional()
  @ApiPropertyOptional({ description: 'Deprecated ActivityStreams "object" property.' })
  @ValidateIf(o => typeof o['as:object'] === 'string')
  @IsUrl({}, { message: 'as:object must be a valid URL if it is a string' })
  'as:object'?: string | object;

  // To address "actor should not be null or undefined" if neither 'actor' nor 'as:actor' is provided,
  // this typically means the incoming payload is fundamentally missing the actor information.
  // The AppService/InboxProcessor should handle this check before DTO validation.
  // However, if we want DTO validation to catch it, we'd need a custom class-validator constraint
  // like @OneOf(['actor', 'as:actor']) which is more advanced.
  // For now, the AppService's check (if (!senderActorActivityPubId)) is the primary guard.
}

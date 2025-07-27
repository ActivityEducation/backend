// src/shared/decorators/check-abilities.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { AbilityTuple } from '@casl/ability';
import { Actions, Subjects } from '../authorization/ability.factory'; // Import Actions and Subjects

export const CHECK_ABILITIES_KEY = 'check_abilities';

/**
 * Custom decorator to define required CASL abilities for a route handler.
 * Usage: @CheckAbilities(['read', 'User'], ['manage', 'all'])
 * @param abilities A list of AbilityTuple arrays, where each tuple defines an action and subject.
 */
export const CheckAbilities = (...abilities: [Actions, Subjects, object?][]) => // Updated type to include optional conditions
  SetMetadata(CHECK_ABILITIES_KEY, abilities);

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpacedRepetitionScheduleEntity } from '../entities/spaced-repetition-schedule.entity';

// Default parameters for the FSRS v4 algorithm, as per the research documentation.
const DEFAULT_REQUEST_RETENTION = 0.9;
const DECAY = -0.5;
const DEFAULT_WEIGHTS = [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61];

export enum Rating {
    New = 0,
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4,
}

@Injectable()
export class FSRSLogic {
    private weights: number[];

    constructor(private readonly configService: ConfigService) {
        this.weights = this.configService.get<number[]>('fsrs.defaultWeights') || DEFAULT_WEIGHTS;
    }

    /**
     * Calculates the initial memory state (Stability and Difficulty) for a new card 
     * based on the user's first rating, optionally adjusted by community complexity.
     * @param rating The user's first rating for the card (1-4).
     * @param cdc_score The community-derived complexity score for the concept.
     * @param params The actor's personalized FSRS parameters.
     * @returns An object with the initial stability and difficulty.
     */
    public calculateInitialState(rating: Rating, cdc_score?: number, params?: Record<string, any>): { stability: number; difficulty: number } {
        const weights = params?.weights || this.weights;
        let initialDifficulty = weights[4] - (rating - 3) * weights[5];
        let initialStability = weights[rating - 1];

        if (cdc_score !== undefined) {
            const { d_modifier, s_modifier } = this.getComplexityModifiers(cdc_score);
            initialDifficulty *= d_modifier;
            initialStability *= s_modifier;
        }

        const clampedDifficulty = Math.min(Math.max(initialDifficulty, 1), 10);
        return { stability: initialStability, difficulty: clampedDifficulty };
    }

    /**
     * Determines the adjustment modifiers for initial difficulty and stability based on the CDC score.
     * @param cdc_score The community-derived complexity score.
     * @returns An object with difficulty and stability modifiers.
     */
    private getComplexityModifiers(cdc_score: number): { d_modifier: number, s_modifier: number } {
        if (cdc_score > 0.7) return { d_modifier: 1.2, s_modifier: 0.7 }; // High Complexity
        if (cdc_score < 0.3) return { d_modifier: 0.8, s_modifier: 1.5 }; // Low Complexity
        return { d_modifier: 1.0, s_modifier: 1.0 }; // Medium Complexity
    }

    /**
     * Updates the memory state of a card's schedule based on a subsequent review.
     * @param schedule The current schedule of the card, containing its DSR state.
     * @param rating The user's rating for the review.
     * @param reviewTime The timestamp of the review.
     * @returns The updated schedule with new stability, difficulty, and due date.
     */
    public updateState(
        schedule: SpacedRepetitionScheduleEntity,
        rating: Rating,
        reviewTime: Date,
    ): SpacedRepetitionScheduleEntity {
        if (!schedule.last_review) {
            // This should not happen for an update, but as a safeguard.
            // The service layer should call calculateInitialState for new cards.
            const initialState = this.calculateInitialState(rating);
            schedule.stability = initialState.stability;
            schedule.difficulty = initialState.difficulty;
            schedule.last_review = reviewTime;
            schedule.due = new Date(reviewTime.getTime() + this.nextInterval(schedule.stability) * 24 * 60 * 60 * 1000);
            schedule.state = 'Review';
            return schedule;
        }

        const t = (reviewTime.getTime() - new Date(schedule.last_review).getTime()) / (1000 * 60 * 60 * 24); // days
        const retrievability = this.calculateRetrievability(schedule.stability, t);

        const nextDifficulty = this.nextDifficulty(schedule.difficulty, rating);
        const nextStability = this.nextStability(schedule.stability, nextDifficulty, retrievability, rating);

        if (rating === Rating.Again) {
            schedule.lapses += 1;
        }

        const nextInterval = this.nextInterval(nextStability);

        schedule.stability = nextStability;
        schedule.difficulty = nextDifficulty;
        schedule.last_review = reviewTime;
        schedule.due = new Date(reviewTime.getTime() + nextInterval * 24 * 60 * 60 * 1000);
        schedule.state = 'Review'; // Can be refined to 'Learning' based on interval length

        return schedule;
    }

    /**
     * Calculates the probability of recalling a memory after a given time.
     * Formula: R(t,S) = (1 + t / (9 * S)) ^ DECAY
     * @param stability The memory's stability (S).
     * @param elapsedDays The time in days since the last review (t).
     * @returns The retrievability (R) as a probability between 0 and 1.
     */
    private calculateRetrievability(stability: number, elapsedDays: number): number {
        return Math.pow(1 + elapsedDays / (9 * stability), DECAY);
    }
    
    /**
     * Calculates the new difficulty based on the previous difficulty and the user's rating.
     * Incorporates mean reversion towards a central value.
     * Formula: D' = D - w6 * (grade - 3)
     * @param d The current difficulty (D).
     * @param rating The user's rating.
     * @returns The new difficulty, clamped between 1 and 10.
     */
    private nextDifficulty(d: number, rating: Rating): number {
        const next_d = d - this.weights[6] * (rating - 3);
        return Math.min(Math.max(next_d, 1), 10);
    }

    /**
     * Calculates the new stability based on the current state and user's rating.
     * Handles successful reviews and lapses (forgetting) differently.
     * @param s The current stability (S).
     * @param d The new difficulty (D').
     * @param r The calculated retrievability (R) at the time of review.
     * @param rating The user's rating.
     * @returns The new stability (S').
     */
    private nextStability(s: number, d: number, r: number, rating: Rating): number {
        if (rating === Rating.Again) {
            return this.weights[10] * Math.pow(d, -this.weights[11]) * Math.pow(s, this.weights[12]) * Math.exp((1 - r) * this.weights[13]);
        }
        
        const stabilityIncrease = Math.exp(this.weights[7]) *
            (11 - d) *
            Math.pow(s, -this.weights[8]) *
            (Math.exp((1 - r) * this.weights[9]) - 1);
        
        const hardPenalty = rating === Rating.Hard ? this.weights[15] : 1;
        const easyBonus = rating === Rating.Easy ? this.weights[16] : 1;

        return s * (1 + stabilityIncrease * hardPenalty * easyBonus);
    }

    /**
     * Calculates the next review interval in days.
     * @param s The new stability (S').
     * @returns The next interval in days, rounded and with a minimum of 1.
     */
    private nextInterval(s: number): number {
        const interval = s * (Math.pow(DEFAULT_REQUEST_RETENTION, 1 / DECAY) - 1);
        return Math.round(Math.max(1, interval));
    }
}

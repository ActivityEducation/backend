import { Injectable } from '@nestjs/common';
import { SpacedRepetitionScheduleEntity } from '../entities/spaced-repetition-schedule.entity';

// Default parameters for the FSRS v4 algorithm, as per the research documentation.
// w0-w16, where w14 is unused.
const DEFAULT_WEIGHTS = [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61];
const DEFAULT_REQUEST_RETENTION = 0.9;
const DECAY = -0.5;

export enum Rating {
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4,
}

@Injectable()
export class FSRSLogic {
    private weights: number[] = DEFAULT_WEIGHTS;

    /**
     * Calculates the initial memory state (Stability and Difficulty) for a new card 
     * based on the user's first rating.
     * @param rating The user's first rating for the card (1-4).
     * @returns An object with the initial stability and difficulty.
     */
    public calculateInitialState(rating: Rating): { stability: number; difficulty: number } {
        const initialDifficulty = this.weights[4] - (rating - 3) * this.weights[5];
        const clampedDifficulty = Math.min(Math.max(initialDifficulty, 1), 10);

        return {
            stability: this.weights[rating - 1],
            difficulty: clampedDifficulty,
        };
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
        // Using 9 * S is a simplification from some FSRS versions.
        // The core power-law curve is R = (1 + t/S)^-p
        // For this implementation, we will stick to the documented formula structure.
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
        // Clamp the result to the valid difficulty range [1, 10]
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
            // Formula for stability after a lapse
            return this.weights[10] * Math.pow(d, -this.weights[11]) * Math.pow(s, this.weights[12]) * Math.exp((1 - r) * this.weights[13]);
        }
        
        // Formula for stability after a successful review
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
     * This is derived by inverting the retrievability formula to solve for time 't'.
     * @param s The new stability (S').
     * @returns The next interval in days, rounded and with a minimum of 1.
     */
    private nextInterval(s: number): number {
        const interval = s * (Math.pow(DEFAULT_REQUEST_RETENTION, 1 / DECAY) - 1);
        return Math.round(Math.max(1, interval)); // Ensure interval is at least 1 day
    }
}

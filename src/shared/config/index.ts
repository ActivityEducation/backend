// src/shared/config/index.ts
export * from './permission-config.service';
import { registerAs } from '@nestjs/config';

export const AppConfig = registerAs('app', () => ({
  // ... existing configuration
  complexity: {
    dsignal: {
      gradePenaltyWeight: 0.4,
      stabilityGainDeficitWeight: 0.3,
      retrievabilitySurpriseWeight: 0.3,
    },
    reputation: {
      skillWeight: 0.6,
      experienceWeight: 0.4,
      reviewsWeight: 0.7, // within experience
      tenureWeight: 0.3,   // within experience
    },
    propagationAlpha: 0.85,
    timeDecayLambda: 0.01,
  },
  fsrs: {
    defaultWeights: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61],
    requestRetention: 0.9,
    decay: -0.5,
    minReviewsForOptimization: 200,
  },
}));
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export type BucketStats = {
  mean: number;
  variance: number;
  iterationCount: number;
};

export type ConfidenceRating = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type ComparedStats = {
  pooledStdDev: number;
  tStat: number;
  pValue: number;
  confidence: ConfidenceRating;
};

export function confidenceLessThan(
  conf1: ConfidenceRating,
  conf2: ConfidenceRating
): boolean {
  return (
    (conf2 === 'HIGH' && conf1 !== 'HIGH') ||
    (conf2 === 'MEDIUM' && conf1 === 'LOW')
  );
}

function pValueToConfidence(pValue: number): ConfidenceRating {
  if (pValue <= 0.05) {
    return 'HIGH';
  }
  if (pValue <= 0.15) {
    return 'MEDIUM';
  }
  return 'LOW';
}

// Function to calculate the cumulative distribution function of the t-distribution
function cumulativeDistributionT(t: number, df: number): number {
  const x = df / (t * t + df);
  return 0.5 * (1 + (t > 0 ? 1 : -1) * Math.sqrt(1 - x));
}

export function computeComparedStats(
  statsComp: BucketStats | null,
  statsRef: BucketStats | null
): ComparedStats | null {
  if (statsComp === null && statsRef !== null) {
    statsComp = {
      mean: 0,
      variance: 0,
      iterationCount: statsRef.iterationCount,
    };
  } else if (statsRef === null && statsComp !== null) {
    statsRef = {
      mean: 0,
      variance: 0,
      iterationCount: statsComp.iterationCount,
    };
  } else if (statsRef === null || statsComp === null) {
    return null;
  }
  if (statsComp === statsRef) {
    return null;
  }

  // Calculate pooled standard deviation
  const pooledStdDev = Math.sqrt(
    statsComp.variance / statsComp.iterationCount +
      statsRef.variance / statsRef.iterationCount
  );

  // Calculate t-statistic
  const tStat =
    (statsComp.mean - statsRef.mean) /
    (pooledStdDev *
      Math.sqrt(1 / statsComp.iterationCount + 1 / statsRef.iterationCount));

  // Calculate degrees of freedom
  const degreesOfFreedom =
    statsComp.iterationCount + statsRef.iterationCount - 2;

  // Calculate the P-value
  const pValue =
    2 * (1 - cumulativeDistributionT(Math.abs(tStat), degreesOfFreedom));

  const confidence = pValueToConfidence(pValue);

  return { pooledStdDev, tStat, pValue, confidence };
}

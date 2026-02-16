/**
 * Dice rolling module for ClawdVegas Craps
 * Uses cryptographically secure random numbers for fairness
 */

import { randomInt } from 'node:crypto';

/** A pair of dice values, each 1-6 */
export type DicePair = readonly [number, number];

/**
 * Roll two dice using cryptographically secure randomness
 * @returns A tuple of two dice values, each 1-6
 */
export function rollDice(): DicePair {
  const die1 = randomInt(1, 7); // randomInt is exclusive on upper bound
  const die2 = randomInt(1, 7);
  return [die1, die2] as const;
}

/**
 * Get the total of a dice roll
 * @param dice The dice pair to sum
 * @returns The sum of both dice (2-12)
 */
export function getTotal(dice: DicePair): number {
  return dice[0] + dice[1];
}

/**
 * Check if a roll is a "hardway" (doubles)
 * Hardways are rolling the same number on both dice (e.g., 2+2, 3+3)
 * @param dice The dice pair to check
 * @returns True if both dice show the same value
 */
export function isHardway(dice: DicePair): boolean {
  return dice[0] === dice[1];
}

/**
 * Check if a roll is a natural (7 or 11 on come-out)
 * @param dice The dice pair to check
 * @returns True if total is 7 or 11
 */
export function isNatural(dice: DicePair): boolean {
  const total = getTotal(dice);
  return total === 7 || total === 11;
}

/**
 * Check if a roll is craps (2, 3, or 12)
 * @param dice The dice pair to check
 * @returns True if total is 2, 3, or 12
 */
export function isCraps(dice: DicePair): boolean {
  const total = getTotal(dice);
  return total === 2 || total === 3 || total === 12;
}

/**
 * Check if a roll establishes a point (4, 5, 6, 8, 9, or 10)
 * @param dice The dice pair to check
 * @returns True if total is a point number
 */
export function isPoint(dice: DicePair): boolean {
  const total = getTotal(dice);
  return total === 4 || total === 5 || total === 6 ||
         total === 8 || total === 9 || total === 10;
}

/** Valid point numbers in craps */
export const POINT_NUMBERS = [4, 5, 6, 8, 9, 10] as const;
export type PointNumber = typeof POINT_NUMBERS[number];

/**
 * Type guard to check if a number is a valid point number
 */
export function isPointNumber(n: number): n is PointNumber {
  return POINT_NUMBERS.includes(n as PointNumber);
}

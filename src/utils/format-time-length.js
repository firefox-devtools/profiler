// @flow

/**
 * Format a positive float duration into a string. The precision will depend on the
 * value: closer to zero the value is, the most precise the resulting string will be.
 */
export default function formatTimeLength(timeLength: number): string {
  let result: string;
  if (timeLength >= 10) {
    result = timeLength.toFixed(0);
  } else if (timeLength >= 1) {
    result = timeLength.toFixed(1);
  } else if (timeLength >= 0.1) {
    result = timeLength.toFixed(2);
  } else {
    result = timeLength.toFixed(3);
  }

  return result;
}

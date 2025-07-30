/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Measure the size of text for drawing within a 2d context. This will allow text
 * to be drawn in a constrained space. This class uses a variety of heuristics and
 * caching to make this process fast.
 *
 * All measurements are in user space coordinates of the context. When the
 * context transform changes, these user space coordinates remain valid. They
 * only become invalid when the context's font or font size changes. When this
 * happens, a new TextMeasurement instance should be created.
 */
class TextMeasurement {
  _ctx: CanvasRenderingContext2D;
  _cache: { [id: string]: number };
  _averageCharWidth: number;
  overflowChar: string;
  minWidth: number;

  constructor(ctx: CanvasRenderingContext2D) {
    this._ctx = ctx;
    this._cache = {};
    this._averageCharWidth = this._calcAverageCharWidth();

    // TODO - L10N
    this.overflowChar = '…';
    this.minWidth = this.getTextWidth(this.overflowChar);
  }

  /**
   * Gets the average letter width in the English alphabet, for the current
   * context state (font size, family etc.). This provides a close enough
   * value to use in `getTextWidthApprox`.
   *
   * @return {number} The average letter width.
   */
  _calcAverageCharWidth(): number {
    const string =
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.()< /:-_';
    return this.getTextWidth(string) / string.length;
  }

  /**
   * Gets the width of the specified text, for the current context state
   * (font size, family etc.).
   *
   * @param {string} text - The text to analyze.
   * @return {number} The text width.
   */
  getTextWidth(text: string): number {
    const cachedWidth = this._cache[text];
    if (cachedWidth !== undefined) {
      return cachedWidth;
    }
    const metrics = this._ctx.measureText(text);
    this._cache[text] = metrics.width;
    return metrics.width;
  }

  /**
   * Massage a text to fit inside a given width. This clamps the string
   * at the end to avoid overflowing.
   *
   * @param {string} text - The text to fit inside the given width.
   * @param {number} maxWidth - The available width for the given text.
   * @return {string} The fitted text.
   */
  getFittedText(text: string, maxWidth: number): string {
    if (this.getTextWidth(text) < maxWidth) {
      return text;
    }

    // Returns the actual width of a string composed of the n first characters
    // of the text variable.
    const getWidth = (n: number) => this.getTextWidth(text.substring(0, n));
    // Estimate how many characters can still be added after taking into account
    // the space used by the n first characters. The result can be negative.
    const getRemainingCharacterCount = (n: number) =>
      Math.round((availableWidth - getWidth(n)) / this._averageCharWidth);

    // Approximate the number of characters to truncate to,
    // using avg character width as reference.
    const availableWidth = maxWidth - this.minWidth;
    const f = availableWidth / this._averageCharWidth;
    let n = Math.floor(f);
    if (n < 1) {
      return '';
    }

    // Do a second finer grained approximation to add or remove a few characters.
    n += getRemainingCharacterCount(n);

    // And a third one that can only add characters. This will be useful when
    // the characters added at the previous step were narrow (eg. '::').
    const offset = getRemainingCharacterCount(n);
    if (offset >= 1) {
      n += offset;
    }

    // If we overflow a little bit, remove characters one at a time until we no
    // longer do.
    while (getWidth(n) > availableWidth) {
      --n;
    }

    return text.substring(0, n) + this.overflowChar;
  }
}

export default TextMeasurement;
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

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
   * @param {string} text -The text to fit inside the given width.
   * @param {number} maxWidth - The available width for the given text.
   * @return {string} The fitted text.
   */
  getFittedText(text: string, maxWidth: number): string {
    if (this.getTextWidth(text) < maxWidth) {
      return text;
    }

    // Approximate the number of characters to truncate to,
    // using avg character width as reference.
    const f = (maxWidth - this.minWidth) / this._averageCharWidth;
    let n = Math.floor(f);
    if (n === f) {
      // The approximate width of `n` characters is exactly max width,
      // so take one character less just in case.
      n -= 1;
    }
    return n > 0 ? text.substring(0, n) + this.overflowChar : '';
  }
}

export default TextMeasurement;

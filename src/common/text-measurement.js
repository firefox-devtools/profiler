/**
 * Measure the size of text for drawing within a 2d context. This will allow text
 * to be drawn in a constrained space. This class uses a variety of heuristics and
 * caching to make this process fast.
 */
class TextMeasurement {
  constructor(ctx) {
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
  _calcAverageCharWidth() {
    const string = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.()< /:-_';
    return this.getTextWidth(string) / string.length;
  }

  /**
   * Gets the width of the specified text, for the current context state
   * (font size, family etc.).
   *
   * @param {string} text - The text to analyze.
   * @return {number} The text width.
   */
  getTextWidth(text) {
    const cachedWidth = this._cache[text];
    if (cachedWidth) {
      return cachedWidth;
    }
    const metrics = this._ctx.measureText(text);
    this._cache[text] = metrics.width;
    return metrics.width;
  }

  /**
   * Gets an approximate width of the specified text. This is much faster
   * than `_getTextWidth`, but inexact.
   *
   * @param {string} text - The text to analyze.
   * @return {number} The approximate text width.
   */
  getTextWidthApprox(text) {
    return text.length * this._averageCharWidth;
  }

  /**
   * Massage a text to fit inside a given width. This clamps the string
   * at the end to avoid overflowing.
   *
   * @param {string} text -The text to fit inside the given width.
   * @param {number} maxWidth - The available width for the given text.
   * @return {string} The fitted text.
   */
  getFittedText(text, maxWidth) {
    if (this.minWidth > maxWidth) {
      return '';
    }
    const textWidth = this.getTextWidth(text);
    if (textWidth < maxWidth) {
      return text;
    }
    for (let i = 1, len = text.length; i <= len; i++) {
      const trimmedText = text.substring(0, len - i);
      const trimmedWidth = this.getTextWidthApprox(trimmedText) + this.minWidth;
      if (trimmedWidth < maxWidth) {
        return trimmedText + this.overflowChar;
      }
    }
    return '';
  }
}

export default TextMeasurement;

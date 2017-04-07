// @flow

type Attempt = {
  count: number,
  total: number,
};

export class TemporaryError extends Error {
  attempt: Attempt;

  constructor(message: string, attempt: Attempt) {
    super(message);
    this.name = 'TemporaryError';
    this.attempt = attempt;
  }
}

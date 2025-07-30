export function makeWebWorker(file: string): Worker {
  return new Worker(`/${file}.js`);
}

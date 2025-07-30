export function makeWebWorker(file: string): Worker {
  return new window.Worker(`/${file}.js`);
}

export default class {
  constructor(file: string) {
    // TypeScript doesn't handle constructor returns well, but this works at runtime
    return new window.Worker(`/${file}.js`) as any;
  }
}
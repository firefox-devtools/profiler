export default class {
  constructor(file: string) {
    return new window.Worker(`/${file}.js`);
  }
}

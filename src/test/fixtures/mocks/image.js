export function createImageMock() {
  function Image() {
    instances.push(this);
  }
  const instances = [];
  return { instances, Image };
}

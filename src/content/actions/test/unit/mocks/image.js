export default function Image() {
  Image._instances.push(this);
}

Image._instances = [];
Image.cleanUp = () => { Image._instances = []; };

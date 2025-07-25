/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

const MAX_ARGUMENTS_TO_RECORD = 4;
const ZERO_ARGUMENTS_MAGIC = -2;
const EXPIRED_VALUES_MAGIC = -1;

const JSVAL_TYPE_DOUBLE = 0x00;
const JSVAL_TYPE_INT32 = 0x01;
const JSVAL_TYPE_BOOLEAN = 0x02;
const JSVAL_TYPE_UNDEFINED = 0x03;
const JSVAL_TYPE_NULL = 0x04;
const JSVAL_TYPE_MAGIC = 0x05;
const JSVAL_TYPE_STRING = 0x06;
const JSVAL_TYPE_SYMBOL = 0x07;
const JSVAL_TYPE_BIGINT = 0x09;
const JSVAL_TYPE_OBJECT = 0x0c;

const GETTER_SETTER_MAGIC = 0xf0;

const GENERIC_OBJECT_HAS_DENSE_ELEMENTS = 1;

const NUMBER_IS_OUT_OF_LINE_MAGIC = 0xf;
const MIN_INLINE_INT = -1;

const STRING_ENCODING_LATIN1 = 0;
const STRING_ENCODING_TWO_BYTE = 1;
const STRING_ENCODING_UTF8 = 2;

const OBJECT_KIND_NOT_IMPLEMENTED = 0;
const OBJECT_KIND_ARRAY_LIKE = 1;
const OBJECT_KIND_MAP_LIKE = 2;
const OBJECT_KIND_FUNCTION = 3;
const OBJECT_KIND_WRAPPED_PRIMITIVE_OBJECT = 4;
const OBJECT_KIND_GENERIC_OBJECT = 5;
const OBJECT_KIND_PROXY_OBJECT = 6;
const OBJECT_KIND_EXTERNAL = 7;

const MAX_COLLECTION_VALUES = 16;

const EXTERNAL_SUMMARY_EXPECTED_VERSION = 1;
const EXTERNAL_SUMMARY_KIND_OTHER = 0;
const EXTERNAL_SUMMARY_KIND_NODE = 1;

// const EXTERNAL_NODE_SUBKIND_OTHER = 0; (handled implicitly)
const EXTERNAL_NODE_SUBKIND_ELEMENT = 1;
const EXTERNAL_NODE_SUBKIND_ATTR = 2;
const EXTERNAL_NODE_SUBKIND_DOCUMENT = 3;
const EXTERNAL_NODE_SUBKIND_DOCUMENT_FRAGMENT = 4;
const EXTERNAL_NODE_SUBKIND_TEXT = 5;
const EXTERNAL_NODE_SUBKIND_COMMENT = 6;

class BufferReader {
  #view;
  #index;

  constructor(buffer, index = 0) {
    this.#view = new DataView(buffer);
    this.#index = index;
  }

  setIndex(value) {
    this.#index = value;
  }

  getIndex() {
    return this.#index;
  }

  peekUint8() {
    return this.#view.getUint8(this.#index);
  }

  readUint8() {
    let result = this.#view.getUint8(this.#index);
    this.#index += 1;
    return result;
  }

  readUint16() {
    let result = this.#view.getUint16(this.#index, true);
    this.#index += 2;
    return result;
  }

  readUint32() {
    let result = this.#view.getUint32(this.#index, true);
    this.#index += 4;
    return result;
  }

  readInt8() {
    let result = this.#view.getInt8(this.#index);
    this.#index += 1;
    return result;
  }

  readInt16() {
    let result = this.#view.getInt16(this.#index, true);
    this.#index += 2;
    return result;
  }

  readInt32() {
    let result = this.#view.getInt32(this.#index, true);
    this.#index += 4;
    return result;
  }

  readFloat64() {
    let result = this.#view.getFloat64(this.#index, true);
    this.#index += 8;
    return result;
  }

  readString() {
    let encodingAndLength = this.readUint16();
    let length = encodingAndLength & ~(0b11 << 14);
    let encoding = encodingAndLength >> 14;
    if (length == 0) {
      return "";
    }

    let result = "";
    if (encoding == STRING_ENCODING_LATIN1) {
      let decoder = new TextDecoder("latin1");
      result = decoder.decode(
        this.#view.buffer.slice(this.#index, this.#index + length)
      );
      this.#index += length;
    } else if (encoding == STRING_ENCODING_UTF8) {
      let decoder = new TextDecoder("utf-8");
      result = decoder.decode(
        this.#view.buffer.slice(this.#index, this.#index + length)
      );
      this.#index += length;
    } else if (encoding == STRING_ENCODING_TWO_BYTE) {
      let decoder = new TextDecoder("utf-16"); // this isn't quite right, is it? ugh.
      let size = length * 2;
      result = decoder.decode(
        this.#view.buffer.slice(this.#index, this.#index + size)
      );
      this.#index += size;
    }
    return result;
  }
}

function readArrayLikeSummary(result, reader, flags, depth, shapes) {
  let shapeId = reader.readUint32();
  let shape = shapes[shapeId];

  if (!shape || shape.length <= 0) {
    return;
  }
  result.class = shape[0];

  let preview = {};
  preview.kind = "ArrayLike";

  preview.items = [];
  preview.length = reader.readUint32();
  if (depth < 1) {
    for (let i = 0; i < preview.length && i < MAX_COLLECTION_VALUES; i++) {
      if (reader.peekUint8() == JSVAL_TYPE_MAGIC) {
        reader.readUint8();
        continue;
      }

      let nestedSummary = readValueSummary(reader, depth + 1, shapes);
      preview.items.push(nestedSummary);
    }
  }

  result.preview = preview;
}

function readFunctionSummary(result, reader) {
  result.class = "Function";
  result.name = reader.readString();
  result.parameterNames = [];
  let numParameterNames = reader.readUint32();
  for (let i = 0; i < numParameterNames && i < MAX_COLLECTION_VALUES; i++) {
    result.parameterNames.push(reader.readString());
  }
}

function readMapLikeSummary(result, reader, flags, depth, shapes) {
  let shapeId = reader.readUint32();
  let shape = shapes[shapeId];

  if (!shape || shape.length <= 0) {
    return;
  }
  result.class = shape[0];

  let preview = {};
  preview.kind = "MapLike";

  preview.entries = [];
  preview.size = reader.readUint32();
  if (depth < 1) {
    for (let i = 0; i < preview.length && i < MAX_COLLECTION_VALUES; i++) {
      let keySummary = readValueSummary(reader, depth + 1, shapes);
      let valueSummary = readValueSummary(reader, depth + 1, shapes);
      preview.entries.push([
        {
          configurable: true,
          enumerable: true,
          writable: true,
          value: keySummary,
        },
        {
          configurable: true,
          enumerable: true,
          writable: true,
          value: valueSummary,
        },
      ]);
    }
  }

  result.preview = preview;
}

function readGenericObjectSummary(result, reader, flags, depth, shapes) {
  let shapeId = reader.readUint32();
  let shape = shapes[shapeId];

  if (!shape || shape.length <= 0) {
    return;
  }
  result.class = shape[0];

  let preview = {};
  preview.kind = "Object";

  let hasDenseElements = !!(flags & GENERIC_OBJECT_HAS_DENSE_ELEMENTS);
  let ownProperties = {};
  let ownPropertiesLength = reader.readUint32();

  if (depth < 1) {
    for (let i = 1; i < shape.length && i <= MAX_COLLECTION_VALUES; i++) {
      let header = reader.peekUint8();
      let id = shape[i];
      let desc = {
        configurable: true,
        enumerable: true,
      };
      if (header == GETTER_SETTER_MAGIC) {
        reader.readUint8();
        desc.get = readValueSummary(reader, depth + 1, shapes);
        desc.set = readValueSummary(reader, depth + 1, shapes);
      } else {
        let nestedSummary = readValueSummary(reader, depth + 1, shapes);
        desc.writable = true;
        desc.value = nestedSummary;
      }
      ownProperties[id] = desc;
    }
  }

  if (hasDenseElements) {
    let elementsLength = reader.readUint32();
    if (depth < 1) {
      for (let i = 0; i < elementsLength && i < MAX_COLLECTION_VALUES; i++) {
        if (reader.peekUint8() == JSVAL_TYPE_MAGIC) {
          reader.readUint8();
          continue;
        }
        ownPropertiesLength++;
        let nestedSummary = readValueSummary(reader, depth + 1, shapes);
        ownProperties[i] = {
          configurable: true,
          enumerable: true,
          writable: true,
          value: nestedSummary,
        };
      }
    }
  }

  preview.ownProperties = ownProperties;
  preview.ownPropertiesLength = ownPropertiesLength;

  result.preview = preview;
}

function readClassFromShape(result, reader, shapes) {
  let shapeId = reader.readUint32();
  let shape = shapes[shapeId];

  if (!shape || shape.length <= 0) {
    return;
  }
  result.class = shape[0];
}

function readNodeSummary(result, reader, depth, shapes) {
  let preview = {};
  preview.kind = "DOMNode";
  preview.nodeType = reader.readUint16();
  preview.nodeName = reader.readString().toLowerCase();
  let subkindAndIsConnected = reader.readUint8();
  let subkind = subkindAndIsConnected & ~(1 << 7);
  preview.isConnected = subkindAndIsConnected >> 7;

  if (subkind == EXTERNAL_NODE_SUBKIND_ELEMENT) {
    preview.attributes = {};
    preview.attributesLength = reader.readUint32();
    for (
      let i = 0;
      i < preview.attributesLength && i < MAX_COLLECTION_VALUES;
      i++
    ) {
      let attrName = reader.readString();
      let attrVal = reader.readString();
      preview.attributes[attrName] = attrVal;
    }
  } else if (subkind == EXTERNAL_NODE_SUBKIND_ATTR) {
    preview.value = reader.readString();
  } else if (subkind == EXTERNAL_NODE_SUBKIND_DOCUMENT) {
    preview.location = reader.readString();
  } else if (subkind == EXTERNAL_NODE_SUBKIND_DOCUMENT_FRAGMENT) {
    preview.childNodesLength = reader.readUint32();
    if (depth < 1) {
      preview.childNodes = [];
      for (
        let i = 0;
        i < preview.childNodesLength && i < MAX_COLLECTION_VALUES;
        i++
      ) {
        preview.childNodes.push(readValueSummary(reader, depth + 1, shapes));
      }
    }
  } else if (
    subkind == EXTERNAL_NODE_SUBKIND_TEXT ||
    subkind == EXTERNAL_NODE_SUBKIND_COMMENT
  ) {
    preview.textContent = reader.readString();
  }

  result.preview = preview;
}

function readExternalObjectSummary(result, reader, depth, shapes) {
  readClassFromShape(result, reader, shapes);

  let startIndex = reader.getIndex();
  let size = reader.readUint32();
  try {
    let version = reader.readUint8();
    if (version != EXTERNAL_SUMMARY_EXPECTED_VERSION) {
      return;
    }

    let kind = reader.readUint8();
    if (kind == EXTERNAL_SUMMARY_KIND_OTHER) {
      return;
    }

    switch (kind) {
      case EXTERNAL_SUMMARY_KIND_NODE: {
        readNodeSummary(result, reader, depth, shapes);
        break;
      }
      default:
    }
  } finally {
    reader.setIndex(startIndex + size);
  }
}

function readObjectSummary(reader, flags, depth, shapes) {
  let result = {
    type: "object",
    class: undefined,
    ownPropertyLength: 0,
    isError: false,
    extensible: false,
    sealed: false,
    frozen: false,
  };

  let kind = reader.readUint8();
  switch (kind) {
    case OBJECT_KIND_NOT_IMPLEMENTED:
      readClassFromShape(result, reader, shapes);
      break;
    case OBJECT_KIND_ARRAY_LIKE:
      readArrayLikeSummary(result, reader, flags, depth, shapes);
      break;
    case OBJECT_KIND_MAP_LIKE:
      readMapLikeSummary(result, reader, flags, depth, shapes);
      break;
    case OBJECT_KIND_FUNCTION:
      readFunctionSummary(result, reader);
      break;
    case OBJECT_KIND_EXTERNAL:
      readExternalObjectSummary(result, reader, depth, shapes);
      break;
    case OBJECT_KIND_WRAPPED_PRIMITIVE_OBJECT: {
      result.wrappedValue = readValueSummary(reader, depth, shapes);
      readGenericObjectSummary(result, reader, flags, depth, shapes);
      break;
    }
    case OBJECT_KIND_GENERIC_OBJECT: {
      readGenericObjectSummary(result, reader, flags, depth, shapes);
      break;
    }
    case OBJECT_KIND_PROXY_OBJECT: {
      readClassFromShape(result, reader, shapes);
      result.preview = {
        kind: "Object",
        ownProperties: Object.create(null),
        ownPropertiesLength: 0,
      };
      break;
    }
    default:
      throw new Error("Bad object kind");
  }

  return result;
}

function readValueSummary(reader, depth, shapes) {
  let header = reader.readUint8();
  let type = header & 0x0f;
  let flags = (header & 0xf0) >> 4;
  switch (type) {
    case JSVAL_TYPE_DOUBLE:
      if (flags == NUMBER_IS_OUT_OF_LINE_MAGIC) {
        let value = reader.readFloat64();
        if (value === Infinity) {
          return { type: "Infinity" };
        } else if (value === -Infinity) {
          return { type: "-Infinity" };
        } else if (Number.isNaN(value)) {
          return { type: "NaN" };
        } else if (!value && 1 / value === -Infinity) {
          return { type: "-0" };
        }
        return value;
      }
      return 0;

    case JSVAL_TYPE_INT32:
      if (flags == NUMBER_IS_OUT_OF_LINE_MAGIC) {
        return reader.readInt32();
      }
      return flags + MIN_INLINE_INT;

    case JSVAL_TYPE_BOOLEAN:
      return !!flags;
    case JSVAL_TYPE_NULL:
      return { type: "null" };
    case JSVAL_TYPE_UNDEFINED:
      return { type: "undefined" };
    case JSVAL_TYPE_SYMBOL:
      return {
        type: "symbol",
        name: reader.readString(),
      };
    case JSVAL_TYPE_BIGINT:
      return {
        type: "BigInt",
        text: reader.readString(),
      };
    case JSVAL_TYPE_STRING: {
      return reader.readString();
    }
    case JSVAL_TYPE_OBJECT: {
      return readObjectSummary(reader, flags, depth, shapes);
    }
    default:
      throw new Error("Bad value type");
  }
}

function getArgumentSummaries(valuesBuffer, shapes, valuesBufferIndex) {
  if (valuesBufferIndex == ZERO_ARGUMENTS_MAGIC) {
    return [];
  }
  if (valuesBufferIndex == EXPIRED_VALUES_MAGIC) {
    return "<missing>";
  }

  let reader = new BufferReader(valuesBuffer, valuesBufferIndex);
  let argc = reader.readUint32();
  let args = new Array(argc);
  for (let i = 0; i < argc && i < MAX_ARGUMENTS_TO_RECORD; i++) {
    args[i] = readValueSummary(reader, 0, shapes);
  }
  return args;
}

export const ValueSummaryReader = { getArgumentSummaries };

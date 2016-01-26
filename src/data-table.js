export class DataTable {
  constructor(schema, data = []) {
    this._schema = schema;
    this._fieldCount = Object.keys(schema).length;
    this._length = data.length;
    this._stores =
      Object.keys(this._schema).map(fieldName => new Float32Array(this._length));
    if (data.constructor === DataTable) {
      if (this._schema === data._schema) {
        this._stores.forEach((store, fieldIndex) => {
          store.set(data._stores[fieldIndex].subarray(0, store.length));
        });
      } else {
        throw new Error("assigned incompatible DataTable");
      }
    } else {
      data.forEach((entry, entryIndex) => {
        for (let fieldIndex = 0; fieldIndex < this._fieldCount; fieldIndex++) {
          let value = (fieldIndex in entry) ? entry[fieldIndex] : null;
          this.setValue(entryIndex, fieldIndex, value);
        }
      });
    }
  }

  get length() {
    return this._length;
  }

  set length(newLength) {
    this._length = newLength;
    let storeLength = Math.max(this._stores[0].length, 1);
    while (storeLength < newLength) {
      storeLength *= 2;
    }
    if (this._stores[0].length != storeLength) {
      this._stores = this._stores.map(store => {
        let newStore = new Float32Array(storeLength);
        newStore.set(store);
        return newStore;
      });
    }
    return this._length;
  }

  getValue(entryIndex, fieldIndex) {
    if (!(fieldIndex in this._stores)) {
      throw new Error(`don't know about field index ${fieldIndex}`);
    }
    if (!(entryIndex in this._stores[fieldIndex])) {
      throw new Error(`there's no entry with index ${entryIndex} in store for index ${fieldIndex}`);
    }
    return this._stores[fieldIndex][entryIndex];
  }

  setValue(entryIndex, fieldIndex, value) {
    value = value === null ? -1 : +value;
    value = isNaN(value) ? -1 : value;
    this._stores[fieldIndex][entryIndex] = value;
  }

  getObject(entryIndex) {
    let o = {};
    for (let fieldName in this._schema) {
      o[fieldName] = this.getValue(entryIndex, this._schema[fieldName]);
    }
    return o;
  }

  setObject(entryIndex, o) {
    for (let fieldName in this._schema) {
      const value = (fieldName in o) ? o[fieldName] : null;
      this.setValue(entryIndex, this._schema[fieldName], value);
    }
  }

  addObject(o) {
    const entryIndex = this.length;
    this.length++;
    this.setObject(entryIndex, o);
  }

  mapFields(inputFieldIndex, funs) {
    let newTable = new DataTable(this._schema, this);
    const length = this._length;
    for (let fieldName in this._schema) {
      const fieldIndex = this._schema[fieldName];
      if (funs[fieldName]) {
        for (let entryIndex = 0; entryIndex < length; entryIndex++) {
          const inputValue = this.getValue(entryIndex, inputFieldIndex);
          const newValue = funs[fieldName](inputValue);
          newTable.setValue(entryIndex, fieldIndex, newValue);
        }
      }
    }
    return newTable;
  }

  mapFieldsWithNewSchema(newSchema, inputFieldIndex, funs) {
    let newTable = new DataTable(newSchema, []);
    const length = this._length;
    newTable.length = length;
    for (let fieldName in newSchema) {
      let fieldIndexInNewSchema = newSchema[fieldName];
      if (funs[fieldName]) {
        for (let entryIndex = 0; entryIndex < length; entryIndex++) {
          const inputValue = this.getValue(entryIndex, inputFieldIndex);
          const newValue = funs[fieldName](inputValue);
          newTable.setValue(entryIndex, fieldIndexInNewSchema, newValue);
        }
      } else if (fieldName in this._schema) {
        // Copy over our values
        const fieldIndexInOldSchema = this._schema[fieldName];
        const oldStore = this._stores[fieldIndexInOldSchema];
        let newStore = newTable._stores[fieldIndexInNewSchema];
        newStore.set(oldStore.subarray(0, newStore.length));
      } else {
        // Initialize with -1
        let newStore = newTable._stores[fieldIndexInNewSchema];
        for (let entryIndex = 0; entryIndex < length; entryIndex++) {
          newStore[entryIndex] = -1;
        }
      }
    }
    return newTable;
  }

  oneFieldForEach(fieldIndex, fun) {
    const length = this._length;
    for (let i = 0; i < length; i++) {
      fun(this.getValue(i, fieldIndex), i);
    }
  }

  twoFieldsForEach(fieldIndex1, fieldIndex2, fun) {
    const length = this._length;
    for (let i = 0; i < length; i++) {
      fun(this.getValue(i, fieldIndex1), this.getValue(i, fieldIndex2), i);
    }
  }

  threeFieldsForEach(fieldIndex1, fieldIndex2, fieldIndex3, fun) {
    const length = this._length;
    for (let i = 0; i < length; i++) {
      fun(this.getValue(i, fieldIndex1), this.getValue(i, fieldIndex2), this.getValue(i, fieldIndex3), i);
    }
  }

  declareAdder(adderName, fieldNames) {
    const fieldIndices = fieldNames.map(name => this._schema[name]);
    const otherIndices = Object.values(this._schema).filter(index => fieldIndices.indexOf(index) === -1);
    this[adderName] = function() {
      const entryIndex = this.length++;
      for (let i = 0; i < fieldIndices.length; i++) {
        const fieldIndex = fieldIndices[i];
        this.setValue(entryIndex, fieldIndex, arguments[i]);
      }
      for (let i = 0; i < otherIndices.length; i++) {
        const fieldIndex = otherIndices[i];
        this.setValue(entryIndex, fieldIndex, -1);
      }
    }
  }
}

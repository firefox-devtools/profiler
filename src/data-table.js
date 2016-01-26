export class DataTable {
  constructor(schema, data = []) {
    this._schema = schema;
    this._fieldCount = Object.keys(schema).length;
    this._length = data.length;
    if (data.constructor === DataTable) {
      if (this._schema === data._schema) {
        this._stores = data._stores.map(store => store.slice(0));
      } else {
        throw new Error("assigned incompatible DataTable");
      }
    } else {
      this._stores = Object.keys(this._schema).map(fieldName => {
        const fieldIndex = this._schema[fieldName];
        return data.map(entry => (fieldIndex in entry) ? entry[fieldIndex] : null);
      });
    }
  }

  get length() {
    return this._length;
  }

  set length(newLength) {
    this._length = newLength;
    return this._length;
  }

  getValue(entryIndex, fieldIndex) {
    let value = this._stores[fieldIndex][entryIndex];
    return value;
  }

  setValue(entryIndex, fieldIndex, value) {
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
    for (let fieldName in this._schema) {
      if (funs[fieldName]) {
        const fieldIndex = this._schema[fieldName];
        newTable._stores[fieldIndex] = this._stores[inputFieldIndex].map(funs[fieldName]);
      }
    }
    return newTable;
  }

  mapFieldsWithNewSchema(newSchema, inputFieldIndex, funs) {
    let newTable = new DataTable(newSchema, []);
    const length = this._length;
    newTable.length = length;
    let inputStore = this._stores[inputFieldIndex];
    for (let fieldName in newSchema) {
      let fieldIndexInNewSchema = newSchema[fieldName];
      if (funs[fieldName]) {
        newTable._stores[fieldIndexInNewSchema] = inputStore.map(funs[fieldName]);
      } else if (fieldName in this._schema) {
        // Copy over our values.
        const fieldIndexInOldSchema = this._schema[fieldName];
        const oldStore = this._stores[fieldIndexInOldSchema];
        newTable._stores[fieldIndexInNewSchema] = oldStore.slice(0);
      } else {
        // Leave target store empty (sparse array).
      }
    }
    return newTable;
  }

  oneFieldForEach(fieldIndex, fun) {
    this._stores[fieldIndex].forEach(fun);
  }

  twoFieldsForEach(fieldIndex1, fieldIndex2, fun) {
    const length = this._length;
    const field1Store = this._stores[fieldIndex1];
    const field2Store = this._stores[fieldIndex2];
    for (let i = 0; i < length; i++) {
      fun(field1Store[i], field2Store[i], i);
    }
  }

  threeFieldsForEach(fieldIndex1, fieldIndex2, fieldIndex3, fun) {
    const length = this._length;
    const field1Store = this._stores[fieldIndex1];
    const field2Store = this._stores[fieldIndex2];
    const field3Store = this._stores[fieldIndex3];
    for (let i = 0; i < length; i++) {
      fun(field1Store[i], field2Store[i], field3Store[i], i);
    }
  }

  declareAdder(adderName, fieldNames) {
    const fieldIndices = fieldNames.map(name => this._schema[name]);
    this[adderName] = function() {
      const entryIndex = this.length++;
      for (let i = 0; i < fieldIndices.length; i++) {
        const fieldIndex = fieldIndices[i];
        this._stores[fieldIndex][entryIndex] = arguments[i];
      }
    }
  }
}

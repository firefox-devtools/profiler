/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.simpleperf_report_proto = (function() {

    /**
     * Namespace simpleperf_report_proto.
     * @exports simpleperf_report_proto
     * @namespace
     */
    var simpleperf_report_proto = {};

    simpleperf_report_proto.Sample = (function() {

        /**
         * Properties of a Sample.
         * @memberof simpleperf_report_proto
         * @interface ISample
         * @property {number|Long|null} [time] Sample time
         * @property {number|null} [threadId] Sample threadId
         * @property {Array.<simpleperf_report_proto.Sample.ICallChainEntry>|null} [callchain] Sample callchain
         * @property {number|Long|null} [eventCount] Sample eventCount
         * @property {number|null} [eventTypeId] Sample eventTypeId
         * @property {simpleperf_report_proto.Sample.IUnwindingResult|null} [unwindingResult] Sample unwindingResult
         */

        /**
         * Constructs a new Sample.
         * @memberof simpleperf_report_proto
         * @classdesc Represents a Sample.
         * @implements ISample
         * @constructor
         * @param {simpleperf_report_proto.ISample=} [properties] Properties to set
         */
        function Sample(properties) {
            this.callchain = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Sample time.
         * @member {number|Long} time
         * @memberof simpleperf_report_proto.Sample
         * @instance
         */
        Sample.prototype.time = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Sample threadId.
         * @member {number} threadId
         * @memberof simpleperf_report_proto.Sample
         * @instance
         */
        Sample.prototype.threadId = 0;

        /**
         * Sample callchain.
         * @member {Array.<simpleperf_report_proto.Sample.ICallChainEntry>} callchain
         * @memberof simpleperf_report_proto.Sample
         * @instance
         */
        Sample.prototype.callchain = $util.emptyArray;

        /**
         * Sample eventCount.
         * @member {number|Long} eventCount
         * @memberof simpleperf_report_proto.Sample
         * @instance
         */
        Sample.prototype.eventCount = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Sample eventTypeId.
         * @member {number} eventTypeId
         * @memberof simpleperf_report_proto.Sample
         * @instance
         */
        Sample.prototype.eventTypeId = 0;

        /**
         * Sample unwindingResult.
         * @member {simpleperf_report_proto.Sample.IUnwindingResult|null|undefined} unwindingResult
         * @memberof simpleperf_report_proto.Sample
         * @instance
         */
        Sample.prototype.unwindingResult = null;

        /**
         * Creates a new Sample instance using the specified properties.
         * @function create
         * @memberof simpleperf_report_proto.Sample
         * @static
         * @param {simpleperf_report_proto.ISample=} [properties] Properties to set
         * @returns {simpleperf_report_proto.Sample} Sample instance
         */
        Sample.create = function create(properties) {
            return new Sample(properties);
        };

        /**
         * Encodes the specified Sample message. Does not implicitly {@link simpleperf_report_proto.Sample.verify|verify} messages.
         * @function encode
         * @memberof simpleperf_report_proto.Sample
         * @static
         * @param {simpleperf_report_proto.ISample} message Sample message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Sample.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.time != null && Object.hasOwnProperty.call(message, "time"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.time);
            if (message.threadId != null && Object.hasOwnProperty.call(message, "threadId"))
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.threadId);
            if (message.callchain != null && message.callchain.length)
                for (var i = 0; i < message.callchain.length; ++i)
                    $root.simpleperf_report_proto.Sample.CallChainEntry.encode(message.callchain[i], writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            if (message.eventCount != null && Object.hasOwnProperty.call(message, "eventCount"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint64(message.eventCount);
            if (message.eventTypeId != null && Object.hasOwnProperty.call(message, "eventTypeId"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.eventTypeId);
            if (message.unwindingResult != null && Object.hasOwnProperty.call(message, "unwindingResult"))
                $root.simpleperf_report_proto.Sample.UnwindingResult.encode(message.unwindingResult, writer.uint32(/* id 6, wireType 2 =*/50).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified Sample message, length delimited. Does not implicitly {@link simpleperf_report_proto.Sample.verify|verify} messages.
         * @function encodeDelimited
         * @memberof simpleperf_report_proto.Sample
         * @static
         * @param {simpleperf_report_proto.ISample} message Sample message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Sample.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Sample message from the specified reader or buffer.
         * @function decode
         * @memberof simpleperf_report_proto.Sample
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {simpleperf_report_proto.Sample} Sample
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Sample.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.simpleperf_report_proto.Sample();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.time = reader.uint64();
                        break;
                    }
                case 2: {
                        message.threadId = reader.int32();
                        break;
                    }
                case 3: {
                        if (!(message.callchain && message.callchain.length))
                            message.callchain = [];
                        message.callchain.push($root.simpleperf_report_proto.Sample.CallChainEntry.decode(reader, reader.uint32()));
                        break;
                    }
                case 4: {
                        message.eventCount = reader.uint64();
                        break;
                    }
                case 5: {
                        message.eventTypeId = reader.uint32();
                        break;
                    }
                case 6: {
                        message.unwindingResult = $root.simpleperf_report_proto.Sample.UnwindingResult.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Sample message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof simpleperf_report_proto.Sample
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {simpleperf_report_proto.Sample} Sample
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Sample.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Sample message.
         * @function verify
         * @memberof simpleperf_report_proto.Sample
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Sample.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.time != null && message.hasOwnProperty("time"))
                if (!$util.isInteger(message.time) && !(message.time && $util.isInteger(message.time.low) && $util.isInteger(message.time.high)))
                    return "time: integer|Long expected";
            if (message.threadId != null && message.hasOwnProperty("threadId"))
                if (!$util.isInteger(message.threadId))
                    return "threadId: integer expected";
            if (message.callchain != null && message.hasOwnProperty("callchain")) {
                if (!Array.isArray(message.callchain))
                    return "callchain: array expected";
                for (var i = 0; i < message.callchain.length; ++i) {
                    var error = $root.simpleperf_report_proto.Sample.CallChainEntry.verify(message.callchain[i]);
                    if (error)
                        return "callchain." + error;
                }
            }
            if (message.eventCount != null && message.hasOwnProperty("eventCount"))
                if (!$util.isInteger(message.eventCount) && !(message.eventCount && $util.isInteger(message.eventCount.low) && $util.isInteger(message.eventCount.high)))
                    return "eventCount: integer|Long expected";
            if (message.eventTypeId != null && message.hasOwnProperty("eventTypeId"))
                if (!$util.isInteger(message.eventTypeId))
                    return "eventTypeId: integer expected";
            if (message.unwindingResult != null && message.hasOwnProperty("unwindingResult")) {
                var error = $root.simpleperf_report_proto.Sample.UnwindingResult.verify(message.unwindingResult);
                if (error)
                    return "unwindingResult." + error;
            }
            return null;
        };

        /**
         * Creates a Sample message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof simpleperf_report_proto.Sample
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {simpleperf_report_proto.Sample} Sample
         */
        Sample.fromObject = function fromObject(object) {
            if (object instanceof $root.simpleperf_report_proto.Sample)
                return object;
            var message = new $root.simpleperf_report_proto.Sample();
            if (object.time != null)
                if ($util.Long)
                    (message.time = $util.Long.fromValue(object.time)).unsigned = true;
                else if (typeof object.time === "string")
                    message.time = parseInt(object.time, 10);
                else if (typeof object.time === "number")
                    message.time = object.time;
                else if (typeof object.time === "object")
                    message.time = new $util.LongBits(object.time.low >>> 0, object.time.high >>> 0).toNumber(true);
            if (object.threadId != null)
                message.threadId = object.threadId | 0;
            if (object.callchain) {
                if (!Array.isArray(object.callchain))
                    throw TypeError(".simpleperf_report_proto.Sample.callchain: array expected");
                message.callchain = [];
                for (var i = 0; i < object.callchain.length; ++i) {
                    if (typeof object.callchain[i] !== "object")
                        throw TypeError(".simpleperf_report_proto.Sample.callchain: object expected");
                    message.callchain[i] = $root.simpleperf_report_proto.Sample.CallChainEntry.fromObject(object.callchain[i]);
                }
            }
            if (object.eventCount != null)
                if ($util.Long)
                    (message.eventCount = $util.Long.fromValue(object.eventCount)).unsigned = true;
                else if (typeof object.eventCount === "string")
                    message.eventCount = parseInt(object.eventCount, 10);
                else if (typeof object.eventCount === "number")
                    message.eventCount = object.eventCount;
                else if (typeof object.eventCount === "object")
                    message.eventCount = new $util.LongBits(object.eventCount.low >>> 0, object.eventCount.high >>> 0).toNumber(true);
            if (object.eventTypeId != null)
                message.eventTypeId = object.eventTypeId >>> 0;
            if (object.unwindingResult != null) {
                if (typeof object.unwindingResult !== "object")
                    throw TypeError(".simpleperf_report_proto.Sample.unwindingResult: object expected");
                message.unwindingResult = $root.simpleperf_report_proto.Sample.UnwindingResult.fromObject(object.unwindingResult);
            }
            return message;
        };

        /**
         * Creates a plain object from a Sample message. Also converts values to other types if specified.
         * @function toObject
         * @memberof simpleperf_report_proto.Sample
         * @static
         * @param {simpleperf_report_proto.Sample} message Sample
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Sample.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults)
                object.callchain = [];
            if (options.defaults) {
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.time = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.time = options.longs === String ? "0" : 0;
                object.threadId = 0;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.eventCount = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.eventCount = options.longs === String ? "0" : 0;
                object.eventTypeId = 0;
                object.unwindingResult = null;
            }
            if (message.time != null && message.hasOwnProperty("time"))
                if (typeof message.time === "number")
                    object.time = options.longs === String ? String(message.time) : message.time;
                else
                    object.time = options.longs === String ? $util.Long.prototype.toString.call(message.time) : options.longs === Number ? new $util.LongBits(message.time.low >>> 0, message.time.high >>> 0).toNumber(true) : message.time;
            if (message.threadId != null && message.hasOwnProperty("threadId"))
                object.threadId = message.threadId;
            if (message.callchain && message.callchain.length) {
                object.callchain = [];
                for (var j = 0; j < message.callchain.length; ++j)
                    object.callchain[j] = $root.simpleperf_report_proto.Sample.CallChainEntry.toObject(message.callchain[j], options);
            }
            if (message.eventCount != null && message.hasOwnProperty("eventCount"))
                if (typeof message.eventCount === "number")
                    object.eventCount = options.longs === String ? String(message.eventCount) : message.eventCount;
                else
                    object.eventCount = options.longs === String ? $util.Long.prototype.toString.call(message.eventCount) : options.longs === Number ? new $util.LongBits(message.eventCount.low >>> 0, message.eventCount.high >>> 0).toNumber(true) : message.eventCount;
            if (message.eventTypeId != null && message.hasOwnProperty("eventTypeId"))
                object.eventTypeId = message.eventTypeId;
            if (message.unwindingResult != null && message.hasOwnProperty("unwindingResult"))
                object.unwindingResult = $root.simpleperf_report_proto.Sample.UnwindingResult.toObject(message.unwindingResult, options);
            return object;
        };

        /**
         * Converts this Sample to JSON.
         * @function toJSON
         * @memberof simpleperf_report_proto.Sample
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Sample.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Sample
         * @function getTypeUrl
         * @memberof simpleperf_report_proto.Sample
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Sample.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/simpleperf_report_proto.Sample";
        };

        Sample.CallChainEntry = (function() {

            /**
             * Properties of a CallChainEntry.
             * @memberof simpleperf_report_proto.Sample
             * @interface ICallChainEntry
             * @property {number|Long|null} [vaddrInFile] CallChainEntry vaddrInFile
             * @property {number|null} [fileId] CallChainEntry fileId
             * @property {number|null} [symbolId] CallChainEntry symbolId
             * @property {simpleperf_report_proto.Sample.CallChainEntry.ExecutionType|null} [executionType] CallChainEntry executionType
             */

            /**
             * Constructs a new CallChainEntry.
             * @memberof simpleperf_report_proto.Sample
             * @classdesc Represents a CallChainEntry.
             * @implements ICallChainEntry
             * @constructor
             * @param {simpleperf_report_proto.Sample.ICallChainEntry=} [properties] Properties to set
             */
            function CallChainEntry(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * CallChainEntry vaddrInFile.
             * @member {number|Long} vaddrInFile
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @instance
             */
            CallChainEntry.prototype.vaddrInFile = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * CallChainEntry fileId.
             * @member {number} fileId
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @instance
             */
            CallChainEntry.prototype.fileId = 0;

            /**
             * CallChainEntry symbolId.
             * @member {number} symbolId
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @instance
             */
            CallChainEntry.prototype.symbolId = 0;

            /**
             * CallChainEntry executionType.
             * @member {simpleperf_report_proto.Sample.CallChainEntry.ExecutionType} executionType
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @instance
             */
            CallChainEntry.prototype.executionType = 0;

            /**
             * Creates a new CallChainEntry instance using the specified properties.
             * @function create
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @static
             * @param {simpleperf_report_proto.Sample.ICallChainEntry=} [properties] Properties to set
             * @returns {simpleperf_report_proto.Sample.CallChainEntry} CallChainEntry instance
             */
            CallChainEntry.create = function create(properties) {
                return new CallChainEntry(properties);
            };

            /**
             * Encodes the specified CallChainEntry message. Does not implicitly {@link simpleperf_report_proto.Sample.CallChainEntry.verify|verify} messages.
             * @function encode
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @static
             * @param {simpleperf_report_proto.Sample.ICallChainEntry} message CallChainEntry message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CallChainEntry.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.vaddrInFile != null && Object.hasOwnProperty.call(message, "vaddrInFile"))
                    writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.vaddrInFile);
                if (message.fileId != null && Object.hasOwnProperty.call(message, "fileId"))
                    writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.fileId);
                if (message.symbolId != null && Object.hasOwnProperty.call(message, "symbolId"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.symbolId);
                if (message.executionType != null && Object.hasOwnProperty.call(message, "executionType"))
                    writer.uint32(/* id 4, wireType 0 =*/32).int32(message.executionType);
                return writer;
            };

            /**
             * Encodes the specified CallChainEntry message, length delimited. Does not implicitly {@link simpleperf_report_proto.Sample.CallChainEntry.verify|verify} messages.
             * @function encodeDelimited
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @static
             * @param {simpleperf_report_proto.Sample.ICallChainEntry} message CallChainEntry message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            CallChainEntry.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a CallChainEntry message from the specified reader or buffer.
             * @function decode
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {simpleperf_report_proto.Sample.CallChainEntry} CallChainEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CallChainEntry.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.simpleperf_report_proto.Sample.CallChainEntry();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.vaddrInFile = reader.uint64();
                            break;
                        }
                    case 2: {
                            message.fileId = reader.uint32();
                            break;
                        }
                    case 3: {
                            message.symbolId = reader.int32();
                            break;
                        }
                    case 4: {
                            message.executionType = reader.int32();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a CallChainEntry message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {simpleperf_report_proto.Sample.CallChainEntry} CallChainEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            CallChainEntry.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a CallChainEntry message.
             * @function verify
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            CallChainEntry.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.vaddrInFile != null && message.hasOwnProperty("vaddrInFile"))
                    if (!$util.isInteger(message.vaddrInFile) && !(message.vaddrInFile && $util.isInteger(message.vaddrInFile.low) && $util.isInteger(message.vaddrInFile.high)))
                        return "vaddrInFile: integer|Long expected";
                if (message.fileId != null && message.hasOwnProperty("fileId"))
                    if (!$util.isInteger(message.fileId))
                        return "fileId: integer expected";
                if (message.symbolId != null && message.hasOwnProperty("symbolId"))
                    if (!$util.isInteger(message.symbolId))
                        return "symbolId: integer expected";
                if (message.executionType != null && message.hasOwnProperty("executionType"))
                    switch (message.executionType) {
                    default:
                        return "executionType: enum value expected";
                    case 0:
                    case 1:
                    case 2:
                    case 3:
                        break;
                    }
                return null;
            };

            /**
             * Creates a CallChainEntry message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {simpleperf_report_proto.Sample.CallChainEntry} CallChainEntry
             */
            CallChainEntry.fromObject = function fromObject(object) {
                if (object instanceof $root.simpleperf_report_proto.Sample.CallChainEntry)
                    return object;
                var message = new $root.simpleperf_report_proto.Sample.CallChainEntry();
                if (object.vaddrInFile != null)
                    if ($util.Long)
                        (message.vaddrInFile = $util.Long.fromValue(object.vaddrInFile)).unsigned = true;
                    else if (typeof object.vaddrInFile === "string")
                        message.vaddrInFile = parseInt(object.vaddrInFile, 10);
                    else if (typeof object.vaddrInFile === "number")
                        message.vaddrInFile = object.vaddrInFile;
                    else if (typeof object.vaddrInFile === "object")
                        message.vaddrInFile = new $util.LongBits(object.vaddrInFile.low >>> 0, object.vaddrInFile.high >>> 0).toNumber(true);
                if (object.fileId != null)
                    message.fileId = object.fileId >>> 0;
                if (object.symbolId != null)
                    message.symbolId = object.symbolId | 0;
                switch (object.executionType) {
                default:
                    if (typeof object.executionType === "number") {
                        message.executionType = object.executionType;
                        break;
                    }
                    break;
                case "NATIVE_METHOD":
                case 0:
                    message.executionType = 0;
                    break;
                case "INTERPRETED_JVM_METHOD":
                case 1:
                    message.executionType = 1;
                    break;
                case "JIT_JVM_METHOD":
                case 2:
                    message.executionType = 2;
                    break;
                case "ART_METHOD":
                case 3:
                    message.executionType = 3;
                    break;
                }
                return message;
            };

            /**
             * Creates a plain object from a CallChainEntry message. Also converts values to other types if specified.
             * @function toObject
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @static
             * @param {simpleperf_report_proto.Sample.CallChainEntry} message CallChainEntry
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            CallChainEntry.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, true);
                        object.vaddrInFile = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.vaddrInFile = options.longs === String ? "0" : 0;
                    object.fileId = 0;
                    object.symbolId = 0;
                    object.executionType = options.enums === String ? "NATIVE_METHOD" : 0;
                }
                if (message.vaddrInFile != null && message.hasOwnProperty("vaddrInFile"))
                    if (typeof message.vaddrInFile === "number")
                        object.vaddrInFile = options.longs === String ? String(message.vaddrInFile) : message.vaddrInFile;
                    else
                        object.vaddrInFile = options.longs === String ? $util.Long.prototype.toString.call(message.vaddrInFile) : options.longs === Number ? new $util.LongBits(message.vaddrInFile.low >>> 0, message.vaddrInFile.high >>> 0).toNumber(true) : message.vaddrInFile;
                if (message.fileId != null && message.hasOwnProperty("fileId"))
                    object.fileId = message.fileId;
                if (message.symbolId != null && message.hasOwnProperty("symbolId"))
                    object.symbolId = message.symbolId;
                if (message.executionType != null && message.hasOwnProperty("executionType"))
                    object.executionType = options.enums === String ? $root.simpleperf_report_proto.Sample.CallChainEntry.ExecutionType[message.executionType] === undefined ? message.executionType : $root.simpleperf_report_proto.Sample.CallChainEntry.ExecutionType[message.executionType] : message.executionType;
                return object;
            };

            /**
             * Converts this CallChainEntry to JSON.
             * @function toJSON
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            CallChainEntry.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for CallChainEntry
             * @function getTypeUrl
             * @memberof simpleperf_report_proto.Sample.CallChainEntry
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            CallChainEntry.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/simpleperf_report_proto.Sample.CallChainEntry";
            };

            /**
             * ExecutionType enum.
             * @name simpleperf_report_proto.Sample.CallChainEntry.ExecutionType
             * @enum {number}
             * @property {number} NATIVE_METHOD=0 NATIVE_METHOD value
             * @property {number} INTERPRETED_JVM_METHOD=1 INTERPRETED_JVM_METHOD value
             * @property {number} JIT_JVM_METHOD=2 JIT_JVM_METHOD value
             * @property {number} ART_METHOD=3 ART_METHOD value
             */
            CallChainEntry.ExecutionType = (function() {
                var valuesById = {}, values = Object.create(valuesById);
                values[valuesById[0] = "NATIVE_METHOD"] = 0;
                values[valuesById[1] = "INTERPRETED_JVM_METHOD"] = 1;
                values[valuesById[2] = "JIT_JVM_METHOD"] = 2;
                values[valuesById[3] = "ART_METHOD"] = 3;
                return values;
            })();

            return CallChainEntry;
        })();

        Sample.UnwindingResult = (function() {

            /**
             * Properties of an UnwindingResult.
             * @memberof simpleperf_report_proto.Sample
             * @interface IUnwindingResult
             * @property {number|null} [rawErrorCode] UnwindingResult rawErrorCode
             * @property {number|Long|null} [errorAddr] UnwindingResult errorAddr
             * @property {simpleperf_report_proto.Sample.UnwindingResult.ErrorCode|null} [errorCode] UnwindingResult errorCode
             */

            /**
             * Constructs a new UnwindingResult.
             * @memberof simpleperf_report_proto.Sample
             * @classdesc Represents an UnwindingResult.
             * @implements IUnwindingResult
             * @constructor
             * @param {simpleperf_report_proto.Sample.IUnwindingResult=} [properties] Properties to set
             */
            function UnwindingResult(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * UnwindingResult rawErrorCode.
             * @member {number} rawErrorCode
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @instance
             */
            UnwindingResult.prototype.rawErrorCode = 0;

            /**
             * UnwindingResult errorAddr.
             * @member {number|Long} errorAddr
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @instance
             */
            UnwindingResult.prototype.errorAddr = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

            /**
             * UnwindingResult errorCode.
             * @member {simpleperf_report_proto.Sample.UnwindingResult.ErrorCode} errorCode
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @instance
             */
            UnwindingResult.prototype.errorCode = 0;

            /**
             * Creates a new UnwindingResult instance using the specified properties.
             * @function create
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @static
             * @param {simpleperf_report_proto.Sample.IUnwindingResult=} [properties] Properties to set
             * @returns {simpleperf_report_proto.Sample.UnwindingResult} UnwindingResult instance
             */
            UnwindingResult.create = function create(properties) {
                return new UnwindingResult(properties);
            };

            /**
             * Encodes the specified UnwindingResult message. Does not implicitly {@link simpleperf_report_proto.Sample.UnwindingResult.verify|verify} messages.
             * @function encode
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @static
             * @param {simpleperf_report_proto.Sample.IUnwindingResult} message UnwindingResult message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            UnwindingResult.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.rawErrorCode != null && Object.hasOwnProperty.call(message, "rawErrorCode"))
                    writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.rawErrorCode);
                if (message.errorAddr != null && Object.hasOwnProperty.call(message, "errorAddr"))
                    writer.uint32(/* id 2, wireType 0 =*/16).uint64(message.errorAddr);
                if (message.errorCode != null && Object.hasOwnProperty.call(message, "errorCode"))
                    writer.uint32(/* id 3, wireType 0 =*/24).int32(message.errorCode);
                return writer;
            };

            /**
             * Encodes the specified UnwindingResult message, length delimited. Does not implicitly {@link simpleperf_report_proto.Sample.UnwindingResult.verify|verify} messages.
             * @function encodeDelimited
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @static
             * @param {simpleperf_report_proto.Sample.IUnwindingResult} message UnwindingResult message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            UnwindingResult.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes an UnwindingResult message from the specified reader or buffer.
             * @function decode
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {simpleperf_report_proto.Sample.UnwindingResult} UnwindingResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            UnwindingResult.decode = function decode(reader, length, error) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.simpleperf_report_proto.Sample.UnwindingResult();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    if (tag === error)
                        break;
                    switch (tag >>> 3) {
                    case 1: {
                            message.rawErrorCode = reader.uint32();
                            break;
                        }
                    case 2: {
                            message.errorAddr = reader.uint64();
                            break;
                        }
                    case 3: {
                            message.errorCode = reader.int32();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes an UnwindingResult message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {simpleperf_report_proto.Sample.UnwindingResult} UnwindingResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            UnwindingResult.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies an UnwindingResult message.
             * @function verify
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            UnwindingResult.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.rawErrorCode != null && message.hasOwnProperty("rawErrorCode"))
                    if (!$util.isInteger(message.rawErrorCode))
                        return "rawErrorCode: integer expected";
                if (message.errorAddr != null && message.hasOwnProperty("errorAddr"))
                    if (!$util.isInteger(message.errorAddr) && !(message.errorAddr && $util.isInteger(message.errorAddr.low) && $util.isInteger(message.errorAddr.high)))
                        return "errorAddr: integer|Long expected";
                if (message.errorCode != null && message.hasOwnProperty("errorCode"))
                    switch (message.errorCode) {
                    default:
                        return "errorCode: enum value expected";
                    case 0:
                    case 1:
                    case 2:
                    case 3:
                    case 4:
                    case 5:
                    case 6:
                    case 7:
                    case 8:
                        break;
                    }
                return null;
            };

            /**
             * Creates an UnwindingResult message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {simpleperf_report_proto.Sample.UnwindingResult} UnwindingResult
             */
            UnwindingResult.fromObject = function fromObject(object) {
                if (object instanceof $root.simpleperf_report_proto.Sample.UnwindingResult)
                    return object;
                var message = new $root.simpleperf_report_proto.Sample.UnwindingResult();
                if (object.rawErrorCode != null)
                    message.rawErrorCode = object.rawErrorCode >>> 0;
                if (object.errorAddr != null)
                    if ($util.Long)
                        (message.errorAddr = $util.Long.fromValue(object.errorAddr)).unsigned = true;
                    else if (typeof object.errorAddr === "string")
                        message.errorAddr = parseInt(object.errorAddr, 10);
                    else if (typeof object.errorAddr === "number")
                        message.errorAddr = object.errorAddr;
                    else if (typeof object.errorAddr === "object")
                        message.errorAddr = new $util.LongBits(object.errorAddr.low >>> 0, object.errorAddr.high >>> 0).toNumber(true);
                switch (object.errorCode) {
                default:
                    if (typeof object.errorCode === "number") {
                        message.errorCode = object.errorCode;
                        break;
                    }
                    break;
                case "ERROR_NONE":
                case 0:
                    message.errorCode = 0;
                    break;
                case "ERROR_UNKNOWN":
                case 1:
                    message.errorCode = 1;
                    break;
                case "ERROR_NOT_ENOUGH_STACK":
                case 2:
                    message.errorCode = 2;
                    break;
                case "ERROR_MEMORY_INVALID":
                case 3:
                    message.errorCode = 3;
                    break;
                case "ERROR_UNWIND_INFO":
                case 4:
                    message.errorCode = 4;
                    break;
                case "ERROR_INVALID_MAP":
                case 5:
                    message.errorCode = 5;
                    break;
                case "ERROR_MAX_FRAME_EXCEEDED":
                case 6:
                    message.errorCode = 6;
                    break;
                case "ERROR_REPEATED_FRAME":
                case 7:
                    message.errorCode = 7;
                    break;
                case "ERROR_INVALID_ELF":
                case 8:
                    message.errorCode = 8;
                    break;
                }
                return message;
            };

            /**
             * Creates a plain object from an UnwindingResult message. Also converts values to other types if specified.
             * @function toObject
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @static
             * @param {simpleperf_report_proto.Sample.UnwindingResult} message UnwindingResult
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            UnwindingResult.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    object.rawErrorCode = 0;
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, true);
                        object.errorAddr = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.errorAddr = options.longs === String ? "0" : 0;
                    object.errorCode = options.enums === String ? "ERROR_NONE" : 0;
                }
                if (message.rawErrorCode != null && message.hasOwnProperty("rawErrorCode"))
                    object.rawErrorCode = message.rawErrorCode;
                if (message.errorAddr != null && message.hasOwnProperty("errorAddr"))
                    if (typeof message.errorAddr === "number")
                        object.errorAddr = options.longs === String ? String(message.errorAddr) : message.errorAddr;
                    else
                        object.errorAddr = options.longs === String ? $util.Long.prototype.toString.call(message.errorAddr) : options.longs === Number ? new $util.LongBits(message.errorAddr.low >>> 0, message.errorAddr.high >>> 0).toNumber(true) : message.errorAddr;
                if (message.errorCode != null && message.hasOwnProperty("errorCode"))
                    object.errorCode = options.enums === String ? $root.simpleperf_report_proto.Sample.UnwindingResult.ErrorCode[message.errorCode] === undefined ? message.errorCode : $root.simpleperf_report_proto.Sample.UnwindingResult.ErrorCode[message.errorCode] : message.errorCode;
                return object;
            };

            /**
             * Converts this UnwindingResult to JSON.
             * @function toJSON
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            UnwindingResult.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for UnwindingResult
             * @function getTypeUrl
             * @memberof simpleperf_report_proto.Sample.UnwindingResult
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            UnwindingResult.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/simpleperf_report_proto.Sample.UnwindingResult";
            };

            /**
             * ErrorCode enum.
             * @name simpleperf_report_proto.Sample.UnwindingResult.ErrorCode
             * @enum {number}
             * @property {number} ERROR_NONE=0 ERROR_NONE value
             * @property {number} ERROR_UNKNOWN=1 ERROR_UNKNOWN value
             * @property {number} ERROR_NOT_ENOUGH_STACK=2 ERROR_NOT_ENOUGH_STACK value
             * @property {number} ERROR_MEMORY_INVALID=3 ERROR_MEMORY_INVALID value
             * @property {number} ERROR_UNWIND_INFO=4 ERROR_UNWIND_INFO value
             * @property {number} ERROR_INVALID_MAP=5 ERROR_INVALID_MAP value
             * @property {number} ERROR_MAX_FRAME_EXCEEDED=6 ERROR_MAX_FRAME_EXCEEDED value
             * @property {number} ERROR_REPEATED_FRAME=7 ERROR_REPEATED_FRAME value
             * @property {number} ERROR_INVALID_ELF=8 ERROR_INVALID_ELF value
             */
            UnwindingResult.ErrorCode = (function() {
                var valuesById = {}, values = Object.create(valuesById);
                values[valuesById[0] = "ERROR_NONE"] = 0;
                values[valuesById[1] = "ERROR_UNKNOWN"] = 1;
                values[valuesById[2] = "ERROR_NOT_ENOUGH_STACK"] = 2;
                values[valuesById[3] = "ERROR_MEMORY_INVALID"] = 3;
                values[valuesById[4] = "ERROR_UNWIND_INFO"] = 4;
                values[valuesById[5] = "ERROR_INVALID_MAP"] = 5;
                values[valuesById[6] = "ERROR_MAX_FRAME_EXCEEDED"] = 6;
                values[valuesById[7] = "ERROR_REPEATED_FRAME"] = 7;
                values[valuesById[8] = "ERROR_INVALID_ELF"] = 8;
                return values;
            })();

            return UnwindingResult;
        })();

        return Sample;
    })();

    simpleperf_report_proto.LostSituation = (function() {

        /**
         * Properties of a LostSituation.
         * @memberof simpleperf_report_proto
         * @interface ILostSituation
         * @property {number|Long|null} [sampleCount] LostSituation sampleCount
         * @property {number|Long|null} [lostCount] LostSituation lostCount
         */

        /**
         * Constructs a new LostSituation.
         * @memberof simpleperf_report_proto
         * @classdesc Represents a LostSituation.
         * @implements ILostSituation
         * @constructor
         * @param {simpleperf_report_proto.ILostSituation=} [properties] Properties to set
         */
        function LostSituation(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * LostSituation sampleCount.
         * @member {number|Long} sampleCount
         * @memberof simpleperf_report_proto.LostSituation
         * @instance
         */
        LostSituation.prototype.sampleCount = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * LostSituation lostCount.
         * @member {number|Long} lostCount
         * @memberof simpleperf_report_proto.LostSituation
         * @instance
         */
        LostSituation.prototype.lostCount = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * Creates a new LostSituation instance using the specified properties.
         * @function create
         * @memberof simpleperf_report_proto.LostSituation
         * @static
         * @param {simpleperf_report_proto.ILostSituation=} [properties] Properties to set
         * @returns {simpleperf_report_proto.LostSituation} LostSituation instance
         */
        LostSituation.create = function create(properties) {
            return new LostSituation(properties);
        };

        /**
         * Encodes the specified LostSituation message. Does not implicitly {@link simpleperf_report_proto.LostSituation.verify|verify} messages.
         * @function encode
         * @memberof simpleperf_report_proto.LostSituation
         * @static
         * @param {simpleperf_report_proto.ILostSituation} message LostSituation message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LostSituation.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.sampleCount != null && Object.hasOwnProperty.call(message, "sampleCount"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.sampleCount);
            if (message.lostCount != null && Object.hasOwnProperty.call(message, "lostCount"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint64(message.lostCount);
            return writer;
        };

        /**
         * Encodes the specified LostSituation message, length delimited. Does not implicitly {@link simpleperf_report_proto.LostSituation.verify|verify} messages.
         * @function encodeDelimited
         * @memberof simpleperf_report_proto.LostSituation
         * @static
         * @param {simpleperf_report_proto.ILostSituation} message LostSituation message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LostSituation.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a LostSituation message from the specified reader or buffer.
         * @function decode
         * @memberof simpleperf_report_proto.LostSituation
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {simpleperf_report_proto.LostSituation} LostSituation
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LostSituation.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.simpleperf_report_proto.LostSituation();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.sampleCount = reader.uint64();
                        break;
                    }
                case 2: {
                        message.lostCount = reader.uint64();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a LostSituation message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof simpleperf_report_proto.LostSituation
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {simpleperf_report_proto.LostSituation} LostSituation
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LostSituation.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a LostSituation message.
         * @function verify
         * @memberof simpleperf_report_proto.LostSituation
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        LostSituation.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.sampleCount != null && message.hasOwnProperty("sampleCount"))
                if (!$util.isInteger(message.sampleCount) && !(message.sampleCount && $util.isInteger(message.sampleCount.low) && $util.isInteger(message.sampleCount.high)))
                    return "sampleCount: integer|Long expected";
            if (message.lostCount != null && message.hasOwnProperty("lostCount"))
                if (!$util.isInteger(message.lostCount) && !(message.lostCount && $util.isInteger(message.lostCount.low) && $util.isInteger(message.lostCount.high)))
                    return "lostCount: integer|Long expected";
            return null;
        };

        /**
         * Creates a LostSituation message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof simpleperf_report_proto.LostSituation
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {simpleperf_report_proto.LostSituation} LostSituation
         */
        LostSituation.fromObject = function fromObject(object) {
            if (object instanceof $root.simpleperf_report_proto.LostSituation)
                return object;
            var message = new $root.simpleperf_report_proto.LostSituation();
            if (object.sampleCount != null)
                if ($util.Long)
                    (message.sampleCount = $util.Long.fromValue(object.sampleCount)).unsigned = true;
                else if (typeof object.sampleCount === "string")
                    message.sampleCount = parseInt(object.sampleCount, 10);
                else if (typeof object.sampleCount === "number")
                    message.sampleCount = object.sampleCount;
                else if (typeof object.sampleCount === "object")
                    message.sampleCount = new $util.LongBits(object.sampleCount.low >>> 0, object.sampleCount.high >>> 0).toNumber(true);
            if (object.lostCount != null)
                if ($util.Long)
                    (message.lostCount = $util.Long.fromValue(object.lostCount)).unsigned = true;
                else if (typeof object.lostCount === "string")
                    message.lostCount = parseInt(object.lostCount, 10);
                else if (typeof object.lostCount === "number")
                    message.lostCount = object.lostCount;
                else if (typeof object.lostCount === "object")
                    message.lostCount = new $util.LongBits(object.lostCount.low >>> 0, object.lostCount.high >>> 0).toNumber(true);
            return message;
        };

        /**
         * Creates a plain object from a LostSituation message. Also converts values to other types if specified.
         * @function toObject
         * @memberof simpleperf_report_proto.LostSituation
         * @static
         * @param {simpleperf_report_proto.LostSituation} message LostSituation
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        LostSituation.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.sampleCount = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.sampleCount = options.longs === String ? "0" : 0;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.lostCount = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.lostCount = options.longs === String ? "0" : 0;
            }
            if (message.sampleCount != null && message.hasOwnProperty("sampleCount"))
                if (typeof message.sampleCount === "number")
                    object.sampleCount = options.longs === String ? String(message.sampleCount) : message.sampleCount;
                else
                    object.sampleCount = options.longs === String ? $util.Long.prototype.toString.call(message.sampleCount) : options.longs === Number ? new $util.LongBits(message.sampleCount.low >>> 0, message.sampleCount.high >>> 0).toNumber(true) : message.sampleCount;
            if (message.lostCount != null && message.hasOwnProperty("lostCount"))
                if (typeof message.lostCount === "number")
                    object.lostCount = options.longs === String ? String(message.lostCount) : message.lostCount;
                else
                    object.lostCount = options.longs === String ? $util.Long.prototype.toString.call(message.lostCount) : options.longs === Number ? new $util.LongBits(message.lostCount.low >>> 0, message.lostCount.high >>> 0).toNumber(true) : message.lostCount;
            return object;
        };

        /**
         * Converts this LostSituation to JSON.
         * @function toJSON
         * @memberof simpleperf_report_proto.LostSituation
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        LostSituation.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for LostSituation
         * @function getTypeUrl
         * @memberof simpleperf_report_proto.LostSituation
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        LostSituation.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/simpleperf_report_proto.LostSituation";
        };

        return LostSituation;
    })();

    simpleperf_report_proto.File = (function() {

        /**
         * Properties of a File.
         * @memberof simpleperf_report_proto
         * @interface IFile
         * @property {number|null} [id] File id
         * @property {string|null} [path] File path
         * @property {Array.<string>|null} [symbol] File symbol
         * @property {Array.<string>|null} [mangledSymbol] File mangledSymbol
         */

        /**
         * Constructs a new File.
         * @memberof simpleperf_report_proto
         * @classdesc Represents a File.
         * @implements IFile
         * @constructor
         * @param {simpleperf_report_proto.IFile=} [properties] Properties to set
         */
        function File(properties) {
            this.symbol = [];
            this.mangledSymbol = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * File id.
         * @member {number} id
         * @memberof simpleperf_report_proto.File
         * @instance
         */
        File.prototype.id = 0;

        /**
         * File path.
         * @member {string} path
         * @memberof simpleperf_report_proto.File
         * @instance
         */
        File.prototype.path = "";

        /**
         * File symbol.
         * @member {Array.<string>} symbol
         * @memberof simpleperf_report_proto.File
         * @instance
         */
        File.prototype.symbol = $util.emptyArray;

        /**
         * File mangledSymbol.
         * @member {Array.<string>} mangledSymbol
         * @memberof simpleperf_report_proto.File
         * @instance
         */
        File.prototype.mangledSymbol = $util.emptyArray;

        /**
         * Creates a new File instance using the specified properties.
         * @function create
         * @memberof simpleperf_report_proto.File
         * @static
         * @param {simpleperf_report_proto.IFile=} [properties] Properties to set
         * @returns {simpleperf_report_proto.File} File instance
         */
        File.create = function create(properties) {
            return new File(properties);
        };

        /**
         * Encodes the specified File message. Does not implicitly {@link simpleperf_report_proto.File.verify|verify} messages.
         * @function encode
         * @memberof simpleperf_report_proto.File
         * @static
         * @param {simpleperf_report_proto.IFile} message File message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        File.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.id);
            if (message.path != null && Object.hasOwnProperty.call(message, "path"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.path);
            if (message.symbol != null && message.symbol.length)
                for (var i = 0; i < message.symbol.length; ++i)
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.symbol[i]);
            if (message.mangledSymbol != null && message.mangledSymbol.length)
                for (var i = 0; i < message.mangledSymbol.length; ++i)
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.mangledSymbol[i]);
            return writer;
        };

        /**
         * Encodes the specified File message, length delimited. Does not implicitly {@link simpleperf_report_proto.File.verify|verify} messages.
         * @function encodeDelimited
         * @memberof simpleperf_report_proto.File
         * @static
         * @param {simpleperf_report_proto.IFile} message File message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        File.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a File message from the specified reader or buffer.
         * @function decode
         * @memberof simpleperf_report_proto.File
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {simpleperf_report_proto.File} File
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        File.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.simpleperf_report_proto.File();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.id = reader.uint32();
                        break;
                    }
                case 2: {
                        message.path = reader.string();
                        break;
                    }
                case 3: {
                        if (!(message.symbol && message.symbol.length))
                            message.symbol = [];
                        message.symbol.push(reader.string());
                        break;
                    }
                case 4: {
                        if (!(message.mangledSymbol && message.mangledSymbol.length))
                            message.mangledSymbol = [];
                        message.mangledSymbol.push(reader.string());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a File message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof simpleperf_report_proto.File
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {simpleperf_report_proto.File} File
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        File.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a File message.
         * @function verify
         * @memberof simpleperf_report_proto.File
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        File.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.id != null && message.hasOwnProperty("id"))
                if (!$util.isInteger(message.id))
                    return "id: integer expected";
            if (message.path != null && message.hasOwnProperty("path"))
                if (!$util.isString(message.path))
                    return "path: string expected";
            if (message.symbol != null && message.hasOwnProperty("symbol")) {
                if (!Array.isArray(message.symbol))
                    return "symbol: array expected";
                for (var i = 0; i < message.symbol.length; ++i)
                    if (!$util.isString(message.symbol[i]))
                        return "symbol: string[] expected";
            }
            if (message.mangledSymbol != null && message.hasOwnProperty("mangledSymbol")) {
                if (!Array.isArray(message.mangledSymbol))
                    return "mangledSymbol: array expected";
                for (var i = 0; i < message.mangledSymbol.length; ++i)
                    if (!$util.isString(message.mangledSymbol[i]))
                        return "mangledSymbol: string[] expected";
            }
            return null;
        };

        /**
         * Creates a File message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof simpleperf_report_proto.File
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {simpleperf_report_proto.File} File
         */
        File.fromObject = function fromObject(object) {
            if (object instanceof $root.simpleperf_report_proto.File)
                return object;
            var message = new $root.simpleperf_report_proto.File();
            if (object.id != null)
                message.id = object.id >>> 0;
            if (object.path != null)
                message.path = String(object.path);
            if (object.symbol) {
                if (!Array.isArray(object.symbol))
                    throw TypeError(".simpleperf_report_proto.File.symbol: array expected");
                message.symbol = [];
                for (var i = 0; i < object.symbol.length; ++i)
                    message.symbol[i] = String(object.symbol[i]);
            }
            if (object.mangledSymbol) {
                if (!Array.isArray(object.mangledSymbol))
                    throw TypeError(".simpleperf_report_proto.File.mangledSymbol: array expected");
                message.mangledSymbol = [];
                for (var i = 0; i < object.mangledSymbol.length; ++i)
                    message.mangledSymbol[i] = String(object.mangledSymbol[i]);
            }
            return message;
        };

        /**
         * Creates a plain object from a File message. Also converts values to other types if specified.
         * @function toObject
         * @memberof simpleperf_report_proto.File
         * @static
         * @param {simpleperf_report_proto.File} message File
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        File.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults) {
                object.symbol = [];
                object.mangledSymbol = [];
            }
            if (options.defaults) {
                object.id = 0;
                object.path = "";
            }
            if (message.id != null && message.hasOwnProperty("id"))
                object.id = message.id;
            if (message.path != null && message.hasOwnProperty("path"))
                object.path = message.path;
            if (message.symbol && message.symbol.length) {
                object.symbol = [];
                for (var j = 0; j < message.symbol.length; ++j)
                    object.symbol[j] = message.symbol[j];
            }
            if (message.mangledSymbol && message.mangledSymbol.length) {
                object.mangledSymbol = [];
                for (var j = 0; j < message.mangledSymbol.length; ++j)
                    object.mangledSymbol[j] = message.mangledSymbol[j];
            }
            return object;
        };

        /**
         * Converts this File to JSON.
         * @function toJSON
         * @memberof simpleperf_report_proto.File
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        File.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for File
         * @function getTypeUrl
         * @memberof simpleperf_report_proto.File
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        File.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/simpleperf_report_proto.File";
        };

        return File;
    })();

    simpleperf_report_proto.Thread = (function() {

        /**
         * Properties of a Thread.
         * @memberof simpleperf_report_proto
         * @interface IThread
         * @property {number|null} [threadId] Thread threadId
         * @property {number|null} [processId] Thread processId
         * @property {string|null} [threadName] Thread threadName
         */

        /**
         * Constructs a new Thread.
         * @memberof simpleperf_report_proto
         * @classdesc Represents a Thread.
         * @implements IThread
         * @constructor
         * @param {simpleperf_report_proto.IThread=} [properties] Properties to set
         */
        function Thread(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Thread threadId.
         * @member {number} threadId
         * @memberof simpleperf_report_proto.Thread
         * @instance
         */
        Thread.prototype.threadId = 0;

        /**
         * Thread processId.
         * @member {number} processId
         * @memberof simpleperf_report_proto.Thread
         * @instance
         */
        Thread.prototype.processId = 0;

        /**
         * Thread threadName.
         * @member {string} threadName
         * @memberof simpleperf_report_proto.Thread
         * @instance
         */
        Thread.prototype.threadName = "";

        /**
         * Creates a new Thread instance using the specified properties.
         * @function create
         * @memberof simpleperf_report_proto.Thread
         * @static
         * @param {simpleperf_report_proto.IThread=} [properties] Properties to set
         * @returns {simpleperf_report_proto.Thread} Thread instance
         */
        Thread.create = function create(properties) {
            return new Thread(properties);
        };

        /**
         * Encodes the specified Thread message. Does not implicitly {@link simpleperf_report_proto.Thread.verify|verify} messages.
         * @function encode
         * @memberof simpleperf_report_proto.Thread
         * @static
         * @param {simpleperf_report_proto.IThread} message Thread message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Thread.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.threadId != null && Object.hasOwnProperty.call(message, "threadId"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.threadId);
            if (message.processId != null && Object.hasOwnProperty.call(message, "processId"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.processId);
            if (message.threadName != null && Object.hasOwnProperty.call(message, "threadName"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.threadName);
            return writer;
        };

        /**
         * Encodes the specified Thread message, length delimited. Does not implicitly {@link simpleperf_report_proto.Thread.verify|verify} messages.
         * @function encodeDelimited
         * @memberof simpleperf_report_proto.Thread
         * @static
         * @param {simpleperf_report_proto.IThread} message Thread message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Thread.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Thread message from the specified reader or buffer.
         * @function decode
         * @memberof simpleperf_report_proto.Thread
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {simpleperf_report_proto.Thread} Thread
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Thread.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.simpleperf_report_proto.Thread();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.threadId = reader.uint32();
                        break;
                    }
                case 2: {
                        message.processId = reader.uint32();
                        break;
                    }
                case 3: {
                        message.threadName = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Thread message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof simpleperf_report_proto.Thread
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {simpleperf_report_proto.Thread} Thread
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Thread.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Thread message.
         * @function verify
         * @memberof simpleperf_report_proto.Thread
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Thread.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.threadId != null && message.hasOwnProperty("threadId"))
                if (!$util.isInteger(message.threadId))
                    return "threadId: integer expected";
            if (message.processId != null && message.hasOwnProperty("processId"))
                if (!$util.isInteger(message.processId))
                    return "processId: integer expected";
            if (message.threadName != null && message.hasOwnProperty("threadName"))
                if (!$util.isString(message.threadName))
                    return "threadName: string expected";
            return null;
        };

        /**
         * Creates a Thread message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof simpleperf_report_proto.Thread
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {simpleperf_report_proto.Thread} Thread
         */
        Thread.fromObject = function fromObject(object) {
            if (object instanceof $root.simpleperf_report_proto.Thread)
                return object;
            var message = new $root.simpleperf_report_proto.Thread();
            if (object.threadId != null)
                message.threadId = object.threadId >>> 0;
            if (object.processId != null)
                message.processId = object.processId >>> 0;
            if (object.threadName != null)
                message.threadName = String(object.threadName);
            return message;
        };

        /**
         * Creates a plain object from a Thread message. Also converts values to other types if specified.
         * @function toObject
         * @memberof simpleperf_report_proto.Thread
         * @static
         * @param {simpleperf_report_proto.Thread} message Thread
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Thread.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.threadId = 0;
                object.processId = 0;
                object.threadName = "";
            }
            if (message.threadId != null && message.hasOwnProperty("threadId"))
                object.threadId = message.threadId;
            if (message.processId != null && message.hasOwnProperty("processId"))
                object.processId = message.processId;
            if (message.threadName != null && message.hasOwnProperty("threadName"))
                object.threadName = message.threadName;
            return object;
        };

        /**
         * Converts this Thread to JSON.
         * @function toJSON
         * @memberof simpleperf_report_proto.Thread
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Thread.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Thread
         * @function getTypeUrl
         * @memberof simpleperf_report_proto.Thread
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Thread.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/simpleperf_report_proto.Thread";
        };

        return Thread;
    })();

    simpleperf_report_proto.MetaInfo = (function() {

        /**
         * Properties of a MetaInfo.
         * @memberof simpleperf_report_proto
         * @interface IMetaInfo
         * @property {Array.<string>|null} [eventType] MetaInfo eventType
         * @property {string|null} [appPackageName] MetaInfo appPackageName
         * @property {string|null} [appType] MetaInfo appType
         * @property {string|null} [androidSdkVersion] MetaInfo androidSdkVersion
         * @property {string|null} [androidBuildType] MetaInfo androidBuildType
         * @property {boolean|null} [traceOffcpu] MetaInfo traceOffcpu
         */

        /**
         * Constructs a new MetaInfo.
         * @memberof simpleperf_report_proto
         * @classdesc Represents a MetaInfo.
         * @implements IMetaInfo
         * @constructor
         * @param {simpleperf_report_proto.IMetaInfo=} [properties] Properties to set
         */
        function MetaInfo(properties) {
            this.eventType = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * MetaInfo eventType.
         * @member {Array.<string>} eventType
         * @memberof simpleperf_report_proto.MetaInfo
         * @instance
         */
        MetaInfo.prototype.eventType = $util.emptyArray;

        /**
         * MetaInfo appPackageName.
         * @member {string} appPackageName
         * @memberof simpleperf_report_proto.MetaInfo
         * @instance
         */
        MetaInfo.prototype.appPackageName = "";

        /**
         * MetaInfo appType.
         * @member {string} appType
         * @memberof simpleperf_report_proto.MetaInfo
         * @instance
         */
        MetaInfo.prototype.appType = "";

        /**
         * MetaInfo androidSdkVersion.
         * @member {string} androidSdkVersion
         * @memberof simpleperf_report_proto.MetaInfo
         * @instance
         */
        MetaInfo.prototype.androidSdkVersion = "";

        /**
         * MetaInfo androidBuildType.
         * @member {string} androidBuildType
         * @memberof simpleperf_report_proto.MetaInfo
         * @instance
         */
        MetaInfo.prototype.androidBuildType = "";

        /**
         * MetaInfo traceOffcpu.
         * @member {boolean} traceOffcpu
         * @memberof simpleperf_report_proto.MetaInfo
         * @instance
         */
        MetaInfo.prototype.traceOffcpu = false;

        /**
         * Creates a new MetaInfo instance using the specified properties.
         * @function create
         * @memberof simpleperf_report_proto.MetaInfo
         * @static
         * @param {simpleperf_report_proto.IMetaInfo=} [properties] Properties to set
         * @returns {simpleperf_report_proto.MetaInfo} MetaInfo instance
         */
        MetaInfo.create = function create(properties) {
            return new MetaInfo(properties);
        };

        /**
         * Encodes the specified MetaInfo message. Does not implicitly {@link simpleperf_report_proto.MetaInfo.verify|verify} messages.
         * @function encode
         * @memberof simpleperf_report_proto.MetaInfo
         * @static
         * @param {simpleperf_report_proto.IMetaInfo} message MetaInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        MetaInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.eventType != null && message.eventType.length)
                for (var i = 0; i < message.eventType.length; ++i)
                    writer.uint32(/* id 1, wireType 2 =*/10).string(message.eventType[i]);
            if (message.appPackageName != null && Object.hasOwnProperty.call(message, "appPackageName"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.appPackageName);
            if (message.appType != null && Object.hasOwnProperty.call(message, "appType"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.appType);
            if (message.androidSdkVersion != null && Object.hasOwnProperty.call(message, "androidSdkVersion"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.androidSdkVersion);
            if (message.androidBuildType != null && Object.hasOwnProperty.call(message, "androidBuildType"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.androidBuildType);
            if (message.traceOffcpu != null && Object.hasOwnProperty.call(message, "traceOffcpu"))
                writer.uint32(/* id 6, wireType 0 =*/48).bool(message.traceOffcpu);
            return writer;
        };

        /**
         * Encodes the specified MetaInfo message, length delimited. Does not implicitly {@link simpleperf_report_proto.MetaInfo.verify|verify} messages.
         * @function encodeDelimited
         * @memberof simpleperf_report_proto.MetaInfo
         * @static
         * @param {simpleperf_report_proto.IMetaInfo} message MetaInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        MetaInfo.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a MetaInfo message from the specified reader or buffer.
         * @function decode
         * @memberof simpleperf_report_proto.MetaInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {simpleperf_report_proto.MetaInfo} MetaInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        MetaInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.simpleperf_report_proto.MetaInfo();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.eventType && message.eventType.length))
                            message.eventType = [];
                        message.eventType.push(reader.string());
                        break;
                    }
                case 2: {
                        message.appPackageName = reader.string();
                        break;
                    }
                case 3: {
                        message.appType = reader.string();
                        break;
                    }
                case 4: {
                        message.androidSdkVersion = reader.string();
                        break;
                    }
                case 5: {
                        message.androidBuildType = reader.string();
                        break;
                    }
                case 6: {
                        message.traceOffcpu = reader.bool();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a MetaInfo message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof simpleperf_report_proto.MetaInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {simpleperf_report_proto.MetaInfo} MetaInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        MetaInfo.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a MetaInfo message.
         * @function verify
         * @memberof simpleperf_report_proto.MetaInfo
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        MetaInfo.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.eventType != null && message.hasOwnProperty("eventType")) {
                if (!Array.isArray(message.eventType))
                    return "eventType: array expected";
                for (var i = 0; i < message.eventType.length; ++i)
                    if (!$util.isString(message.eventType[i]))
                        return "eventType: string[] expected";
            }
            if (message.appPackageName != null && message.hasOwnProperty("appPackageName"))
                if (!$util.isString(message.appPackageName))
                    return "appPackageName: string expected";
            if (message.appType != null && message.hasOwnProperty("appType"))
                if (!$util.isString(message.appType))
                    return "appType: string expected";
            if (message.androidSdkVersion != null && message.hasOwnProperty("androidSdkVersion"))
                if (!$util.isString(message.androidSdkVersion))
                    return "androidSdkVersion: string expected";
            if (message.androidBuildType != null && message.hasOwnProperty("androidBuildType"))
                if (!$util.isString(message.androidBuildType))
                    return "androidBuildType: string expected";
            if (message.traceOffcpu != null && message.hasOwnProperty("traceOffcpu"))
                if (typeof message.traceOffcpu !== "boolean")
                    return "traceOffcpu: boolean expected";
            return null;
        };

        /**
         * Creates a MetaInfo message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof simpleperf_report_proto.MetaInfo
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {simpleperf_report_proto.MetaInfo} MetaInfo
         */
        MetaInfo.fromObject = function fromObject(object) {
            if (object instanceof $root.simpleperf_report_proto.MetaInfo)
                return object;
            var message = new $root.simpleperf_report_proto.MetaInfo();
            if (object.eventType) {
                if (!Array.isArray(object.eventType))
                    throw TypeError(".simpleperf_report_proto.MetaInfo.eventType: array expected");
                message.eventType = [];
                for (var i = 0; i < object.eventType.length; ++i)
                    message.eventType[i] = String(object.eventType[i]);
            }
            if (object.appPackageName != null)
                message.appPackageName = String(object.appPackageName);
            if (object.appType != null)
                message.appType = String(object.appType);
            if (object.androidSdkVersion != null)
                message.androidSdkVersion = String(object.androidSdkVersion);
            if (object.androidBuildType != null)
                message.androidBuildType = String(object.androidBuildType);
            if (object.traceOffcpu != null)
                message.traceOffcpu = Boolean(object.traceOffcpu);
            return message;
        };

        /**
         * Creates a plain object from a MetaInfo message. Also converts values to other types if specified.
         * @function toObject
         * @memberof simpleperf_report_proto.MetaInfo
         * @static
         * @param {simpleperf_report_proto.MetaInfo} message MetaInfo
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        MetaInfo.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults)
                object.eventType = [];
            if (options.defaults) {
                object.appPackageName = "";
                object.appType = "";
                object.androidSdkVersion = "";
                object.androidBuildType = "";
                object.traceOffcpu = false;
            }
            if (message.eventType && message.eventType.length) {
                object.eventType = [];
                for (var j = 0; j < message.eventType.length; ++j)
                    object.eventType[j] = message.eventType[j];
            }
            if (message.appPackageName != null && message.hasOwnProperty("appPackageName"))
                object.appPackageName = message.appPackageName;
            if (message.appType != null && message.hasOwnProperty("appType"))
                object.appType = message.appType;
            if (message.androidSdkVersion != null && message.hasOwnProperty("androidSdkVersion"))
                object.androidSdkVersion = message.androidSdkVersion;
            if (message.androidBuildType != null && message.hasOwnProperty("androidBuildType"))
                object.androidBuildType = message.androidBuildType;
            if (message.traceOffcpu != null && message.hasOwnProperty("traceOffcpu"))
                object.traceOffcpu = message.traceOffcpu;
            return object;
        };

        /**
         * Converts this MetaInfo to JSON.
         * @function toJSON
         * @memberof simpleperf_report_proto.MetaInfo
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        MetaInfo.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for MetaInfo
         * @function getTypeUrl
         * @memberof simpleperf_report_proto.MetaInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        MetaInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/simpleperf_report_proto.MetaInfo";
        };

        return MetaInfo;
    })();

    simpleperf_report_proto.ContextSwitch = (function() {

        /**
         * Properties of a ContextSwitch.
         * @memberof simpleperf_report_proto
         * @interface IContextSwitch
         * @property {boolean|null} [switchOn] ContextSwitch switchOn
         * @property {number|Long|null} [time] ContextSwitch time
         * @property {number|null} [threadId] ContextSwitch threadId
         */

        /**
         * Constructs a new ContextSwitch.
         * @memberof simpleperf_report_proto
         * @classdesc Represents a ContextSwitch.
         * @implements IContextSwitch
         * @constructor
         * @param {simpleperf_report_proto.IContextSwitch=} [properties] Properties to set
         */
        function ContextSwitch(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * ContextSwitch switchOn.
         * @member {boolean} switchOn
         * @memberof simpleperf_report_proto.ContextSwitch
         * @instance
         */
        ContextSwitch.prototype.switchOn = false;

        /**
         * ContextSwitch time.
         * @member {number|Long} time
         * @memberof simpleperf_report_proto.ContextSwitch
         * @instance
         */
        ContextSwitch.prototype.time = $util.Long ? $util.Long.fromBits(0,0,true) : 0;

        /**
         * ContextSwitch threadId.
         * @member {number} threadId
         * @memberof simpleperf_report_proto.ContextSwitch
         * @instance
         */
        ContextSwitch.prototype.threadId = 0;

        /**
         * Creates a new ContextSwitch instance using the specified properties.
         * @function create
         * @memberof simpleperf_report_proto.ContextSwitch
         * @static
         * @param {simpleperf_report_proto.IContextSwitch=} [properties] Properties to set
         * @returns {simpleperf_report_proto.ContextSwitch} ContextSwitch instance
         */
        ContextSwitch.create = function create(properties) {
            return new ContextSwitch(properties);
        };

        /**
         * Encodes the specified ContextSwitch message. Does not implicitly {@link simpleperf_report_proto.ContextSwitch.verify|verify} messages.
         * @function encode
         * @memberof simpleperf_report_proto.ContextSwitch
         * @static
         * @param {simpleperf_report_proto.IContextSwitch} message ContextSwitch message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ContextSwitch.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.switchOn != null && Object.hasOwnProperty.call(message, "switchOn"))
                writer.uint32(/* id 1, wireType 0 =*/8).bool(message.switchOn);
            if (message.time != null && Object.hasOwnProperty.call(message, "time"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint64(message.time);
            if (message.threadId != null && Object.hasOwnProperty.call(message, "threadId"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.threadId);
            return writer;
        };

        /**
         * Encodes the specified ContextSwitch message, length delimited. Does not implicitly {@link simpleperf_report_proto.ContextSwitch.verify|verify} messages.
         * @function encodeDelimited
         * @memberof simpleperf_report_proto.ContextSwitch
         * @static
         * @param {simpleperf_report_proto.IContextSwitch} message ContextSwitch message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ContextSwitch.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a ContextSwitch message from the specified reader or buffer.
         * @function decode
         * @memberof simpleperf_report_proto.ContextSwitch
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {simpleperf_report_proto.ContextSwitch} ContextSwitch
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ContextSwitch.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.simpleperf_report_proto.ContextSwitch();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.switchOn = reader.bool();
                        break;
                    }
                case 2: {
                        message.time = reader.uint64();
                        break;
                    }
                case 3: {
                        message.threadId = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a ContextSwitch message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof simpleperf_report_proto.ContextSwitch
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {simpleperf_report_proto.ContextSwitch} ContextSwitch
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ContextSwitch.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a ContextSwitch message.
         * @function verify
         * @memberof simpleperf_report_proto.ContextSwitch
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        ContextSwitch.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.switchOn != null && message.hasOwnProperty("switchOn"))
                if (typeof message.switchOn !== "boolean")
                    return "switchOn: boolean expected";
            if (message.time != null && message.hasOwnProperty("time"))
                if (!$util.isInteger(message.time) && !(message.time && $util.isInteger(message.time.low) && $util.isInteger(message.time.high)))
                    return "time: integer|Long expected";
            if (message.threadId != null && message.hasOwnProperty("threadId"))
                if (!$util.isInteger(message.threadId))
                    return "threadId: integer expected";
            return null;
        };

        /**
         * Creates a ContextSwitch message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof simpleperf_report_proto.ContextSwitch
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {simpleperf_report_proto.ContextSwitch} ContextSwitch
         */
        ContextSwitch.fromObject = function fromObject(object) {
            if (object instanceof $root.simpleperf_report_proto.ContextSwitch)
                return object;
            var message = new $root.simpleperf_report_proto.ContextSwitch();
            if (object.switchOn != null)
                message.switchOn = Boolean(object.switchOn);
            if (object.time != null)
                if ($util.Long)
                    (message.time = $util.Long.fromValue(object.time)).unsigned = true;
                else if (typeof object.time === "string")
                    message.time = parseInt(object.time, 10);
                else if (typeof object.time === "number")
                    message.time = object.time;
                else if (typeof object.time === "object")
                    message.time = new $util.LongBits(object.time.low >>> 0, object.time.high >>> 0).toNumber(true);
            if (object.threadId != null)
                message.threadId = object.threadId >>> 0;
            return message;
        };

        /**
         * Creates a plain object from a ContextSwitch message. Also converts values to other types if specified.
         * @function toObject
         * @memberof simpleperf_report_proto.ContextSwitch
         * @static
         * @param {simpleperf_report_proto.ContextSwitch} message ContextSwitch
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        ContextSwitch.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                object.switchOn = false;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, true);
                    object.time = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.time = options.longs === String ? "0" : 0;
                object.threadId = 0;
            }
            if (message.switchOn != null && message.hasOwnProperty("switchOn"))
                object.switchOn = message.switchOn;
            if (message.time != null && message.hasOwnProperty("time"))
                if (typeof message.time === "number")
                    object.time = options.longs === String ? String(message.time) : message.time;
                else
                    object.time = options.longs === String ? $util.Long.prototype.toString.call(message.time) : options.longs === Number ? new $util.LongBits(message.time.low >>> 0, message.time.high >>> 0).toNumber(true) : message.time;
            if (message.threadId != null && message.hasOwnProperty("threadId"))
                object.threadId = message.threadId;
            return object;
        };

        /**
         * Converts this ContextSwitch to JSON.
         * @function toJSON
         * @memberof simpleperf_report_proto.ContextSwitch
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        ContextSwitch.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for ContextSwitch
         * @function getTypeUrl
         * @memberof simpleperf_report_proto.ContextSwitch
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        ContextSwitch.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/simpleperf_report_proto.ContextSwitch";
        };

        return ContextSwitch;
    })();

    simpleperf_report_proto.Record = (function() {

        /**
         * Properties of a Record.
         * @memberof simpleperf_report_proto
         * @interface IRecord
         * @property {simpleperf_report_proto.ISample|null} [sample] Record sample
         * @property {simpleperf_report_proto.ILostSituation|null} [lost] Record lost
         * @property {simpleperf_report_proto.IFile|null} [file] Record file
         * @property {simpleperf_report_proto.IThread|null} [thread] Record thread
         * @property {simpleperf_report_proto.IMetaInfo|null} [metaInfo] Record metaInfo
         * @property {simpleperf_report_proto.IContextSwitch|null} [contextSwitch] Record contextSwitch
         */

        /**
         * Constructs a new Record.
         * @memberof simpleperf_report_proto
         * @classdesc Represents a Record.
         * @implements IRecord
         * @constructor
         * @param {simpleperf_report_proto.IRecord=} [properties] Properties to set
         */
        function Record(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Record sample.
         * @member {simpleperf_report_proto.ISample|null|undefined} sample
         * @memberof simpleperf_report_proto.Record
         * @instance
         */
        Record.prototype.sample = null;

        /**
         * Record lost.
         * @member {simpleperf_report_proto.ILostSituation|null|undefined} lost
         * @memberof simpleperf_report_proto.Record
         * @instance
         */
        Record.prototype.lost = null;

        /**
         * Record file.
         * @member {simpleperf_report_proto.IFile|null|undefined} file
         * @memberof simpleperf_report_proto.Record
         * @instance
         */
        Record.prototype.file = null;

        /**
         * Record thread.
         * @member {simpleperf_report_proto.IThread|null|undefined} thread
         * @memberof simpleperf_report_proto.Record
         * @instance
         */
        Record.prototype.thread = null;

        /**
         * Record metaInfo.
         * @member {simpleperf_report_proto.IMetaInfo|null|undefined} metaInfo
         * @memberof simpleperf_report_proto.Record
         * @instance
         */
        Record.prototype.metaInfo = null;

        /**
         * Record contextSwitch.
         * @member {simpleperf_report_proto.IContextSwitch|null|undefined} contextSwitch
         * @memberof simpleperf_report_proto.Record
         * @instance
         */
        Record.prototype.contextSwitch = null;

        // OneOf field names bound to virtual getters and setters
        var $oneOfFields;

        /**
         * Record recordData.
         * @member {"sample"|"lost"|"file"|"thread"|"metaInfo"|"contextSwitch"|undefined} recordData
         * @memberof simpleperf_report_proto.Record
         * @instance
         */
        Object.defineProperty(Record.prototype, "recordData", {
            get: $util.oneOfGetter($oneOfFields = ["sample", "lost", "file", "thread", "metaInfo", "contextSwitch"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new Record instance using the specified properties.
         * @function create
         * @memberof simpleperf_report_proto.Record
         * @static
         * @param {simpleperf_report_proto.IRecord=} [properties] Properties to set
         * @returns {simpleperf_report_proto.Record} Record instance
         */
        Record.create = function create(properties) {
            return new Record(properties);
        };

        /**
         * Encodes the specified Record message. Does not implicitly {@link simpleperf_report_proto.Record.verify|verify} messages.
         * @function encode
         * @memberof simpleperf_report_proto.Record
         * @static
         * @param {simpleperf_report_proto.IRecord} message Record message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Record.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.sample != null && Object.hasOwnProperty.call(message, "sample"))
                $root.simpleperf_report_proto.Sample.encode(message.sample, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.lost != null && Object.hasOwnProperty.call(message, "lost"))
                $root.simpleperf_report_proto.LostSituation.encode(message.lost, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.file != null && Object.hasOwnProperty.call(message, "file"))
                $root.simpleperf_report_proto.File.encode(message.file, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            if (message.thread != null && Object.hasOwnProperty.call(message, "thread"))
                $root.simpleperf_report_proto.Thread.encode(message.thread, writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
            if (message.metaInfo != null && Object.hasOwnProperty.call(message, "metaInfo"))
                $root.simpleperf_report_proto.MetaInfo.encode(message.metaInfo, writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
            if (message.contextSwitch != null && Object.hasOwnProperty.call(message, "contextSwitch"))
                $root.simpleperf_report_proto.ContextSwitch.encode(message.contextSwitch, writer.uint32(/* id 6, wireType 2 =*/50).fork()).ldelim();
            return writer;
        };

        /**
         * Encodes the specified Record message, length delimited. Does not implicitly {@link simpleperf_report_proto.Record.verify|verify} messages.
         * @function encodeDelimited
         * @memberof simpleperf_report_proto.Record
         * @static
         * @param {simpleperf_report_proto.IRecord} message Record message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Record.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Record message from the specified reader or buffer.
         * @function decode
         * @memberof simpleperf_report_proto.Record
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {simpleperf_report_proto.Record} Record
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Record.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.simpleperf_report_proto.Record();
            while (reader.pos < end) {
                var tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.sample = $root.simpleperf_report_proto.Sample.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.lost = $root.simpleperf_report_proto.LostSituation.decode(reader, reader.uint32());
                        break;
                    }
                case 3: {
                        message.file = $root.simpleperf_report_proto.File.decode(reader, reader.uint32());
                        break;
                    }
                case 4: {
                        message.thread = $root.simpleperf_report_proto.Thread.decode(reader, reader.uint32());
                        break;
                    }
                case 5: {
                        message.metaInfo = $root.simpleperf_report_proto.MetaInfo.decode(reader, reader.uint32());
                        break;
                    }
                case 6: {
                        message.contextSwitch = $root.simpleperf_report_proto.ContextSwitch.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Record message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof simpleperf_report_proto.Record
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {simpleperf_report_proto.Record} Record
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Record.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Record message.
         * @function verify
         * @memberof simpleperf_report_proto.Record
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Record.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            var properties = {};
            if (message.sample != null && message.hasOwnProperty("sample")) {
                properties.recordData = 1;
                {
                    var error = $root.simpleperf_report_proto.Sample.verify(message.sample);
                    if (error)
                        return "sample." + error;
                }
            }
            if (message.lost != null && message.hasOwnProperty("lost")) {
                if (properties.recordData === 1)
                    return "recordData: multiple values";
                properties.recordData = 1;
                {
                    var error = $root.simpleperf_report_proto.LostSituation.verify(message.lost);
                    if (error)
                        return "lost." + error;
                }
            }
            if (message.file != null && message.hasOwnProperty("file")) {
                if (properties.recordData === 1)
                    return "recordData: multiple values";
                properties.recordData = 1;
                {
                    var error = $root.simpleperf_report_proto.File.verify(message.file);
                    if (error)
                        return "file." + error;
                }
            }
            if (message.thread != null && message.hasOwnProperty("thread")) {
                if (properties.recordData === 1)
                    return "recordData: multiple values";
                properties.recordData = 1;
                {
                    var error = $root.simpleperf_report_proto.Thread.verify(message.thread);
                    if (error)
                        return "thread." + error;
                }
            }
            if (message.metaInfo != null && message.hasOwnProperty("metaInfo")) {
                if (properties.recordData === 1)
                    return "recordData: multiple values";
                properties.recordData = 1;
                {
                    var error = $root.simpleperf_report_proto.MetaInfo.verify(message.metaInfo);
                    if (error)
                        return "metaInfo." + error;
                }
            }
            if (message.contextSwitch != null && message.hasOwnProperty("contextSwitch")) {
                if (properties.recordData === 1)
                    return "recordData: multiple values";
                properties.recordData = 1;
                {
                    var error = $root.simpleperf_report_proto.ContextSwitch.verify(message.contextSwitch);
                    if (error)
                        return "contextSwitch." + error;
                }
            }
            return null;
        };

        /**
         * Creates a Record message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof simpleperf_report_proto.Record
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {simpleperf_report_proto.Record} Record
         */
        Record.fromObject = function fromObject(object) {
            if (object instanceof $root.simpleperf_report_proto.Record)
                return object;
            var message = new $root.simpleperf_report_proto.Record();
            if (object.sample != null) {
                if (typeof object.sample !== "object")
                    throw TypeError(".simpleperf_report_proto.Record.sample: object expected");
                message.sample = $root.simpleperf_report_proto.Sample.fromObject(object.sample);
            }
            if (object.lost != null) {
                if (typeof object.lost !== "object")
                    throw TypeError(".simpleperf_report_proto.Record.lost: object expected");
                message.lost = $root.simpleperf_report_proto.LostSituation.fromObject(object.lost);
            }
            if (object.file != null) {
                if (typeof object.file !== "object")
                    throw TypeError(".simpleperf_report_proto.Record.file: object expected");
                message.file = $root.simpleperf_report_proto.File.fromObject(object.file);
            }
            if (object.thread != null) {
                if (typeof object.thread !== "object")
                    throw TypeError(".simpleperf_report_proto.Record.thread: object expected");
                message.thread = $root.simpleperf_report_proto.Thread.fromObject(object.thread);
            }
            if (object.metaInfo != null) {
                if (typeof object.metaInfo !== "object")
                    throw TypeError(".simpleperf_report_proto.Record.metaInfo: object expected");
                message.metaInfo = $root.simpleperf_report_proto.MetaInfo.fromObject(object.metaInfo);
            }
            if (object.contextSwitch != null) {
                if (typeof object.contextSwitch !== "object")
                    throw TypeError(".simpleperf_report_proto.Record.contextSwitch: object expected");
                message.contextSwitch = $root.simpleperf_report_proto.ContextSwitch.fromObject(object.contextSwitch);
            }
            return message;
        };

        /**
         * Creates a plain object from a Record message. Also converts values to other types if specified.
         * @function toObject
         * @memberof simpleperf_report_proto.Record
         * @static
         * @param {simpleperf_report_proto.Record} message Record
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Record.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (message.sample != null && message.hasOwnProperty("sample")) {
                object.sample = $root.simpleperf_report_proto.Sample.toObject(message.sample, options);
                if (options.oneofs)
                    object.recordData = "sample";
            }
            if (message.lost != null && message.hasOwnProperty("lost")) {
                object.lost = $root.simpleperf_report_proto.LostSituation.toObject(message.lost, options);
                if (options.oneofs)
                    object.recordData = "lost";
            }
            if (message.file != null && message.hasOwnProperty("file")) {
                object.file = $root.simpleperf_report_proto.File.toObject(message.file, options);
                if (options.oneofs)
                    object.recordData = "file";
            }
            if (message.thread != null && message.hasOwnProperty("thread")) {
                object.thread = $root.simpleperf_report_proto.Thread.toObject(message.thread, options);
                if (options.oneofs)
                    object.recordData = "thread";
            }
            if (message.metaInfo != null && message.hasOwnProperty("metaInfo")) {
                object.metaInfo = $root.simpleperf_report_proto.MetaInfo.toObject(message.metaInfo, options);
                if (options.oneofs)
                    object.recordData = "metaInfo";
            }
            if (message.contextSwitch != null && message.hasOwnProperty("contextSwitch")) {
                object.contextSwitch = $root.simpleperf_report_proto.ContextSwitch.toObject(message.contextSwitch, options);
                if (options.oneofs)
                    object.recordData = "contextSwitch";
            }
            return object;
        };

        /**
         * Converts this Record to JSON.
         * @function toJSON
         * @memberof simpleperf_report_proto.Record
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Record.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Record
         * @function getTypeUrl
         * @memberof simpleperf_report_proto.Record
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Record.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/simpleperf_report_proto.Record";
        };

        return Record;
    })();

    return simpleperf_report_proto;
})();

module.exports = $root;

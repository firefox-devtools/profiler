import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace simpleperf_report_proto. */
export namespace simpleperf_report_proto {

    /** Properties of a Sample. */
    interface ISample {

        /** Sample time */
        time?: (number|Long|null);

        /** Sample threadId */
        threadId?: (number|null);

        /** Sample callchain */
        callchain?: (simpleperf_report_proto.Sample.ICallChainEntry[]|null);

        /** Sample eventCount */
        eventCount?: (number|Long|null);

        /** Sample eventTypeId */
        eventTypeId?: (number|null);

        /** Sample unwindingResult */
        unwindingResult?: (simpleperf_report_proto.Sample.IUnwindingResult|null);
    }

    /** Represents a Sample. */
    class Sample implements ISample {

        /**
         * Constructs a new Sample.
         * @param [properties] Properties to set
         */
        constructor(properties?: simpleperf_report_proto.ISample);

        /** Sample time. */
        public time: (number|Long);

        /** Sample threadId. */
        public threadId: number;

        /** Sample callchain. */
        public callchain: simpleperf_report_proto.Sample.ICallChainEntry[];

        /** Sample eventCount. */
        public eventCount: (number|Long);

        /** Sample eventTypeId. */
        public eventTypeId: number;

        /** Sample unwindingResult. */
        public unwindingResult?: (simpleperf_report_proto.Sample.IUnwindingResult|null);

        /**
         * Creates a new Sample instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Sample instance
         */
        public static create(properties?: simpleperf_report_proto.ISample): simpleperf_report_proto.Sample;

        /**
         * Encodes the specified Sample message. Does not implicitly {@link simpleperf_report_proto.Sample.verify|verify} messages.
         * @param message Sample message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: simpleperf_report_proto.ISample, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Sample message, length delimited. Does not implicitly {@link simpleperf_report_proto.Sample.verify|verify} messages.
         * @param message Sample message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: simpleperf_report_proto.ISample, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Sample message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Sample
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): simpleperf_report_proto.Sample;

        /**
         * Decodes a Sample message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns Sample
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): simpleperf_report_proto.Sample;

        /**
         * Verifies a Sample message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Sample message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Sample
         */
        public static fromObject(object: { [k: string]: any }): simpleperf_report_proto.Sample;

        /**
         * Creates a plain object from a Sample message. Also converts values to other types if specified.
         * @param message Sample
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: simpleperf_report_proto.Sample, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Sample to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for Sample
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    namespace Sample {

        /** Properties of a CallChainEntry. */
        interface ICallChainEntry {

            /** CallChainEntry vaddrInFile */
            vaddrInFile?: (number|Long|null);

            /** CallChainEntry fileId */
            fileId?: (number|null);

            /** CallChainEntry symbolId */
            symbolId?: (number|null);

            /** CallChainEntry executionType */
            executionType?: (simpleperf_report_proto.Sample.CallChainEntry.ExecutionType|null);
        }

        /** Represents a CallChainEntry. */
        class CallChainEntry implements ICallChainEntry {

            /**
             * Constructs a new CallChainEntry.
             * @param [properties] Properties to set
             */
            constructor(properties?: simpleperf_report_proto.Sample.ICallChainEntry);

            /** CallChainEntry vaddrInFile. */
            public vaddrInFile: (number|Long);

            /** CallChainEntry fileId. */
            public fileId: number;

            /** CallChainEntry symbolId. */
            public symbolId: number;

            /** CallChainEntry executionType. */
            public executionType: simpleperf_report_proto.Sample.CallChainEntry.ExecutionType;

            /**
             * Creates a new CallChainEntry instance using the specified properties.
             * @param [properties] Properties to set
             * @returns CallChainEntry instance
             */
            public static create(properties?: simpleperf_report_proto.Sample.ICallChainEntry): simpleperf_report_proto.Sample.CallChainEntry;

            /**
             * Encodes the specified CallChainEntry message. Does not implicitly {@link simpleperf_report_proto.Sample.CallChainEntry.verify|verify} messages.
             * @param message CallChainEntry message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: simpleperf_report_proto.Sample.ICallChainEntry, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified CallChainEntry message, length delimited. Does not implicitly {@link simpleperf_report_proto.Sample.CallChainEntry.verify|verify} messages.
             * @param message CallChainEntry message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: simpleperf_report_proto.Sample.ICallChainEntry, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes a CallChainEntry message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns CallChainEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): simpleperf_report_proto.Sample.CallChainEntry;

            /**
             * Decodes a CallChainEntry message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns CallChainEntry
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): simpleperf_report_proto.Sample.CallChainEntry;

            /**
             * Verifies a CallChainEntry message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates a CallChainEntry message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns CallChainEntry
             */
            public static fromObject(object: { [k: string]: any }): simpleperf_report_proto.Sample.CallChainEntry;

            /**
             * Creates a plain object from a CallChainEntry message. Also converts values to other types if specified.
             * @param message CallChainEntry
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: simpleperf_report_proto.Sample.CallChainEntry, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this CallChainEntry to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for CallChainEntry
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        namespace CallChainEntry {

            /** ExecutionType enum. */
            enum ExecutionType {
                NATIVE_METHOD = 0,
                INTERPRETED_JVM_METHOD = 1,
                JIT_JVM_METHOD = 2,
                ART_METHOD = 3
            }
        }

        /** Properties of an UnwindingResult. */
        interface IUnwindingResult {

            /** UnwindingResult rawErrorCode */
            rawErrorCode?: (number|null);

            /** UnwindingResult errorAddr */
            errorAddr?: (number|Long|null);

            /** UnwindingResult errorCode */
            errorCode?: (simpleperf_report_proto.Sample.UnwindingResult.ErrorCode|null);
        }

        /** Represents an UnwindingResult. */
        class UnwindingResult implements IUnwindingResult {

            /**
             * Constructs a new UnwindingResult.
             * @param [properties] Properties to set
             */
            constructor(properties?: simpleperf_report_proto.Sample.IUnwindingResult);

            /** UnwindingResult rawErrorCode. */
            public rawErrorCode: number;

            /** UnwindingResult errorAddr. */
            public errorAddr: (number|Long);

            /** UnwindingResult errorCode. */
            public errorCode: simpleperf_report_proto.Sample.UnwindingResult.ErrorCode;

            /**
             * Creates a new UnwindingResult instance using the specified properties.
             * @param [properties] Properties to set
             * @returns UnwindingResult instance
             */
            public static create(properties?: simpleperf_report_proto.Sample.IUnwindingResult): simpleperf_report_proto.Sample.UnwindingResult;

            /**
             * Encodes the specified UnwindingResult message. Does not implicitly {@link simpleperf_report_proto.Sample.UnwindingResult.verify|verify} messages.
             * @param message UnwindingResult message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encode(message: simpleperf_report_proto.Sample.IUnwindingResult, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Encodes the specified UnwindingResult message, length delimited. Does not implicitly {@link simpleperf_report_proto.Sample.UnwindingResult.verify|verify} messages.
             * @param message UnwindingResult message or plain object to encode
             * @param [writer] Writer to encode to
             * @returns Writer
             */
            public static encodeDelimited(message: simpleperf_report_proto.Sample.IUnwindingResult, writer?: $protobuf.Writer): $protobuf.Writer;

            /**
             * Decodes an UnwindingResult message from the specified reader or buffer.
             * @param reader Reader or buffer to decode from
             * @param [length] Message length if known beforehand
             * @returns UnwindingResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): simpleperf_report_proto.Sample.UnwindingResult;

            /**
             * Decodes an UnwindingResult message from the specified reader or buffer, length delimited.
             * @param reader Reader or buffer to decode from
             * @returns UnwindingResult
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): simpleperf_report_proto.Sample.UnwindingResult;

            /**
             * Verifies an UnwindingResult message.
             * @param message Plain object to verify
             * @returns `null` if valid, otherwise the reason why it is not
             */
            public static verify(message: { [k: string]: any }): (string|null);

            /**
             * Creates an UnwindingResult message from a plain object. Also converts values to their respective internal types.
             * @param object Plain object
             * @returns UnwindingResult
             */
            public static fromObject(object: { [k: string]: any }): simpleperf_report_proto.Sample.UnwindingResult;

            /**
             * Creates a plain object from an UnwindingResult message. Also converts values to other types if specified.
             * @param message UnwindingResult
             * @param [options] Conversion options
             * @returns Plain object
             */
            public static toObject(message: simpleperf_report_proto.Sample.UnwindingResult, options?: $protobuf.IConversionOptions): { [k: string]: any };

            /**
             * Converts this UnwindingResult to JSON.
             * @returns JSON object
             */
            public toJSON(): { [k: string]: any };

            /**
             * Gets the default type url for UnwindingResult
             * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns The default type url
             */
            public static getTypeUrl(typeUrlPrefix?: string): string;
        }

        namespace UnwindingResult {

            /** ErrorCode enum. */
            enum ErrorCode {
                ERROR_NONE = 0,
                ERROR_UNKNOWN = 1,
                ERROR_NOT_ENOUGH_STACK = 2,
                ERROR_MEMORY_INVALID = 3,
                ERROR_UNWIND_INFO = 4,
                ERROR_INVALID_MAP = 5,
                ERROR_MAX_FRAME_EXCEEDED = 6,
                ERROR_REPEATED_FRAME = 7,
                ERROR_INVALID_ELF = 8
            }
        }
    }

    /** Properties of a LostSituation. */
    interface ILostSituation {

        /** LostSituation sampleCount */
        sampleCount?: (number|Long|null);

        /** LostSituation lostCount */
        lostCount?: (number|Long|null);
    }

    /** Represents a LostSituation. */
    class LostSituation implements ILostSituation {

        /**
         * Constructs a new LostSituation.
         * @param [properties] Properties to set
         */
        constructor(properties?: simpleperf_report_proto.ILostSituation);

        /** LostSituation sampleCount. */
        public sampleCount: (number|Long);

        /** LostSituation lostCount. */
        public lostCount: (number|Long);

        /**
         * Creates a new LostSituation instance using the specified properties.
         * @param [properties] Properties to set
         * @returns LostSituation instance
         */
        public static create(properties?: simpleperf_report_proto.ILostSituation): simpleperf_report_proto.LostSituation;

        /**
         * Encodes the specified LostSituation message. Does not implicitly {@link simpleperf_report_proto.LostSituation.verify|verify} messages.
         * @param message LostSituation message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: simpleperf_report_proto.ILostSituation, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified LostSituation message, length delimited. Does not implicitly {@link simpleperf_report_proto.LostSituation.verify|verify} messages.
         * @param message LostSituation message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: simpleperf_report_proto.ILostSituation, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a LostSituation message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns LostSituation
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): simpleperf_report_proto.LostSituation;

        /**
         * Decodes a LostSituation message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns LostSituation
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): simpleperf_report_proto.LostSituation;

        /**
         * Verifies a LostSituation message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a LostSituation message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns LostSituation
         */
        public static fromObject(object: { [k: string]: any }): simpleperf_report_proto.LostSituation;

        /**
         * Creates a plain object from a LostSituation message. Also converts values to other types if specified.
         * @param message LostSituation
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: simpleperf_report_proto.LostSituation, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this LostSituation to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for LostSituation
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a File. */
    interface IFile {

        /** File id */
        id?: (number|null);

        /** File path */
        path?: (string|null);

        /** File symbol */
        symbol?: (string[]|null);

        /** File mangledSymbol */
        mangledSymbol?: (string[]|null);
    }

    /** Represents a File. */
    class File implements IFile {

        /**
         * Constructs a new File.
         * @param [properties] Properties to set
         */
        constructor(properties?: simpleperf_report_proto.IFile);

        /** File id. */
        public id: number;

        /** File path. */
        public path: string;

        /** File symbol. */
        public symbol: string[];

        /** File mangledSymbol. */
        public mangledSymbol: string[];

        /**
         * Creates a new File instance using the specified properties.
         * @param [properties] Properties to set
         * @returns File instance
         */
        public static create(properties?: simpleperf_report_proto.IFile): simpleperf_report_proto.File;

        /**
         * Encodes the specified File message. Does not implicitly {@link simpleperf_report_proto.File.verify|verify} messages.
         * @param message File message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: simpleperf_report_proto.IFile, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified File message, length delimited. Does not implicitly {@link simpleperf_report_proto.File.verify|verify} messages.
         * @param message File message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: simpleperf_report_proto.IFile, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a File message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns File
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): simpleperf_report_proto.File;

        /**
         * Decodes a File message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns File
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): simpleperf_report_proto.File;

        /**
         * Verifies a File message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a File message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns File
         */
        public static fromObject(object: { [k: string]: any }): simpleperf_report_proto.File;

        /**
         * Creates a plain object from a File message. Also converts values to other types if specified.
         * @param message File
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: simpleperf_report_proto.File, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this File to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for File
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a Thread. */
    interface IThread {

        /** Thread threadId */
        threadId?: (number|null);

        /** Thread processId */
        processId?: (number|null);

        /** Thread threadName */
        threadName?: (string|null);
    }

    /** Represents a Thread. */
    class Thread implements IThread {

        /**
         * Constructs a new Thread.
         * @param [properties] Properties to set
         */
        constructor(properties?: simpleperf_report_proto.IThread);

        /** Thread threadId. */
        public threadId: number;

        /** Thread processId. */
        public processId: number;

        /** Thread threadName. */
        public threadName: string;

        /**
         * Creates a new Thread instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Thread instance
         */
        public static create(properties?: simpleperf_report_proto.IThread): simpleperf_report_proto.Thread;

        /**
         * Encodes the specified Thread message. Does not implicitly {@link simpleperf_report_proto.Thread.verify|verify} messages.
         * @param message Thread message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: simpleperf_report_proto.IThread, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Thread message, length delimited. Does not implicitly {@link simpleperf_report_proto.Thread.verify|verify} messages.
         * @param message Thread message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: simpleperf_report_proto.IThread, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Thread message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Thread
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): simpleperf_report_proto.Thread;

        /**
         * Decodes a Thread message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns Thread
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): simpleperf_report_proto.Thread;

        /**
         * Verifies a Thread message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Thread message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Thread
         */
        public static fromObject(object: { [k: string]: any }): simpleperf_report_proto.Thread;

        /**
         * Creates a plain object from a Thread message. Also converts values to other types if specified.
         * @param message Thread
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: simpleperf_report_proto.Thread, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Thread to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for Thread
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a MetaInfo. */
    interface IMetaInfo {

        /** MetaInfo eventType */
        eventType?: (string[]|null);

        /** MetaInfo appPackageName */
        appPackageName?: (string|null);

        /** MetaInfo appType */
        appType?: (string|null);

        /** MetaInfo androidSdkVersion */
        androidSdkVersion?: (string|null);

        /** MetaInfo androidBuildType */
        androidBuildType?: (string|null);

        /** MetaInfo traceOffcpu */
        traceOffcpu?: (boolean|null);
    }

    /** Represents a MetaInfo. */
    class MetaInfo implements IMetaInfo {

        /**
         * Constructs a new MetaInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: simpleperf_report_proto.IMetaInfo);

        /** MetaInfo eventType. */
        public eventType: string[];

        /** MetaInfo appPackageName. */
        public appPackageName: string;

        /** MetaInfo appType. */
        public appType: string;

        /** MetaInfo androidSdkVersion. */
        public androidSdkVersion: string;

        /** MetaInfo androidBuildType. */
        public androidBuildType: string;

        /** MetaInfo traceOffcpu. */
        public traceOffcpu: boolean;

        /**
         * Creates a new MetaInfo instance using the specified properties.
         * @param [properties] Properties to set
         * @returns MetaInfo instance
         */
        public static create(properties?: simpleperf_report_proto.IMetaInfo): simpleperf_report_proto.MetaInfo;

        /**
         * Encodes the specified MetaInfo message. Does not implicitly {@link simpleperf_report_proto.MetaInfo.verify|verify} messages.
         * @param message MetaInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: simpleperf_report_proto.IMetaInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified MetaInfo message, length delimited. Does not implicitly {@link simpleperf_report_proto.MetaInfo.verify|verify} messages.
         * @param message MetaInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: simpleperf_report_proto.IMetaInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a MetaInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns MetaInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): simpleperf_report_proto.MetaInfo;

        /**
         * Decodes a MetaInfo message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns MetaInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): simpleperf_report_proto.MetaInfo;

        /**
         * Verifies a MetaInfo message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a MetaInfo message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns MetaInfo
         */
        public static fromObject(object: { [k: string]: any }): simpleperf_report_proto.MetaInfo;

        /**
         * Creates a plain object from a MetaInfo message. Also converts values to other types if specified.
         * @param message MetaInfo
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: simpleperf_report_proto.MetaInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this MetaInfo to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for MetaInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a ContextSwitch. */
    interface IContextSwitch {

        /** ContextSwitch switchOn */
        switchOn?: (boolean|null);

        /** ContextSwitch time */
        time?: (number|Long|null);

        /** ContextSwitch threadId */
        threadId?: (number|null);
    }

    /** Represents a ContextSwitch. */
    class ContextSwitch implements IContextSwitch {

        /**
         * Constructs a new ContextSwitch.
         * @param [properties] Properties to set
         */
        constructor(properties?: simpleperf_report_proto.IContextSwitch);

        /** ContextSwitch switchOn. */
        public switchOn: boolean;

        /** ContextSwitch time. */
        public time: (number|Long);

        /** ContextSwitch threadId. */
        public threadId: number;

        /**
         * Creates a new ContextSwitch instance using the specified properties.
         * @param [properties] Properties to set
         * @returns ContextSwitch instance
         */
        public static create(properties?: simpleperf_report_proto.IContextSwitch): simpleperf_report_proto.ContextSwitch;

        /**
         * Encodes the specified ContextSwitch message. Does not implicitly {@link simpleperf_report_proto.ContextSwitch.verify|verify} messages.
         * @param message ContextSwitch message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: simpleperf_report_proto.IContextSwitch, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified ContextSwitch message, length delimited. Does not implicitly {@link simpleperf_report_proto.ContextSwitch.verify|verify} messages.
         * @param message ContextSwitch message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: simpleperf_report_proto.IContextSwitch, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ContextSwitch message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns ContextSwitch
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): simpleperf_report_proto.ContextSwitch;

        /**
         * Decodes a ContextSwitch message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns ContextSwitch
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): simpleperf_report_proto.ContextSwitch;

        /**
         * Verifies a ContextSwitch message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a ContextSwitch message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns ContextSwitch
         */
        public static fromObject(object: { [k: string]: any }): simpleperf_report_proto.ContextSwitch;

        /**
         * Creates a plain object from a ContextSwitch message. Also converts values to other types if specified.
         * @param message ContextSwitch
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: simpleperf_report_proto.ContextSwitch, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this ContextSwitch to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for ContextSwitch
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a Record. */
    interface IRecord {

        /** Record sample */
        sample?: (simpleperf_report_proto.ISample|null);

        /** Record lost */
        lost?: (simpleperf_report_proto.ILostSituation|null);

        /** Record file */
        file?: (simpleperf_report_proto.IFile|null);

        /** Record thread */
        thread?: (simpleperf_report_proto.IThread|null);

        /** Record metaInfo */
        metaInfo?: (simpleperf_report_proto.IMetaInfo|null);

        /** Record contextSwitch */
        contextSwitch?: (simpleperf_report_proto.IContextSwitch|null);
    }

    /** Represents a Record. */
    class Record implements IRecord {

        /**
         * Constructs a new Record.
         * @param [properties] Properties to set
         */
        constructor(properties?: simpleperf_report_proto.IRecord);

        /** Record sample. */
        public sample?: (simpleperf_report_proto.ISample|null);

        /** Record lost. */
        public lost?: (simpleperf_report_proto.ILostSituation|null);

        /** Record file. */
        public file?: (simpleperf_report_proto.IFile|null);

        /** Record thread. */
        public thread?: (simpleperf_report_proto.IThread|null);

        /** Record metaInfo. */
        public metaInfo?: (simpleperf_report_proto.IMetaInfo|null);

        /** Record contextSwitch. */
        public contextSwitch?: (simpleperf_report_proto.IContextSwitch|null);

        /** Record recordData. */
        public recordData?: ("sample"|"lost"|"file"|"thread"|"metaInfo"|"contextSwitch");

        /**
         * Creates a new Record instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Record instance
         */
        public static create(properties?: simpleperf_report_proto.IRecord): simpleperf_report_proto.Record;

        /**
         * Encodes the specified Record message. Does not implicitly {@link simpleperf_report_proto.Record.verify|verify} messages.
         * @param message Record message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: simpleperf_report_proto.IRecord, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Record message, length delimited. Does not implicitly {@link simpleperf_report_proto.Record.verify|verify} messages.
         * @param message Record message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: simpleperf_report_proto.IRecord, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Record message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Record
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): simpleperf_report_proto.Record;

        /**
         * Decodes a Record message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns Record
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): simpleperf_report_proto.Record;

        /**
         * Verifies a Record message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Record message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Record
         */
        public static fromObject(object: { [k: string]: any }): simpleperf_report_proto.Record;

        /**
         * Creates a plain object from a Record message. Also converts values to other types if specified.
         * @param message Record
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: simpleperf_report_proto.Record, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Record to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for Record
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}

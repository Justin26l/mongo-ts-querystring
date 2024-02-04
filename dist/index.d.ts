type CustomFunction = (query: any, value: any) => void;
export interface Options {
    ops?: string[];
    alias?: Record<string, string>;
    blacklist?: Record<string, boolean>;
    whitelist?: Record<string, boolean>;
    custom?: Record<string, string>;
    string?: {
        toBoolean?: boolean;
        toNumber?: boolean;
    };
    keyRegex?: RegExp;
    valRegex?: RegExp;
    arrRegex?: RegExp;
}
export default class MongoQS {
    ops: string[];
    alias: Record<string, string>;
    blacklist: Record<string, boolean>;
    whitelist: Record<string, boolean>;
    custom: Record<string, CustomFunction>;
    string: {
        toBoolean: boolean;
        toNumber: boolean;
    };
    keyRegex: RegExp;
    valRegex: RegExp;
    arrRegex: RegExp;
    constructor(options?: Options);
    customBBOX: (field: string) => CustomFunction;
    customNear: (field: string) => CustomFunction;
    parseDate(value: string): Date;
    customAfter: (field: string) => (query: any, value: any) => void;
    customBefore: (field: string) => (query: any, value: any) => void;
    customBetween: (field: string) => (query: any, value: any) => void;
    parseString: (string: string, array?: boolean) => {
        [key: string]: any;
    };
    parseStringVal: (string: string) => string | number | boolean;
    parse: (query: any) => {
        [key: string]: any;
    };
}
export {};

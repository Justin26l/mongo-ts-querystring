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

class MongoQS {
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

    constructor(options: Options = {}) {
        this.ops = options.ops || ['!', '^', '$', '~', '>', '<', '$in'];
        this.alias = options.alias || {};
        this.blacklist = options.blacklist || {};
        this.whitelist = options.whitelist || {};
        this.custom = {};

        options.string = options.string || {};
        this.string = {
            toBoolean: options.string.toBoolean !== undefined ? options.string.toBoolean : true,
            toNumber: options.string.toNumber !== undefined ? options.string.toNumber : true,
        };

        this.keyRegex = options.keyRegex || /^[a-zæøå0-9-_.]+$/i;
        this.valRegex = options.valRegex || /[^a-zæøå0-9-_.* ]/i;
        this.arrRegex = options.arrRegex || /^[a-zæøå0-9-_.]+(\[])?$/i;

        if (options.custom?.bbox) {
            this.custom.bbox = this.customBBOX(options.custom.bbox);
        }

        if (options.custom?.near) {
            this.custom.near = this.customNear(options.custom.near);
        }

        if (options.custom?.after) {
            this.custom.after = this.customAfter(options.custom.after);
        }

        if (options.custom?.before) {
            this.custom.before = this.customBefore(options.custom.before);
        }

        if (options.custom?.between) {
            this.custom.between = this.customBetween(options.custom.between);
        }
    }

    customBBOX = (field: string) :CustomFunction => (query:any, bbox:any) => {
        const bboxArr = bbox.split(',');

        if (bboxArr.length === 4) {
            // Optimize by unrolling the loop
            bboxArr[0] = parseFloat(bboxArr[0]);
            bboxArr[1] = parseFloat(bboxArr[1]);
            bboxArr[2] = parseFloat(bboxArr[2]);
            bboxArr[3] = parseFloat(bboxArr[3]);

            if (!isNaN(bboxArr.reduce((a: any, b: any) => a + b))) {
                query[field] = {
                    $geoWithin: {
                        $geometry: {
                            type: 'Polygon',
                            coordinates: [[
                                [bboxArr[0], bboxArr[1]],
                                [bboxArr[2], bboxArr[1]],
                                [bboxArr[2], bboxArr[3]],
                                [bboxArr[0], bboxArr[3]],
                                [bboxArr[0], bboxArr[1]],
                            ]],
                        },
                    },
                };
            }
        }
    };

    customNear = (field: string) :CustomFunction => (query:any, point:any) => {
        const pointArr = point.split(',').map((p: any) => parseFloat(p));

        if (pointArr.length >= 2) {
            if (!isNaN(pointArr.reduce((a: any, b: any) => a + b))) {
                const max = pointArr[2];
                const min = pointArr[3];

                query[field] = {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: pointArr.splice(0, 2),
                        },
                    },
                };

                if (!isNaN(max)) {
                    query[field].$near.$maxDistance = max;

                    if (!isNaN(min)) {
                        query[field].$near.$minDistance = min;
                    }
                }
            }
        }
    };

    parseDate(value: string) {
        let val: number = 0;
        if (!isNaN(parseInt(value))) {
            if (value.length === 10) {
                val = parseInt(value) * 1000;
            }
            else {
                val = parseInt(value);
            }
        }

        return new Date(val);
    }


    customAfter = (field: string) => (query:any, value:any) => {
        const date = this.parseDate(value);

        if (date.toString() !== 'Invalid Date') {
            query[field] = {
                $gte: date.toISOString(),
            };
        }
    };

    customBefore = (field: string) => (query:any, value:any) => {
        const date = this.parseDate(value);

        if (date.toString() !== 'Invalid Date') {
            query[field] = {
                $lt: date.toISOString(),
            };
        }
    };

    customBetween = (field: string) => (query:any, value:any) => {
        const dates = value.split('|');
        const afterValue = dates[0];
        const beforeValue = dates[1];

        const after = this.parseDate(afterValue);
        const before = this.parseDate(beforeValue);

        if (after.toString() !== 'Invalid Date' && before.toString() !== 'Invalid Date') {
            query[field] = {
                $gte: after.toISOString(),
                $lt: before.toISOString(),
            };
        }
    };

    parseString = (string: string, array?: boolean) => {
        let op: string = string[0] || '';
        const eq: boolean = string[1] === '=';
        let org: string = string.substr(eq ? 2 : 1) || '';
        const val = this.parseStringVal(org);

        const ret: { [key: string]: any } = { op, org, value: val };

        switch (op) {
            case '!':
                if (array) {
                    ret.field = '$nin';
                } else if (org === '') {
                    ret.field = '$exists';
                    ret.value = false;
                } else {
                    ret.field = '$ne';
                }
                break;
            case '>':
                ret.field = eq ? '$gte' : '$gt';
                break;
            case '<':
                ret.field = eq ? '$lte' : '$lt';
                break;
            case '^':
            case '$':
            case '~':
                ret.field = '$regex';
                ret.options = 'i';
                ret.value = org.replace(this.valRegex, '');

                switch (op) {
                    case '^':
                        ret.value = `^${val}`;
                        break;
                    case '$':
                        ret.value = `${val}$`;
                        break;
                    default:
                        break;
                }
                break;
            default:
                ret.org = org = op + org;
                ret.op = op = '';
                ret.value = this.parseStringVal(org);

                if (array) {
                    ret.field = '$in';
                } else if (org === '') {
                    ret.field = '$exists';
                    ret.value = true;
                } else {
                    ret.field = '$eq';
                }
        }

        ret.parsed = {};
        ret.parsed[ret.field] = ret.value;

        if (ret.options) {
            ret.parsed.$options = ret.options;
        }

        return ret;
    };

    parseStringVal = (string: string) => {
        if (this.string.toBoolean && string.toLowerCase() === 'true') {
            return true;
        } else if (this.string.toBoolean && string.toLowerCase() === 'false') {
            return false;
        } else if (this.string.toNumber && !isNaN(parseInt(string, 10)) &&
            ((+string - +string) + 1) >= 0) {
            return parseFloat(string);
        }

        return string;
    };

    parse = (query: any) => {
        const res: { [key: string]: any } = {};

        Object.keys(query).forEach((k) => {
            let key = k;
            const val = query[key];

            // normalize array keys
            if (val instanceof Array) {
                key = key.replace(/\[]$/, '');
            }

            // whitelist
            if (Object.keys(this.whitelist).length && !this.whitelist[key]) {
                return;
            }

            // blacklist
            if (this.blacklist[key]) {
                return;
            }

            // alias
            if (this.alias[key]) {
                key = this.alias[key];
            }

            // string key
            if (typeof val === 'string' && !this.keyRegex.test(key)) {
                return;

                // array key
            } else if (val instanceof Array && !this.arrRegex.test(key)) {
                return;
            }

            // custom functions
            if (typeof this.custom[key] === 'function') {
                this.custom[key].apply(null, [res, val]);
                return;
            }

            // array key
            if (val instanceof Array) {
                if (this.ops.indexOf('$in') >= 0 && val.length > 0) {
                    res[key] = {};

                    for (let i = 0; i < val.length; i += 1) {
                        if (this.ops.indexOf(val[i][0]) >= 0) {
                            const parsed = this.parseString(val[i], true);

                            switch (parsed.field) {
                                case '$in':
                                case '$nin':
                                    res[key][parsed.field] = res[key][parsed.field] || [];
                                    res[key][parsed.field].push(parsed.value);
                                    break;
                                case '$regex':
                                    res[key].$regex = parsed.value;
                                    res[key].$options = parsed.options;
                                    break;
                                default:
                                    res[key][parsed.field] = parsed.value;
                            }
                        } else {
                            res[key].$in = res[key].$in || [];
                            res[key].$in.push(this.parseStringVal(val[i]));
                        }
                    }
                }

                return;
            }

            // value must be a string
            if (typeof val !== 'string') {
                return;
            }

            // field exists query
            if (!val) {
                res[key] = { $exists: true };

                // query operators
            } else if (this.ops.indexOf(val[0]) >= 0) {
                res[key] = this.parseString(val).parsed;

                // equal operator (no operator)
            } else {
                res[key] = this.parseStringVal(val);
            }
        });

        return res;
    };
}

export default MongoQS;
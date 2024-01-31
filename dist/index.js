"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class MongoQS {
    constructor(options = {}) {
        var _a, _b, _c, _d, _e;
        this.customBBOX = (field) => (query, bbox) => {
            const bboxArr = bbox.split(',');
            if (bboxArr.length === 4) {
                bboxArr[0] = parseFloat(bboxArr[0]);
                bboxArr[1] = parseFloat(bboxArr[1]);
                bboxArr[2] = parseFloat(bboxArr[2]);
                bboxArr[3] = parseFloat(bboxArr[3]);
                if (!isNaN(bboxArr.reduce((a, b) => a + b))) {
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
        this.customNear = (field) => (query, point) => {
            const pointArr = point.split(',').map((p) => parseFloat(p));
            if (pointArr.length >= 2) {
                if (!isNaN(pointArr.reduce((a, b) => a + b))) {
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
        this.customAfter = (field) => (query, value) => {
            const date = this.parseDate(value);
            if (date.toString() !== 'Invalid Date') {
                query[field] = {
                    $gte: date.toISOString(),
                };
            }
        };
        this.customBefore = (field) => (query, value) => {
            const date = this.parseDate(value);
            if (date.toString() !== 'Invalid Date') {
                query[field] = {
                    $lt: date.toISOString(),
                };
            }
        };
        this.customBetween = (field) => (query, value) => {
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
        this.parseString = (string, array) => {
            let op = string[0] || '';
            const eq = string[1] === '=';
            let org = string.substr(eq ? 2 : 1) || '';
            const val = this.parseStringVal(org);
            const ret = { op, org, value: val };
            switch (op) {
                case '!':
                    if (array) {
                        ret.field = '$nin';
                    }
                    else if (org === '') {
                        ret.field = '$exists';
                        ret.value = false;
                    }
                    else {
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
                    }
                    else if (org === '') {
                        ret.field = '$exists';
                        ret.value = true;
                    }
                    else {
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
        this.parseStringVal = (string) => {
            if (this.string.toBoolean && string.toLowerCase() === 'true') {
                return true;
            }
            else if (this.string.toBoolean && string.toLowerCase() === 'false') {
                return false;
            }
            else if (this.string.toNumber && !isNaN(parseInt(string, 10)) &&
                ((+string - +string) + 1) >= 0) {
                return parseFloat(string);
            }
            return string;
        };
        this.parse = (query) => {
            const res = {};
            Object.keys(query).forEach((k) => {
                let key = k;
                const val = query[key];
                if (val instanceof Array) {
                    key = key.replace(/\[]$/, '');
                }
                if (Object.keys(this.whitelist).length && !this.whitelist[key]) {
                    return;
                }
                if (this.blacklist[key]) {
                    return;
                }
                if (this.alias[key]) {
                    key = this.alias[key];
                }
                if (typeof val === 'string' && !this.keyRegex.test(key)) {
                    return;
                }
                else if (val instanceof Array && !this.arrRegex.test(key)) {
                    return;
                }
                if (typeof this.custom[key] === 'function') {
                    this.custom[key].apply(null, [res, val]);
                    return;
                }
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
                            }
                            else {
                                res[key].$in = res[key].$in || [];
                                res[key].$in.push(this.parseStringVal(val[i]));
                            }
                        }
                    }
                    return;
                }
                if (typeof val !== 'string') {
                    return;
                }
                if (!val) {
                    res[key] = { $exists: true };
                }
                else if (this.ops.indexOf(val[0]) >= 0) {
                    res[key] = this.parseString(val).parsed;
                }
                else {
                    res[key] = this.parseStringVal(val);
                }
            });
            return res;
        };
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
        if ((_a = options.custom) === null || _a === void 0 ? void 0 : _a.bbox) {
            this.custom.bbox = this.customBBOX(options.custom.bbox);
        }
        if ((_b = options.custom) === null || _b === void 0 ? void 0 : _b.near) {
            this.custom.near = this.customNear(options.custom.near);
        }
        if ((_c = options.custom) === null || _c === void 0 ? void 0 : _c.after) {
            this.custom.after = this.customAfter(options.custom.after);
        }
        if ((_d = options.custom) === null || _d === void 0 ? void 0 : _d.before) {
            this.custom.before = this.customBefore(options.custom.before);
        }
        if ((_e = options.custom) === null || _e === void 0 ? void 0 : _e.between) {
            this.custom.between = this.customBetween(options.custom.between);
        }
    }
    parseDate(value) {
        let val = 0;
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
}
exports.default = MongoQS;

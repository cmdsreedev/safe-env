"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = exports.EnvError = void 0;
exports.string = string;
exports.number = number;
exports.boolean = boolean;
exports.oneOf = oneOf;
exports.url = url;
exports.json = json;
exports.custom = custom;
exports.loadEnv = loadEnv;
exports.formatEnvIssues = formatEnvIssues;
class EnvError extends Error {
    issues;
    constructor(issues) {
        super(formatEnvIssues(issues));
        this.name = 'EnvError';
        this.issues = issues;
    }
}
exports.EnvError = EnvError;
class EnvParseFailure extends Error {
    issue;
    constructor(issue) {
        super(issue.message);
        this.issue = issue;
    }
}
function createContext(name, raw) {
    return {
        name,
        fail(code, message) {
            throw new EnvParseFailure({ name, code, message, value: raw });
        }
    };
}
function defineVar(parse, options = {}) {
    return { ...options, parse };
}
function string(options = {}) {
    return defineVar((raw, context) => {
        const value = options.trim === false ? raw : raw.trim();
        if (!options.allowEmpty && value.length === 0) {
            context.fail('empty', `${context.name} must not be empty.`);
        }
        if (options.pattern && !options.pattern.test(value)) {
            context.fail('invalid_format', `${context.name} has an invalid format.`);
        }
        return value;
    }, options);
}
function number(options = {}) {
    return defineVar((raw, context) => {
        const value = Number(raw);
        if (!Number.isFinite(value)) {
            context.fail('invalid_type', `${context.name} must be a number.`);
        }
        if (options.integer && !Number.isInteger(value)) {
            context.fail('invalid_type', `${context.name} must be an integer.`);
        }
        if (options.min !== undefined && value < options.min) {
            context.fail('out_of_range', `${context.name} must be greater than or equal to ${options.min}.`);
        }
        if (options.max !== undefined && value > options.max) {
            context.fail('out_of_range', `${context.name} must be less than or equal to ${options.max}.`);
        }
        return value;
    }, options);
}
function boolean(options = {}) {
    return defineVar((raw, context) => {
        const value = raw.trim().toLowerCase();
        if (['1', 'true', 'yes', 'y', 'on'].includes(value)) {
            return true;
        }
        if (['0', 'false', 'no', 'n', 'off'].includes(value)) {
            return false;
        }
        return context.fail('invalid_value', `${context.name} must be a boolean.`);
    }, options);
}
function oneOf(values, options = {}) {
    return defineVar((raw, context) => {
        if (values.includes(raw)) {
            return raw;
        }
        return context.fail('invalid_value', `${context.name} must be one of: ${values.join(', ')}.`);
    }, options);
}
function url(options = {}) {
    return defineVar((raw, context) => {
        let value;
        try {
            value = new URL(raw);
        }
        catch {
            return context.fail('invalid_format', `${context.name} must be a valid URL.`);
        }
        if (options.protocols && !options.protocols.includes(value.protocol)) {
            context.fail('invalid_value', `${context.name} must use one of these protocols: ${options.protocols.join(', ')}.`);
        }
        return value;
    }, options);
}
function json(options = {}) {
    return defineVar((raw, context) => {
        let value;
        try {
            value = JSON.parse(raw);
        }
        catch {
            context.fail('invalid_format', `${context.name} must be valid JSON.`);
        }
        if (options.validate && !options.validate(value)) {
            context.fail('invalid_value', `${context.name} JSON did not match the expected shape.`);
        }
        return value;
    }, options);
}
function custom(parse, options = {}) {
    return defineVar(parse, options);
}
function loadEnv(schema, source = process.env) {
    const result = {};
    const issues = [];
    for (const key of Object.keys(schema)) {
        const definition = schema[key];
        const name = String(key);
        const raw = source[name];
        if (raw === undefined || raw === '') {
            if ('default' in definition) {
                result[key] = definition.default;
                continue;
            }
            if (definition.optional) {
                result[key] = undefined;
                continue;
            }
            issues.push({
                name,
                code: raw === '' ? 'empty' : 'missing',
                message: raw === '' ? `${name} must not be empty.` : `${name} is required.`
            });
            continue;
        }
        try {
            result[key] = definition.parse(raw, createContext(name, raw));
        }
        catch (error) {
            if (error instanceof EnvParseFailure) {
                issues.push(error.issue);
                continue;
            }
            throw error;
        }
    }
    if (issues.length > 0) {
        throw new EnvError(issues);
    }
    return result;
}
function formatEnvIssues(issues) {
    if (issues.length === 0) {
        return 'No environment validation issues.';
    }
    const lines = issues.map((issue) => `- ${issue.name}: ${issue.message}`);
    return ['Invalid environment variables:', ...lines].join('\n');
}
exports.env = {
    boolean,
    custom,
    json,
    number,
    oneOf,
    string,
    url
};

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const index_1 = require("./index");
(0, node_test_1.default)('loads and infers common env values', () => {
    const config = (0, index_1.loadEnv)({
        API_URL: index_1.env.url({ protocols: ['https:'] }),
        DEBUG: index_1.env.boolean({ default: false }),
        NODE_ENV: index_1.env.oneOf(['development', 'test', 'production']),
        PORT: index_1.env.number({ integer: true, min: 1, max: 65535 })
    }, {
        API_URL: 'https://example.com',
        NODE_ENV: 'test',
        PORT: '3000'
    });
    strict_1.default.equal(config.API_URL.hostname, 'example.com');
    strict_1.default.equal(config.DEBUG, false);
    strict_1.default.equal(config.NODE_ENV, 'test');
    strict_1.default.equal(config.PORT, 3000);
});
(0, node_test_1.default)('reports all validation issues together', () => {
    strict_1.default.throws(() => (0, index_1.loadEnv)({
        API_KEY: index_1.env.string(),
        PORT: index_1.env.number({ integer: true }),
        MODE: index_1.env.oneOf(['dev', 'prod'])
    }, {
        API_KEY: '',
        PORT: 'abc',
        MODE: 'stage'
    }), (error) => {
        strict_1.default.ok(error instanceof index_1.EnvError);
        strict_1.default.equal(error.issues.length, 3);
        strict_1.default.match(error.message, /API_KEY/);
        strict_1.default.match(error.message, /PORT/);
        strict_1.default.match(error.message, /MODE/);
        return true;
    });
});
(0, node_test_1.default)('string trims values by default and supports empty, raw, and pattern options', () => {
    const config = (0, index_1.loadEnv)({
        TOKEN: index_1.env.string({ pattern: /^token-/ }),
        RAW: index_1.env.string({ trim: false }),
        EMPTY: index_1.env.string({ allowEmpty: true })
    }, {
        TOKEN: ' token-123 ',
        RAW: '  keep spacing  ',
        EMPTY: '   '
    });
    strict_1.default.equal(config.TOKEN, 'token-123');
    strict_1.default.equal(config.RAW, '  keep spacing  ');
    strict_1.default.equal(config.EMPTY, '');
});
(0, node_test_1.default)('number enforces integer and range limits', () => {
    strict_1.default.throws(() => (0, index_1.loadEnv)({
        MIN: index_1.env.number({ min: 10 }),
        MAX: index_1.env.number({ max: 20 }),
        INTEGER: index_1.env.number({ integer: true })
    }, {
        MIN: '9',
        MAX: '21',
        INTEGER: '3.14'
    }), (error) => {
        strict_1.default.ok(error instanceof index_1.EnvError);
        strict_1.default.deepEqual(error.issues.map((issue) => issue.code), [
            'out_of_range',
            'out_of_range',
            'invalid_type'
        ]);
        return true;
    });
});
(0, node_test_1.default)('boolean accepts common truthy and falsey values case-insensitively', () => {
    const config = (0, index_1.loadEnv)({
        ENABLED: index_1.env.boolean(),
        DISABLED: index_1.env.boolean()
    }, {
        ENABLED: ' YES ',
        DISABLED: 'Off'
    });
    strict_1.default.equal(config.ENABLED, true);
    strict_1.default.equal(config.DISABLED, false);
});
(0, node_test_1.default)('url rejects invalid urls and unsupported protocols', () => {
    strict_1.default.throws(() => (0, index_1.loadEnv)({
        CALLBACK_URL: index_1.env.url(),
        WEBHOOK_URL: index_1.env.url({ protocols: ['https:'] })
    }, {
        CALLBACK_URL: 'not a url',
        WEBHOOK_URL: 'http://example.com'
    }), (error) => {
        strict_1.default.ok(error instanceof index_1.EnvError);
        strict_1.default.deepEqual(error.issues.map((issue) => issue.code), [
            'invalid_format',
            'invalid_value'
        ]);
        return true;
    });
});
(0, node_test_1.default)('json parses valid values and supports shape validation', () => {
    const config = (0, index_1.loadEnv)({
        FLAGS: index_1.env.json({
            validate: (value) => {
                return typeof value === 'object'
                    && value !== null
                    && Object.values(value).every((entry) => typeof entry === 'boolean');
            }
        })
    }, {
        FLAGS: '{"newCheckout":true}'
    });
    strict_1.default.deepEqual(config.FLAGS, { newCheckout: true });
    strict_1.default.throws(() => (0, index_1.loadEnv)({
        BROKEN: index_1.env.json(),
        WRONG_SHAPE: index_1.env.json({
            validate: (value) => {
                return typeof value === 'object'
                    && value !== null
                    && Object.values(value).every((entry) => typeof entry === 'boolean');
            }
        })
    }, {
        BROKEN: '{',
        WRONG_SHAPE: '{"newCheckout":"yes"}'
    }), (error) => {
        strict_1.default.ok(error instanceof index_1.EnvError);
        strict_1.default.deepEqual(error.issues.map((issue) => issue.code), [
            'invalid_format',
            'invalid_value'
        ]);
        return true;
    });
});
(0, node_test_1.default)('custom validators can fail with structured issues', () => {
    strict_1.default.throws(() => (0, index_1.loadEnv)({
        SECRET: index_1.env.custom((raw, context) => {
            if (!raw.startsWith('secret_')) {
                context.fail('invalid_format', `${context.name} must start with secret_.`);
            }
            return raw;
        })
    }, {
        SECRET: 'public_value'
    }), (error) => {
        strict_1.default.ok(error instanceof index_1.EnvError);
        strict_1.default.equal(error.issues[0]?.name, 'SECRET');
        strict_1.default.equal(error.issues[0]?.value, 'public_value');
        strict_1.default.equal(error.issues[0]?.code, 'invalid_format');
        return true;
    });
});
(0, node_test_1.default)('loadEnv applies defaults, preserves optional values, and rethrows unexpected parser errors', () => {
    const config = (0, index_1.loadEnv)({
        DEFAULTED: index_1.env.number({ default: 42 }),
        OPTIONAL: index_1.env.string({ optional: true })
    }, {});
    strict_1.default.equal(config.DEFAULTED, 42);
    strict_1.default.equal(config.OPTIONAL, undefined);
    strict_1.default.throws(() => (0, index_1.loadEnv)({
        EXPLODES: index_1.env.custom(() => {
            throw new Error('boom');
        })
    }, {
        EXPLODES: 'value'
    }), /boom/);
});
(0, node_test_1.default)('formatEnvIssues has stable empty and populated output', () => {
    strict_1.default.equal((0, index_1.formatEnvIssues)([]), 'No environment validation issues.');
    strict_1.default.equal((0, index_1.formatEnvIssues)([{
            code: 'missing',
            message: 'API_KEY is required.',
            name: 'API_KEY'
        }]), 'Invalid environment variables:\n- API_KEY: API_KEY is required.');
});

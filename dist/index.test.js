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

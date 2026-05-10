import assert from 'node:assert/strict';
import test from 'node:test';
import { EnvError, env, loadEnv } from './index';

test('loads and infers common env values', () => {
  const config = loadEnv({
    API_URL: env.url({ protocols: ['https:'] }),
    DEBUG: env.boolean({ default: false }),
    NODE_ENV: env.oneOf(['development', 'test', 'production'] as const),
    PORT: env.number({ integer: true, min: 1, max: 65535 })
  }, {
    API_URL: 'https://example.com',
    NODE_ENV: 'test',
    PORT: '3000'
  });

  assert.equal(config.API_URL.hostname, 'example.com');
  assert.equal(config.DEBUG, false);
  assert.equal(config.NODE_ENV, 'test');
  assert.equal(config.PORT, 3000);
});

test('reports all validation issues together', () => {
  assert.throws(() => loadEnv({
    API_KEY: env.string(),
    PORT: env.number({ integer: true }),
    MODE: env.oneOf(['dev', 'prod'] as const)
  }, {
    API_KEY: '',
    PORT: 'abc',
    MODE: 'stage'
  }), (error: unknown) => {
    assert.ok(error instanceof EnvError);
    assert.equal(error.issues.length, 3);
    assert.match(error.message, /API_KEY/);
    assert.match(error.message, /PORT/);
    assert.match(error.message, /MODE/);
    return true;
  });
});

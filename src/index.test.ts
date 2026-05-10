import assert from 'node:assert/strict';
import test from 'node:test';
import { EnvError, env, formatEnvIssues, loadEnv } from './index';

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

test('string trims values by default and supports empty, raw, and pattern options', () => {
  const config = loadEnv({
    TOKEN: env.string({ pattern: /^token-/ }),
    RAW: env.string({ trim: false }),
    EMPTY: env.string({ allowEmpty: true })
  }, {
    TOKEN: ' token-123 ',
    RAW: '  keep spacing  ',
    EMPTY: '   '
  });

  assert.equal(config.TOKEN, 'token-123');
  assert.equal(config.RAW, '  keep spacing  ');
  assert.equal(config.EMPTY, '');
});

test('number enforces integer and range limits', () => {
  assert.throws(() => loadEnv({
    MIN: env.number({ min: 10 }),
    MAX: env.number({ max: 20 }),
    INTEGER: env.number({ integer: true })
  }, {
    MIN: '9',
    MAX: '21',
    INTEGER: '3.14'
  }), (error: unknown) => {
    assert.ok(error instanceof EnvError);
    assert.deepEqual(error.issues.map((issue) => issue.code), [
      'out_of_range',
      'out_of_range',
      'invalid_type'
    ]);
    return true;
  });
});

test('boolean accepts common truthy and falsey values case-insensitively', () => {
  const config = loadEnv({
    ENABLED: env.boolean(),
    DISABLED: env.boolean()
  }, {
    ENABLED: ' YES ',
    DISABLED: 'Off'
  });

  assert.equal(config.ENABLED, true);
  assert.equal(config.DISABLED, false);
});

test('url rejects invalid urls and unsupported protocols', () => {
  assert.throws(() => loadEnv({
    CALLBACK_URL: env.url(),
    WEBHOOK_URL: env.url({ protocols: ['https:'] })
  }, {
    CALLBACK_URL: 'not a url',
    WEBHOOK_URL: 'http://example.com'
  }), (error: unknown) => {
    assert.ok(error instanceof EnvError);
    assert.deepEqual(error.issues.map((issue) => issue.code), [
      'invalid_format',
      'invalid_value'
    ]);
    return true;
  });
});

test('json parses valid values and supports shape validation', () => {
  const config = loadEnv({
    FLAGS: env.json<Record<string, boolean>>({
      validate: (value): value is Record<string, boolean> => {
        return typeof value === 'object'
          && value !== null
          && Object.values(value).every((entry) => typeof entry === 'boolean');
      }
    })
  }, {
    FLAGS: '{"newCheckout":true}'
  });

  assert.deepEqual(config.FLAGS, { newCheckout: true });

  assert.throws(() => loadEnv({
    BROKEN: env.json(),
    WRONG_SHAPE: env.json<Record<string, boolean>>({
      validate: (value): value is Record<string, boolean> => {
        return typeof value === 'object'
          && value !== null
          && Object.values(value).every((entry) => typeof entry === 'boolean');
      }
    })
  }, {
    BROKEN: '{',
    WRONG_SHAPE: '{"newCheckout":"yes"}'
  }), (error: unknown) => {
    assert.ok(error instanceof EnvError);
    assert.deepEqual(error.issues.map((issue) => issue.code), [
      'invalid_format',
      'invalid_value'
    ]);
    return true;
  });
});

test('custom validators can fail with structured issues', () => {
  assert.throws(() => loadEnv({
    SECRET: env.custom((raw, context) => {
      if (!raw.startsWith('secret_')) {
        context.fail('invalid_format', `${context.name} must start with secret_.`);
      }

      return raw;
    })
  }, {
    SECRET: 'public_value'
  }), (error: unknown) => {
    assert.ok(error instanceof EnvError);
    assert.equal(error.issues[0]?.name, 'SECRET');
    assert.equal(error.issues[0]?.value, 'public_value');
    assert.equal(error.issues[0]?.code, 'invalid_format');
    return true;
  });
});

test('loadEnv applies defaults, preserves optional values, and rethrows unexpected parser errors', () => {
  const config = loadEnv({
    DEFAULTED: env.number({ default: 42 }),
    OPTIONAL: env.string({ optional: true })
  }, {});

  assert.equal(config.DEFAULTED, 42);
  assert.equal(config.OPTIONAL, undefined);

  assert.throws(() => loadEnv({
    EXPLODES: env.custom(() => {
      throw new Error('boom');
    })
  }, {
    EXPLODES: 'value'
  }), /boom/);
});

test('formatEnvIssues has stable empty and populated output', () => {
  assert.equal(formatEnvIssues([]), 'No environment validation issues.');
  assert.equal(formatEnvIssues([{
    code: 'missing',
    message: 'API_KEY is required.',
    name: 'API_KEY'
  }]), 'Invalid environment variables:\n- API_KEY: API_KEY is required.');
});

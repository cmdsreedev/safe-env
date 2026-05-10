# @cmdsreedev/safe-env

[![Test](https://github.com/cmdsreedev/safe-env/actions/workflows/test.yml/badge.svg)](https://github.com/cmdsreedev/safe-env/actions/workflows/test.yml)
![Coverage](https://img.shields.io/badge/coverage-97%25%20lines%20%7C%2092%25%20branches%20%7C%20100%25%20functions-brightgreen)
![Library size](https://img.shields.io/badge/library%20size-8.9%20KB%20js%20%7C%203.6%20KB%20types-blue)

Type-safe environment variable validation for Node.js.

Small by default: the current package dry-run is 4.7 KB packed, with 8.9 KB of CommonJS runtime plus 3.6 KB of TypeScript declarations unpacked.

## Usage

```ts
import { env, loadEnv } from '@cmdsreedev/safe-env';

const config = loadEnv({
  API_KEY: env.string(),
  API_URL: env.url({ protocols: ['https:'] }),
  DEBUG: env.boolean({ default: false }),
  NODE_ENV: env.oneOf(['development', 'test', 'production'] as const),
  PORT: env.number({ integer: true, min: 1, max: 65535, default: 3000 }),
  FEATURE_FLAGS: env.json<Record<string, boolean>>({ default: {} })
});

config.PORT; // number
config.DEBUG; // boolean
config.NODE_ENV; // 'development' | 'test' | 'production'
```

## API

### `loadEnv(schema, source)`

Validates a schema against `process.env` by default and returns a typed config object.
Throws `EnvError` with all validation issues when values are missing or invalid.

You can pass a custom source for tests:

```ts
const config = loadEnv({
  PORT: env.number()
}, {
  PORT: '3000'
});
```

### Validators

- `env.string()` validates strings, with optional trimming and regex patterns.
- `env.number()` parses numbers, with integer, min, and max checks.
- `env.boolean()` accepts `true`, `false`, `1`, `0`, `yes`, `no`, `on`, and `off`.
- `env.oneOf([...])` validates string enums and preserves literal union types.
- `env.url()` parses a `URL`, with optional protocol restrictions.
- `env.json<T>()` parses JSON, with an optional type guard.
- `env.custom()` lets you define project-specific parsing.

### Errors

```ts
import { EnvError, describeEnv, env, loadEnv, toEnvExample } from '@cmdsreedev/safe-env';

try {
  loadEnv({ API_KEY: env.string(), PORT: env.number() });
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    console.error(error.issues);
    console.error(error.toJSON());
  }
}
```

`EnvError` includes structured issue data for tools and AI agents:

```json
{
  "name": "PORT",
  "code": "invalid_type",
  "expected": { "type": "number" },
  "message": "PORT must be a number.",
  "suggestion": "Set PORT to a numeric value.",
  "value": "abc"
}
```

### Schema metadata

Validators expose metadata so agents can inspect the expected environment without parsing error text:

```ts
const schema = {
  API_KEY: env.string({
    description: 'API key used for upstream requests.',
    example: 'change-me'
  }),
  NODE_ENV: env.oneOf(['development', 'test', 'production'] as const, {
    default: 'development'
  }),
  PORT: env.number({ integer: true, min: 1, max: 65535, default: 3000 })
};

describeEnv(schema);
toEnvExample(schema);
```

`toEnvExample(schema)` returns:

```env
# API key used for upstream requests.
API_KEY=change-me
NODE_ENV=development
PORT=3000
```

# @cmdsree/safe-env

[![Test](https://github.com/cmdsreedev/safe-env/actions/workflows/test.yml/badge.svg)](https://github.com/cmdsreedev/safe-env/actions/workflows/test.yml)
![Coverage](https://img.shields.io/badge/coverage-97%25%20lines%20%7C%2092%25%20branches%20%7C%20100%25%20functions-brightgreen)
![Library size](https://img.shields.io/badge/library%20size-5.6%20KB%20js%20%7C%202.3%20KB%20types-blue)

Type-safe environment variable validation for Node.js.

Small by default: the current build is 5.6 KB of CommonJS runtime plus 2.3 KB of TypeScript declarations.

## Usage

```ts
import { env, loadEnv } from '@cmdsree/safe-env';

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
import { EnvError, env, loadEnv } from '@cmdsree/safe-env';

try {
  loadEnv({ API_KEY: env.string(), PORT: env.number() });
} catch (error) {
  if (error instanceof EnvError) {
    console.error(error.message);
    console.error(error.issues);
  }
}
```

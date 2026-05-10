export type EnvSource = Record<string, string | undefined>;

export type EnvIssueCode =
  | 'missing'
  | 'empty'
  | 'invalid_type'
  | 'invalid_value'
  | 'invalid_format'
  | 'out_of_range';

export interface EnvIssue {
  name: string;
  code: EnvIssueCode;
  expected?: EnvExpected;
  message: string;
  suggestion?: string;
  value?: string;
}

export type EnvExpected =
  | { type: 'boolean' }
  | { type: 'custom'; description?: string }
  | { type: 'json'; description?: string }
  | { type: 'number'; integer?: boolean; max?: number; min?: number }
  | { type: 'oneOf'; values: readonly string[] }
  | { type: 'string'; allowEmpty?: boolean; pattern?: string; trim?: boolean }
  | { type: 'url'; protocols?: readonly string[] };

export interface EnvErrorJson {
  name: 'EnvError';
  message: string;
  issues: EnvIssue[];
}

export class EnvError extends Error {
  readonly issues: EnvIssue[];

  constructor(issues: EnvIssue[]) {
    super(formatEnvIssues(issues));
    this.name = 'EnvError';
    this.issues = issues;
  }

  toJSON(): EnvErrorJson {
    return {
      name: 'EnvError',
      message: this.message,
      issues: this.issues
    };
  }
}

export interface ParseContext {
  name: string;
  fail(code: EnvIssueCode, message: string, details?: EnvIssueDetails): never;
}

export interface EnvIssueDetails {
  expected?: EnvExpected;
  suggestion?: string;
}

export interface EnvVarOptions<T> {
  default?: T;
  description?: string;
  example?: string;
  optional?: boolean;
}

export interface EnvVar<T> extends EnvVarOptions<T> {
  expected?: EnvExpected;
  parse(raw: string, context: ParseContext): T;
}

export type EnvSchema = Record<string, EnvVar<unknown>>;

export type InferEnv<TSchema extends EnvSchema> = {
  [K in keyof TSchema]: TSchema[K] extends EnvVar<infer TValue> ? TValue : never;
};

export interface EnvDescription {
  default?: string;
  description?: string;
  example?: string;
  expected?: EnvExpected;
  optional: boolean;
  required: boolean;
}

export type EnvSchemaDescription<TSchema extends EnvSchema = EnvSchema> = {
  [K in keyof TSchema]: EnvDescription;
};

class EnvParseFailure extends Error {
  readonly issue: EnvIssue;

  constructor(issue: EnvIssue) {
    super(issue.message);
    this.issue = issue;
  }
}

function createContext(name: string, raw: string): ParseContext {
  return {
    name,
    fail(code, message, details = {}): never {
      throw new EnvParseFailure({ name, code, message, value: raw, ...details });
    }
  };
}

function defineVar<T>(parse: EnvVar<T>['parse'], options: EnvVarOptions<T> = {}, expected?: EnvExpected): EnvVar<T> {
  return { ...options, expected, parse };
}

function stringifyValue(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

function issueDetails(name: string, expected: EnvExpected, suggestion: string): EnvIssueDetails {
  return {
    expected,
    suggestion: `Set ${name} to ${suggestion}.`
  };
}

export function string(options: EnvVarOptions<string> & {
  allowEmpty?: boolean;
  pattern?: RegExp;
  trim?: boolean;
} = {}): EnvVar<string> {
  const expected: EnvExpected = {
    type: 'string',
    allowEmpty: options.allowEmpty,
    pattern: options.pattern?.source,
    trim: options.trim !== false
  };

  return defineVar((raw, context) => {
    const value = options.trim === false ? raw : raw.trim();

    if (!options.allowEmpty && value.length === 0) {
      context.fail('empty', `${context.name} must not be empty.`, issueDetails(context.name, expected, 'a non-empty string'));
    }

    if (options.pattern && !options.pattern.test(value)) {
      context.fail(
        'invalid_format',
        `${context.name} has an invalid format.`,
        issueDetails(context.name, expected, `a value matching /${options.pattern.source}/`)
      );
    }

    return value;
  }, options, expected);
}

export function number(options: EnvVarOptions<number> & {
  integer?: boolean;
  max?: number;
  min?: number;
} = {}): EnvVar<number> {
  const expected: EnvExpected = {
    type: 'number',
    integer: options.integer,
    max: options.max,
    min: options.min
  };

  return defineVar((raw, context) => {
    const value = Number(raw);

    if (!Number.isFinite(value)) {
      context.fail('invalid_type', `${context.name} must be a number.`, issueDetails(context.name, expected, 'a numeric value'));
    }

    if (options.integer && !Number.isInteger(value)) {
      context.fail('invalid_type', `${context.name} must be an integer.`, issueDetails(context.name, expected, 'an integer'));
    }

    if (options.min !== undefined && value < options.min) {
      context.fail(
        'out_of_range',
        `${context.name} must be greater than or equal to ${options.min}.`,
        issueDetails(context.name, expected, `a number greater than or equal to ${options.min}`)
      );
    }

    if (options.max !== undefined && value > options.max) {
      context.fail(
        'out_of_range',
        `${context.name} must be less than or equal to ${options.max}.`,
        issueDetails(context.name, expected, `a number less than or equal to ${options.max}`)
      );
    }

    return value;
  }, options, expected);
}

export function boolean(options: EnvVarOptions<boolean> = {}): EnvVar<boolean> {
  const expected: EnvExpected = { type: 'boolean' };

  return defineVar<boolean>((raw, context) => {
    const value = raw.trim().toLowerCase();

    if (['1', 'true', 'yes', 'y', 'on'].includes(value)) {
      return true;
    }

    if (['0', 'false', 'no', 'n', 'off'].includes(value)) {
      return false;
    }

    return context.fail('invalid_value', `${context.name} must be a boolean.`, issueDetails(context.name, expected, 'true or false'));
  }, options, expected);
}

export function oneOf<const TValues extends readonly [string, ...string[]]>(
  values: TValues,
  options: EnvVarOptions<TValues[number]> = {}
): EnvVar<TValues[number]> {
  const expected: EnvExpected = { type: 'oneOf', values };

  return defineVar<TValues[number]>((raw, context) => {
    if ((values as readonly string[]).includes(raw)) {
      return raw as TValues[number];
    }

    return context.fail(
      'invalid_value',
      `${context.name} must be one of: ${values.join(', ')}.`,
      issueDetails(context.name, expected, `one of: ${values.join(', ')}`)
    );
  }, options, expected);
}

export function url(options: EnvVarOptions<URL> & {
  protocols?: readonly string[];
} = {}): EnvVar<URL> {
  const expected: EnvExpected = { type: 'url', protocols: options.protocols };

  return defineVar((raw, context) => {
    let value: URL;

    try {
      value = new URL(raw);
    } catch {
      return context.fail('invalid_format', `${context.name} must be a valid URL.`, issueDetails(context.name, expected, 'a valid URL'));
    }

    if (options.protocols && !options.protocols.includes(value.protocol)) {
      context.fail(
        'invalid_value',
        `${context.name} must use one of these protocols: ${options.protocols.join(', ')}.`,
        issueDetails(context.name, expected, `a URL using one of these protocols: ${options.protocols.join(', ')}`)
      );
    }

    return value;
  }, options, expected);
}

export function json<T = unknown>(
  options: EnvVarOptions<T> & {
    validate?: (value: unknown) => value is T;
  } = {}
): EnvVar<T> {
  const expected: EnvExpected = { type: 'json', description: options.description };

  return defineVar((raw, context) => {
    let value: unknown;

    try {
      value = JSON.parse(raw);
    } catch {
      context.fail('invalid_format', `${context.name} must be valid JSON.`, issueDetails(context.name, expected, 'valid JSON'));
    }

    if (options.validate && !options.validate(value)) {
      context.fail(
        'invalid_value',
        `${context.name} JSON did not match the expected shape.`,
        issueDetails(context.name, expected, 'JSON matching the expected shape')
      );
    }

    return value as T;
  }, options, expected);
}

export function custom<T>(
  parse: (raw: string, context: ParseContext) => T,
  options: EnvVarOptions<T> & { expected?: EnvExpected } = {}
): EnvVar<T> {
  return defineVar(parse, options, options.expected ?? { type: 'custom', description: options.description });
}

export function loadEnv<TSchema extends EnvSchema>(
  schema: TSchema,
  source: EnvSource = process.env
): InferEnv<TSchema> {
  const result: Partial<InferEnv<TSchema>> = {};
  const issues: EnvIssue[] = [];

  for (const key of Object.keys(schema) as Array<keyof TSchema>) {
    const definition = schema[key];
    const name = String(key);
    const raw = source[name];

    if (raw === undefined || raw === '') {
      if ('default' in definition) {
        result[key] = definition.default as InferEnv<TSchema>[typeof key];
        continue;
      }

      if (definition.optional) {
        result[key] = undefined as InferEnv<TSchema>[typeof key];
        continue;
      }

      issues.push({
        name,
        code: raw === '' ? 'empty' : 'missing',
        expected: definition.expected,
        message: raw === '' ? `${name} must not be empty.` : `${name} is required.`,
        suggestion: `Set ${name} to ${definition.example ?? stringifyValue(definition.default) ?? 'a valid value'}.`
      });
      continue;
    }

    try {
      result[key] = definition.parse(raw, createContext(name, raw)) as InferEnv<TSchema>[typeof key];
    } catch (error) {
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

  return result as InferEnv<TSchema>;
}

export function describeEnv<TSchema extends EnvSchema>(schema: TSchema): EnvSchemaDescription<TSchema> {
  const description: Partial<EnvSchemaDescription<TSchema>> = {};

  for (const key of Object.keys(schema) as Array<keyof TSchema>) {
    const definition = schema[key];

    description[key] = {
      default: stringifyValue(definition.default),
      description: definition.description,
      example: definition.example,
      expected: definition.expected,
      optional: definition.optional === true,
      required: !definition.optional && !('default' in definition)
    };
  }

  return description as EnvSchemaDescription<TSchema>;
}

export function toEnvExample(schema: EnvSchema): string {
  return Object.entries(schema)
    .map(([name, definition]) => {
      const prefix = definition.description ? `# ${definition.description}\n` : '';
      const value = definition.example ?? stringifyValue(definition.default) ?? '';
      return `${prefix}${name}=${value}`;
    })
    .join('\n');
}

export function formatEnvIssues(issues: readonly EnvIssue[]): string {
  if (issues.length === 0) {
    return 'No environment validation issues.';
  }

  const lines = issues.map((issue) => `- ${issue.name}: ${issue.message}`);
  return ['Invalid environment variables:', ...lines].join('\n');
}

export const env = {
  boolean,
  custom,
  describeEnv,
  json,
  number,
  oneOf,
  string,
  toEnvExample,
  url
};

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
  message: string;
  value?: string;
}

export class EnvError extends Error {
  readonly issues: EnvIssue[];

  constructor(issues: EnvIssue[]) {
    super(formatEnvIssues(issues));
    this.name = 'EnvError';
    this.issues = issues;
  }
}

export interface ParseContext {
  name: string;
  fail(code: EnvIssueCode, message: string): never;
}

export interface EnvVarOptions<T> {
  default?: T;
  description?: string;
  optional?: boolean;
}

export interface EnvVar<T> extends EnvVarOptions<T> {
  parse(raw: string, context: ParseContext): T;
}

export type EnvSchema = Record<string, EnvVar<unknown>>;

export type InferEnv<TSchema extends EnvSchema> = {
  [K in keyof TSchema]: TSchema[K] extends EnvVar<infer TValue> ? TValue : never;
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
    fail(code, message): never {
      throw new EnvParseFailure({ name, code, message, value: raw });
    }
  };
}

function defineVar<T>(parse: EnvVar<T>['parse'], options: EnvVarOptions<T> = {}): EnvVar<T> {
  return { ...options, parse };
}

export function string(options: EnvVarOptions<string> & {
  allowEmpty?: boolean;
  pattern?: RegExp;
  trim?: boolean;
} = {}): EnvVar<string> {
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

export function number(options: EnvVarOptions<number> & {
  integer?: boolean;
  max?: number;
  min?: number;
} = {}): EnvVar<number> {
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

export function boolean(options: EnvVarOptions<boolean> = {}): EnvVar<boolean> {
  return defineVar<boolean>((raw, context) => {
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

export function oneOf<const TValues extends readonly [string, ...string[]]>(
  values: TValues,
  options: EnvVarOptions<TValues[number]> = {}
): EnvVar<TValues[number]> {
  return defineVar<TValues[number]>((raw, context) => {
    if ((values as readonly string[]).includes(raw)) {
      return raw as TValues[number];
    }

    return context.fail('invalid_value', `${context.name} must be one of: ${values.join(', ')}.`);
  }, options);
}

export function url(options: EnvVarOptions<URL> & {
  protocols?: readonly string[];
} = {}): EnvVar<URL> {
  return defineVar((raw, context) => {
    let value: URL;

    try {
      value = new URL(raw);
    } catch {
      return context.fail('invalid_format', `${context.name} must be a valid URL.`);
    }

    if (options.protocols && !options.protocols.includes(value.protocol)) {
      context.fail('invalid_value', `${context.name} must use one of these protocols: ${options.protocols.join(', ')}.`);
    }

    return value;
  }, options);
}

export function json<T = unknown>(
  options: EnvVarOptions<T> & {
    validate?: (value: unknown) => value is T;
  } = {}
): EnvVar<T> {
  return defineVar((raw, context) => {
    let value: unknown;

    try {
      value = JSON.parse(raw);
    } catch {
      context.fail('invalid_format', `${context.name} must be valid JSON.`);
    }

    if (options.validate && !options.validate(value)) {
      context.fail('invalid_value', `${context.name} JSON did not match the expected shape.`);
    }

    return value as T;
  }, options);
}

export function custom<T>(
  parse: (raw: string, context: ParseContext) => T,
  options: EnvVarOptions<T> = {}
): EnvVar<T> {
  return defineVar(parse, options);
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
        message: raw === '' ? `${name} must not be empty.` : `${name} is required.`
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
  json,
  number,
  oneOf,
  string,
  url
};

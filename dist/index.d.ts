export type EnvSource = Record<string, string | undefined>;
export type EnvIssueCode = 'missing' | 'empty' | 'invalid_type' | 'invalid_value' | 'invalid_format' | 'out_of_range';
export interface EnvIssue {
    name: string;
    code: EnvIssueCode;
    message: string;
    value?: string;
}
export declare class EnvError extends Error {
    readonly issues: EnvIssue[];
    constructor(issues: EnvIssue[]);
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
export declare function string(options?: EnvVarOptions<string> & {
    allowEmpty?: boolean;
    pattern?: RegExp;
    trim?: boolean;
}): EnvVar<string>;
export declare function number(options?: EnvVarOptions<number> & {
    integer?: boolean;
    max?: number;
    min?: number;
}): EnvVar<number>;
export declare function boolean(options?: EnvVarOptions<boolean>): EnvVar<boolean>;
export declare function oneOf<const TValues extends readonly [string, ...string[]]>(values: TValues, options?: EnvVarOptions<TValues[number]>): EnvVar<TValues[number]>;
export declare function url(options?: EnvVarOptions<URL> & {
    protocols?: readonly string[];
}): EnvVar<URL>;
export declare function json<T = unknown>(options?: EnvVarOptions<T> & {
    validate?: (value: unknown) => value is T;
}): EnvVar<T>;
export declare function custom<T>(parse: (raw: string, context: ParseContext) => T, options?: EnvVarOptions<T>): EnvVar<T>;
export declare function loadEnv<TSchema extends EnvSchema>(schema: TSchema, source?: EnvSource): InferEnv<TSchema>;
export declare function formatEnvIssues(issues: readonly EnvIssue[]): string;
export declare const env: {
    boolean: typeof boolean;
    custom: typeof custom;
    json: typeof json;
    number: typeof number;
    oneOf: typeof oneOf;
    string: typeof string;
    url: typeof url;
};

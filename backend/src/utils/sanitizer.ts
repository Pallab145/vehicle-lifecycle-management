/**
 * Sanitizes a search input for safe use in SQL LIKE / ILIKE queries.
 * 
 * Production standards implemented:
 * 1. Trimming whitespace.
 * 2. Capping length to 100 characters to prevent resource exhaustion.
 * 3. Escaping SQL wildcards (%) and (_) to prevent query manipulation.
 * 4. Escaping the escape character (\) itself.
 * 
 * @param input The raw search input from the user
 * @returns A sanitized and escaped string safe for Prisma 'contains'
 */
export function sanitizeSearchInput(input: string | undefined): string | undefined {
    if (!input) return undefined;

    return input
        .trim()
        .substring(0, 100)
        // Escape the SQL escape character (\) first, then the wildcards (% and _)
        // We use \\\\ because we want a literal backslash in the result
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
}

/**
 * Recursive type that transforms all BigInt types to strings and Decimals to numbers.
 */
export type SanitizeResponse<T> = T extends bigint
    ? string
    : T extends Array<infer U>
    ? Array<SanitizeResponse<U>>
    : T extends object
    ? T extends Date | RegExp
        ? T
        : { [K in keyof T]: SanitizeResponse<T[K]> }
    : T;

/**
 * Utility to sanitize objects for JSON serialization.
 * Recursively converts:
 * - BigInt values to strings
 * - Decimal (Prisma/decimal.js) values to numbers
 */
export function sanitizeResponseData<T>(obj: T): SanitizeResponse<T> {
    if (obj === null || obj === undefined) {
        return obj as SanitizeResponse<T>;
    }

    // Handle BigInt
    if (typeof obj === 'bigint') {
        return obj.toString() as SanitizeResponse<T>;
    }

    // Handle Array
    if (Array.isArray(obj)) {
        return obj.map((item) => sanitizeResponseData(item)) as unknown as SanitizeResponse<T>;
    }

    // Handle Object
    if (typeof obj === 'object') {
        // Skip Date, RegExp
        if (obj instanceof Date || obj instanceof RegExp) {
            return obj as unknown as SanitizeResponse<T>;
        }

        // Handle Decimal (Prisma/decimal.js)
        // Decimals usually have a .toNumber() method
        const possibleDecimal = obj as Record<string, unknown>;
        if (possibleDecimal.constructor?.name === 'Decimal' || typeof possibleDecimal.toNumber === 'function') {
            return (possibleDecimal.toNumber as () => number)() as SanitizeResponse<T>;
        }

        const sanitized = {} as Record<string, unknown>;
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeResponseData(value);
        }
        return sanitized as unknown as SanitizeResponse<T>;
    }

    return obj as unknown as SanitizeResponse<T>;
}

/**
 * Backward compatibility alias
 */
export const sanitizeBigInt = sanitizeResponseData;


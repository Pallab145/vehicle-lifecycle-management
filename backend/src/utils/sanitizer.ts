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

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { isHttpError } from 'http-errors';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { getIP } from '@/utils/getIP';

function isPrismaKnownError(err: unknown): err is { code: string; message: string } {
    return (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        'clientVersion' in err
    );
}

interface CustomHttpError extends Error {
    status: number;
    statusCode: number;
    expose: boolean;
    code?: string;
    missing?: unknown;
    details?: unknown;
}

export function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    const requestId = req.context?.requestId ?? 'unknown';
    const timestamp = new Date().toISOString();
    const meta = { requestId, timestamp };

    if (isHttpError(err)) {
        const customErr = err as CustomHttpError;
        res.status(customErr.status).json({
            success: false,
            error: customErr.message,
            code: customErr.code,
            missing: customErr.missing,
            details: customErr.details,
            meta,
        });
        return;
    }

    if (err instanceof ZodError) {
        res.status(422).json({
            success: false,
            error: 'Validation failed',
            details: err.flatten().fieldErrors,
            meta,
        });
        return;
    }

    if (isPrismaKnownError(err)) {
        const code = err.code;
        if (code === 'P2002') return void res.status(409).json({ success: false, error: 'Resource already exists', code, meta });
        if (code === 'P2025') return void res.status(404).json({ success: false, error: 'Resource not found', code, meta });
    }

    logger.error({
        event: 'unhandled_error',
        err,
        requestId,
        method: req.method,
        path: req.path,
        ip: getIP(req),
    });

    res.status(500).json({
        success: false,
        error: 'Internal server error',
        ...(env.NODE_ENV !== 'production' && err instanceof Error
            ? { details: { message: err.message, stack: err.stack } }
            : {}),
        meta,
    });
}

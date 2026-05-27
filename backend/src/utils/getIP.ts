import type { Request } from 'express';

export function getIP(req: Request): string {
    return req.context.realIP;
}

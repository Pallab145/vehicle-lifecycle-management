import type { Request, Response, NextFunction, RequestHandler } from 'express';

type AsyncRequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction,
) => Promise<void>;

export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
    return (req: Request, res: Response, next: NextFunction): void => {
        fn(req, res, next).catch(next);
    }
}

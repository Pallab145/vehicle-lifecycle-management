import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { env, allowedOrigins } from '@/config/env';
import { httpLogger } from '@/lib/logger';
import { securityHeaders } from '@/middlewares/securityHeaders';
import { requestContext } from '@/middlewares/requestContext';
import { errorHandler } from '@/middlewares/errorHandler';
import apiRoutes from '@/routes';
import { globalRateLimit } from '@/middlewares/rate-limit';

export function createApp(): express.Application {
    const app = express();

    // ── Trust Proxy ───────────────────────────────────────────────────
    app.set('trust proxy', env.TRUST_PROXY);

    // ── 0. Request Logging ────────────────────────────────────────────
    app.use(httpLogger);

    // ── 1. Security Headers ───────────────────────────────────────────
    app.use(securityHeaders);

    // ── 1.5 Global Rate Limit ─────────────────────────────────────────
    app.use(globalRateLimit);

    // ── 2. Cookie Parser & Body Parser ────────────────────────────────
    app.use(cookieParser());
    app.use(express.json({ limit: '1mb' }));

    // ── 3. Application CORS ───────────────────────────────────────────
    app.use(cors({
        origin: allowedOrigins,
        credentials: true,
    }));

    // ── 4. Request Context ────────────────────────────────────────────
    app.use(requestContext);

    // ── 5. Welcome Endpoint ───────────────────────────────────────────
    app.get('/', (_req, res) => {
        res.json({
            message: 'Vehicle Lifecycle API Gateway is Running',
            status: 'success',
            timestamp: new Date().toISOString(),
        });
    });

    // ── 6. Routes ─────────────────────────────────────────────────────
    app.use('/api', apiRoutes);

    // ── 7. 404 Handler ────────────────────────────────────────────────
    app.use((_req, res) => {
        res.status(404).json({
            success: false,
            error: 'Route not found',
            meta: { timestamp: new Date().toISOString() },
        });
    });

    // ── 8. Error Handler (must be last) ───────────────────────────────
    app.use(errorHandler);

    return app;
}

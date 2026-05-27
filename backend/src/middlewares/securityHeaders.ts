import helmet from 'helmet';
import hpp from 'hpp';
import type { RequestHandler } from 'express';
import { allowedOrigins } from '@/config/env';

export const securityHeaders: RequestHandler[] = [
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'none'"],           // API gateway doesn't serve content
                scriptSrc: ["'none'"],            // No scripts needed
                connectSrc: ["'self'", ...(Array.isArray(allowedOrigins) ? allowedOrigins : [])], // Controls where browser may make outbound connections
                imgSrc: ["'self'", 'data:'],
                styleSrc: ["'self'"],
                frameSrc: ["'none'"],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        },
        crossOriginEmbedderPolicy: false,     // Not needed for APIs
        crossOriginOpenerPolicy: false,       // Not needed for APIs
        crossOriginResourcePolicy: {
            policy: 'cross-origin'            // Allow cross-origin API requests
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
        referrerPolicy: { policy: 'no-referrer' }, // Better privacy for API
        noSniff: true,                        // Prevent MIME sniffing
        xFrameOptions: { action: 'deny' },    // Prevent clickjacking
        hidePoweredBy: true,                  // Hide Express signature
        dnsPrefetchControl: { allow: false },
    }),
    hpp(),
];

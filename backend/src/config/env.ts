import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(5000),
    SERVICE_NAME: z.string().default('vehicle-lifecycle-backend'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    // Database Setup
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),

    // Blockchain Setup
    RPC_URL: z.string().url().default('https://rpc.ahaarx.com'),

    // Cookie Domain & CORS
    APP_DOMAIN: z.string().default('localhost'),
    ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),

    // Master Keys (Role-Based Custodian Architecture)
    // Using optional for now so dev server doesn't crash if they aren't set yet
    MASTER_ADMIN_KEY: z.string().optional(),
    RTO_MASTER_KEY: z.string().optional(),
    POLICE_MASTER_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(o => o.trim());

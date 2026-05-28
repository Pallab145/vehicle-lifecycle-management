import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(5000),
    SERVICE_NAME: z.string().default('vehicle-lifecycle-backend'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    // Database Setup
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    DIRECT_URL: z.string().min(1, "DIRECT_URL is required"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),

    // Authentication & JWT
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    JWT_ACCESS_TTL: z.coerce.number().int().default(900), // 15 minutes default
    JWT_REFRESH_TTL: z.coerce.number().int().default(604800), // 7 days default

    // Blockchain Setup
    RPC_URL: z.string().url().default('https://rpc.ahaarx.com'),
    WS_RPC_URL: z.string().url().default('wss://rpc.ahaarx.com/ws'),
    CHAIN_ID: z.coerce.number().default(4100),
    CONTRACT_DVP_ADDRESS: z.string().min(1, "CONTRACT_DVP_ADDRESS is required"),
    CONTRACT_OWNERSHIP_ADDRESS: z.string().min(1, "CONTRACT_OWNERSHIP_ADDRESS is required"),
    CONTRACT_CHALLAN_ADDRESS: z.string().min(1, "CONTRACT_CHALLAN_ADDRESS is required"),
    CONTRACT_INSURANCE_ADDRESS: z.string().min(1, "CONTRACT_INSURANCE_ADDRESS is required"),
    CONTRACT_PUC_ADDRESS: z.string().min(1, "CONTRACT_PUC_ADDRESS is required"),
    CONTRACT_LOAN_ADDRESS: z.string().min(1, "CONTRACT_LOAN_ADDRESS is required"),

    // Cookie Domain & CORS
    APP_DOMAIN: z.string().default('localhost'),
    ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),

    // Master Keys (Role-Based Custodian Architecture)
    // Strongly required for AES-256-GCM encryption of Ethereum private keys
    MASTER_ADMIN_KEY: z.string().min(10, 'MASTER_ADMIN_KEY must be securely defined'),
    RTO_MASTER_KEY: z.string().min(10, 'RTO_MASTER_KEY must be securely defined'),
    MANUFACTURER_MASTER_KEY: z.string().min(10, 'MANUFACTURER_MASTER_KEY must be securely defined'),
    POLICE_MASTER_KEY: z.string().min(10, 'POLICE_MASTER_KEY must be securely defined'),
    INSURANCE_MASTER_KEY: z.string().min(10, 'INSURANCE_MASTER_KEY must be securely defined'),
    PUC_MASTER_KEY: z.string().min(10, 'PUC_MASTER_KEY must be securely defined'),
    SCRAP_MASTER_KEY: z.string().min(10, 'SCRAP_MASTER_KEY must be securely defined'),
    BANK_MASTER_KEY: z.string().min(10, 'BANK_MASTER_KEY must be securely defined'),

    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60000), // 1 minute
    RATE_LIMIT_MAX: z.coerce.number().int().default(200), // 200 reqs per minute

    // Email Service (Resend)
    EMAIL_FROM: z.string().email().default('onboarding@resend.dev'),
    RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),

    // Background Workers (Redis / BullMQ)
    REDIS_URL: z.string().url().default('redis://localhost:6379'),

    // Payments
    PAYMENT_WEBHOOK_SECRET: z.string().default('mock_webhook_secret_dev_only'),
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

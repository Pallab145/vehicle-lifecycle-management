import { EntityType, MemberRole } from '@/generated/prisma/client';

export enum AuthType {
    B2C = 'B2C',
    B2B = 'B2B'
}

export interface RequestContext {
    requestId: string;
    realIP: string;
    deviceId: string;
}

export interface CallerIdentity {
    sub: string;             // The primary ID (User ID or Member ID)
    type: AuthType;          // Identifies the auth mechanism
    jti: string;             // JWT ID for refresh token tracking
    
    wallet?: string;
    
    // B2B Specific
    email?: string;
    entityId?: string;
    entityType?: EntityType; // Strongly typed with Prisma Enum
    role?: MemberRole;       // Strongly typed with Prisma Enum
    
    exp: number;
    iat: number;
}

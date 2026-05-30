export type AuthType = 'B2C' | 'B2B';

export interface AuthUser {
    sub: string;
    type: AuthType;
    jti: string;
    wallet?: string | null;
    email?: string | null;
    entityId?: string | null;
    entityType?: string | null;
    role?: string | null;
    exp: number;
    iat: number;
}

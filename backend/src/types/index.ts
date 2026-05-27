export interface RequestContext {
    requestId: string;
    realIP: string;
    deviceId: string;
}

export interface CallerIdentity {
    userId: string;
    email: string;
    jti: string;
    role?: string | undefined;
    memberId?: string | undefined;
    exp: number;
    iat: number;
}

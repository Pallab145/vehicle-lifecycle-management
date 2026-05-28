export const COOKIE_DEVICE_ID = 'did';
export const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000; // 1 year

export const COOKIE = {
    ACCESS_TOKEN: 'vl_access_token',
    REFRESH_TOKEN: 'vl_refresh_token',
    CSRF_TOKEN: 'vl_csrf_token',
    SIWE_NONCE: 'vl_siwe_nonce',
};

export const AUTH = {
    PASSWORD_MIN_LENGTH: 8,
    OTP_LENGTH: 6,
    OTP_EXPIRY_MINUTES: 15,
};

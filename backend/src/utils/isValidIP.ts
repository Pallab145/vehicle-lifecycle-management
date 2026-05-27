import { isIP } from 'node:net';

export function isValidIP(ip: string | undefined): boolean {
    if (!ip || ip === 'unknown') return false;

    // Explicitly allow localhost shorthand if needed
    if (ip === '::1' || ip === '127.0.0.1') return true;

    // Use robust Node.js net.isIP validator (returns 0 for invalid, 4 for IPv4, 6 for IPv6)
    return isIP(ip) !== 0;
}
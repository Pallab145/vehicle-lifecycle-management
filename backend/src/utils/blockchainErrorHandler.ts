/**
 * Utility to extract clean custom Solidity errors from raw Ethers.js exceptions.
 */
interface EthersCallException extends Error {
    code?: string;
    revert?: { name?: string };
    info?: { error?: { message?: string } };
    reason?: string;
}

/**
 * Utility to extract clean custom Solidity errors from raw Ethers.js exceptions.
 */
export function parseEthersError(err: unknown): string {
    if (err && typeof err === 'object') {
        const typedErr = err as EthersCallException;
        
        // Ethers v6 CallException (revert with ABI)
        if (typedErr.code === 'CALL_EXCEPTION' && typedErr.revert?.name) {
            return typedErr.revert.name;
        }

        // Fallback for some RPC nodes that wrap the error data
        if (typedErr.info?.error?.message) {
            return typedErr.info.error.message.replace('execution reverted: ', '');
        }

        // Generic ethers reason
        if (typedErr.reason) {
            return typedErr.reason;
        }

        // Standard JS error message
        if (typedErr.message) {
            return typedErr.message;
        }
    }
    
    return String(err);
}

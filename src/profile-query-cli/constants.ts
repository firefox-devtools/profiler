/**
 * Build-time constants injected by webpack.
 */

// This global is defined by webpack.DefinePlugin
declare const __BUILD_HASH__: string;

/**
 * Unique hash for this build, used to detect version mismatches
 * between client and daemon.
 */
export const BUILD_HASH = __BUILD_HASH__;

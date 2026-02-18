/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import esbuild from 'esbuild';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Headers matching res/_headers
const EXTRA_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    'img-src http: https: data:',
    "object-src 'none'",
    'connect-src *',
    "form-action 'none'",
  ].join('; '),
};

// Allowed hosts for dev server
const ALLOWED_HOSTS = ['localhost', '.app.github.dev'];

function isHostAllowed(hostHeader) {
  if (!hostHeader) {
    return false;
  }

  // Extract hostname without port
  const hostname = hostHeader.split(':')[0];

  // Check exact match or suffix match for wildcard patterns
  return ALLOWED_HOSTS.some((allowedHost) => {
    if (allowedHost.startsWith('.')) {
      // Wildcard pattern like '.app.github.dev'
      return hostname.endsWith(allowedHost);
    }
    return hostname === allowedHost;
  });
}

export async function startDevServer(buildConfig, options = {}) {
  const {
    port = 4242,
    host = 'localhost',
    distDir = 'dist',
    fallback = 'index.html',
    onServerStart,
    cleanDist = true,
  } = options;

  // Clean dist directory first
  if (cleanDist && fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }

  // Create build context for watching
  const buildContext = await esbuild.context(buildConfig);
  const { hosts, port: esbuildServerPort } = await buildContext.serve({
    host: '127.0.0.1',
    servedir: distDir,
    fallback: fallback ? path.join(distDir, fallback) : undefined,
  });

  const hostname = hosts[0];

  // Start watching for changes
  await buildContext.watch();

  // Create HTTP server
  const server = http.createServer((req, res) => {
    // Validate Host header
    if (!isHostAllowed(req.headers.host)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Invalid Host header');
      return;
    }

    const requestOptions = {
      hostname,
      port: esbuildServerPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };

    // Forward each incoming request to esbuild
    const proxyReq = http.request(requestOptions, (proxyRes) => {
      // Add security headers to the response
      const responseHeaders = {
        ...proxyRes.headers,
        ...EXTRA_HEADERS,
      };

      // Forward the response from esbuild to the client
      // Note: esbuild's serve with fallback handles 404s
      // by serving index.html for client-side routing
      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res, { end: true });
    });

    // Forward the body of the request to esbuild
    req.pipe(proxyReq, { end: true });
  });

  // Start the server
  await new Promise((resolve) => {
    server.listen(port, host, () => {
      if (onServerStart) {
        onServerStart(`http://${host}:${port}`);
      }
      resolve();
    });
  });

  // Graceful shutdown
  let isShuttingDown = false;
  process.on('SIGINT', async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\nShutting down...');
    await buildContext.dispose();
    server.close();
    process.exit(0);
  });

  return { server, buildContext };
}

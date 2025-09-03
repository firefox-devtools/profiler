import esbuild from 'esbuild';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mainBundleConfig } from './esbuild.mjs';
import profileServer from './profile-server.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = parseInt(process.env.FX_PROFILER_PORT) || 4242;
const host = process.env.FX_PROFILER_HOST || 'localhost';

const argv = yargs(hideBin(process.argv))
  .command('* [profile]', 'Open Firefox Profiler, on [profile] if included.')
  .version(false)
  .strict()
  .parseSync();

// Clean dist directory first
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true });
}

async function startDevServer() {
  // Build configuration - consistent with main esbuild.mjs approach
  // Create build context for watching
  const buildContext = await esbuild.context(mainBundleConfig);
  const { hosts, port: esbuildServerPort } = await buildContext.serve({
    host: '127.0.0.1',
    servedir: 'dist',
    fallback: 'dist/index.html',
  });

  const hostname = hosts[0];

  // Start watching for changes
  await buildContext.watch();

  // Create HTTP server
  const server = http.createServer((req, res) => {
    const options = {
      hostname,
      port: esbuildServerPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    };

    // Forward each incoming request to esbuild
    const proxyReq = http.request(options, (proxyRes) => {
      // If esbuild returns "not found", send a custom 404 page
      if (proxyRes.statusCode === 404) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>A custom 404 page</h1>');
        return;
      }

      // Otherwise, forward the response from esbuild to the client
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    // Forward the body of the request to esbuild
    req.pipe(proxyReq, { end: true });
  });

  // Start the server
  server.listen(port, host, () => {
    const profilerUrl = `http://${host}:${port}`;
    const barAscii =
      '------------------------------------------------------------------------------------------';

    console.log(barAscii);
    console.log(`> Firefox Profiler is listening at: ${profilerUrl}\n`);

    if (port === 4242) {
      console.log(
        '> You can change this default port with the environment variable FX_PROFILER_PORT.\n'
      );
    }

    console.log('> esbuild development server enabled');
    console.log(barAscii);

    // Handle profile server if profile argument provided
    if (argv.profile) {
      const resolvedProfile = path.resolve(argv.profile);
      profileServer.serveAndOpen(host, profilerUrl, resolvedProfile);
    }
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
}

startDevServer().catch(console.error);

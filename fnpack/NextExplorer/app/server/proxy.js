#!/usr/bin/env node
/**
 * NextExplorer reverse proxy for a NAS gateway's Unix socket.
 *
 * This is the *pass-through* form: the frontend is built with the prefix baked
 * in (`vite build --base=/app/NextExplorer/` plus `VITE_API_URL`), and the few
 * root-absolute URLs the build cannot reach are fixed in the source
 * (see source-patches/). Nothing has to be rewritten on the wire, so nothing
 * here touches a response body — which is also why this file is a fraction of
 * the size of the runtime-injection version it replaces (kept as
 * server.runtime-inject.js, for deployments that must run the stock image).
 *
 * What it does, all of it:
 *   - listens on the Unix socket the gateway forwards to (and, optionally, a
 *     TCP port for debugging);
 *   - strips the prefix when the gateway forwards it (auto-detected: a request
 *     that does not carry it is passed through as sent);
 *   - forwards to NextExplorer over TCP, streaming both directions, so uploads,
 *     downloads, Range, SSE and WebSocket behave as if it were not there;
 *   - rewrites `Location` so a redirect cannot drop the browser out of the
 *     prefix, and optionally overrides the framing headers;
 *   - answers /__proxy__/health with the effective configuration and counters.
 *
 * Run:  node server.js            (all configuration is environment variables)
 *       node server.js --check    print the configuration and probe upstream
 */

'use strict';

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return !/^(0|false|no|off)$/i.test(String(value).trim());
};

/** Accepts "/files", "files", "/files/", or a whole URL whose path is the prefix. */
function normalizeBase(raw) {
  const value = (raw || '').trim();
  if (!value) return '';
  let p = value;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      p = new URL(value).pathname;
    } catch (_) {
      p = value;
    }
  }
  p = p.replace(/\/+$/, '');
  if (!p || p === '/') return '';
  return p[0] === '/' ? p : `/${p}`;
}

function parseUpstream(raw) {
  const value = (raw || '').trim();
  if (!value) return { host: '127.0.0.1', port: 3000 };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const u = new URL(value);
    return { host: u.hostname, port: Number(u.port) || 80 };
  }
  const m = /^(.*?)(?::(\d+))?$/.exec(value);
  return { host: m[1] || '127.0.0.1', port: Number(m[2]) || 3000 };
}

const cfg = {
  base: normalizeBase(process.env.BASEURL || process.env.BASE_URL || process.env.BASE_PATH),
  sock: process.env.LISTEN_SOCK || '',
  sockMode: parseInt(process.env.SOCKET_MODE || '660', 8),
  sockUid: process.env.SOCKET_UID ? Number(process.env.SOCKET_UID) : null,
  sockGid: process.env.SOCKET_GID ? Number(process.env.SOCKET_GID) : null,
  listenHost: process.env.LISTEN_HOST || '127.0.0.1',
  listenPort: process.env.LISTEN_PORT ? Number(process.env.LISTEN_PORT) : 0,
  upstream: parseUpstream(process.env.UPSTREAM),
  // A gateway may or may not strip the prefix before forwarding; auto handles
  // both. `never` is for the case where the prefix collides with a real app
  // path — a misconfiguration: don't pick a prefix like /api or /static.
  stripPrefix: !/^(never|off|0|false|no)$/i.test((process.env.STRIP_PREFIX || 'auto').trim()),
  rewriteLocation: bool(process.env.REWRITE_LOCATION, true),
  // Unset leaves NextExplorer's own headers. SAMEORIGIN already permits a panel
  // on the same origin to frame the app; CSP frame-ancestors is the only way to
  // name a different origin.
  xFrameOptions: process.env.X_FRAME_OPTIONS || '',
  cspFrameAncestors: process.env.CSP_FRAME_ANCESTORS || '',
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS || 0),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 0),
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  healthPath: '/__proxy__/health',
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const log = (level, msg, detail) => {
  if (LEVELS[level] < (LEVELS[cfg.logLevel] ?? 20)) return;
  const line = { level: level.toUpperCase(), time: new Date().toISOString(), msg };
  if (detail !== undefined) line.detail = detail;
  process.stdout.write(`${JSON.stringify(line)}\n`);
};

// ---------------------------------------------------------------------------
// Paths, headers, redirects
// ---------------------------------------------------------------------------

/** Adds the prefix to a root-relative path, once. */
const prefixPath = (p) => {
  if (!cfg.base || typeof p !== 'string' || p[0] !== '/' || p[1] === '/') return p;
  if (p === cfg.base || p.startsWith(`${cfg.base}/`)) return p;
  return cfg.base + p;
};

/** Maps the incoming request path onto the upstream one. */
function upstreamPath(incoming) {
  if (!cfg.stripPrefix || !cfg.base) return incoming;
  const q = incoming.indexOf('?');
  const p = q === -1 ? incoming : incoming.slice(0, q);
  const rest = q === -1 ? '' : incoming.slice(q);
  if (p === cfg.base) return `/${rest}`;
  if (p.startsWith(`${cfg.base}/`)) return p.slice(cfg.base.length) + rest;
  return incoming; // the gateway already stripped it
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

function forwardHeaders(req, { forUpgrade = false } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key) && !(forUpgrade && (key === 'connection' || key === 'upgrade'))) continue;
    out[k] = v;
  }
  const peer = req.socket.remoteAddress;
  const prior = req.headers['x-forwarded-for'];
  if (peer || prior) {
    // A Unix socket has no peer address; then the gateway's own header is all
    // there is, and inventing one would be worse than passing it on.
    out['x-forwarded-for'] = prior ? `${prior}, ${peer}` : String(peer);
  }
  out['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'http';
  out['x-forwarded-host'] = req.headers['x-forwarded-host'] || req.headers.host || '';
  if (cfg.base) out['x-forwarded-prefix'] = cfg.base;
  return out;
}

function rewriteLocation(location) {
  if (!cfg.base || !location) return location;
  if (location[0] === '/') return prefixPath(location);
  try {
    const u = new URL(location);
    const p = prefixPath(u.pathname);
    return p === u.pathname ? location : `${u.origin}${p}${u.search}${u.hash}`;
  } catch (_) {
    return location;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const stats = {
  startedAt: new Date().toISOString(),
  requests: 0,
  upgraded: 0,
  bytesUp: 0,
  bytesDown: 0,
  locationsRewritten: 0,
  errors: 0,
};

const features = {
  rewrite: false, // deliberately: this build rewrites no response body
  shim: false,
  location: cfg.rewriteLocation,
  frameHeaders: Boolean(cfg.xFrameOptions || cfg.cspFrameAncestors),
  websocket: true,
};

const healthPayload = () => ({
  ok: true,
  mode: 'pass-through',
  base: cfg.base || null,
  upstream: `${cfg.upstream.host}:${cfg.upstream.port}`,
  socket: cfg.sock || null,
  prefixHandling: cfg.stripPrefix ? 'strip-if-present' : 'never-strip',
  features,
  stats,
  note: 'stats are per process and reset on restart',
});

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

const pipeBoth = (a, b) => {
  a.pipe(b);
  a.on('error', () => b.destroy());
  b.on('error', () => a.destroy());
};

function sendError(res, status, message) {
  stats.errors += 1;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  const body = Buffer.from(
    `<!doctype html><meta charset="utf-8"><title>${status}</title>` +
      `<body style="font:14px system-ui;padding:2rem"><h1>${status}</h1><p>${message}</p>`,
    'utf8'
  );
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function handler(req, res) {
  stats.requests += 1;
  const started = Date.now();
  const incoming = req.url || '/';

  // Reachable both behind the prefix and directly, so an operator can tell
  // "proxy up" from "app up".
  if (req.method === 'GET' && upstreamPath(incoming).split('?')[0] === cfg.healthPath) {
    const body = Buffer.from(JSON.stringify(healthPayload(), null, 2));
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    res.end(body);
    return;
  }

  const target = upstreamPath(incoming);
  const upReq = http.request(
    {
      host: cfg.upstream.host,
      port: cfg.upstream.port,
      method: req.method,
      path: target,
      headers: forwardHeaders(req),
    },
    (upRes) => {
      const headers = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (v === undefined || HOP_BY_HOP.has(k.toLowerCase())) continue;
        headers[k] = v;
      }
      if (cfg.rewriteLocation && headers.location) {
        const next = rewriteLocation(Array.isArray(headers.location) ? headers.location[0] : headers.location);
        if (next !== headers.location) {
          stats.locationsRewritten += 1;
          headers.location = next;
        }
      }
      if (cfg.xFrameOptions) headers['x-frame-options'] = cfg.xFrameOptions;
      if (cfg.cspFrameAncestors) {
        // frame-ancestors wins over X-Frame-Options in every current browser,
        // and it is the only way to name another origin.
        const csp = `frame-ancestors ${cfg.cspFrameAncestors}`;
        const existing = headers['content-security-policy'];
        headers['content-security-policy'] = existing ? `${existing}; ${csp}` : csp;
      }
      res.writeHead(upRes.statusCode || 502, headers);
      upRes.on('data', (chunk) => {
        stats.bytesDown += chunk.length;
      });
      pipeBoth(upRes, res);
    }
  );

  upReq.on('error', (err) => {
    log('error', 'upstream request failed', { target, err: err.message });
    sendError(res, 502, `Upstream ${cfg.upstream.host}:${cfg.upstream.port} is not answering (${err.code || err.message}).`);
  });
  if (cfg.upstreamTimeoutMs > 0) {
    upReq.setTimeout(cfg.upstreamTimeoutMs, () => upReq.destroy(new Error('upstream timeout')));
  }
  res.on('close', () => {
    if (!res.writableEnded) upReq.destroy();
  });
  res.on('finish', () => {
    log('debug', 'request', {
      method: req.method,
      path: incoming,
      upstream: target,
      status: res.statusCode,
      ms: Date.now() - started,
    });
  });

  // Bodies stream straight through in both directions: uploads (multipart, TUS,
  // chunked) and downloads are never buffered, so a multi-gigabyte transfer
  // behaves as if the proxy were not there.
  req.on('data', (chunk) => {
    stats.bytesUp += chunk.length;
  });
  pipeBoth(req, upReq);
}

// ---------------------------------------------------------------------------
// Upgrade (WebSocket and anything else): raw pass-through, prefix stripped.
// Handled at the TCP level so no upgrade protocol has to be re-implemented.
// ---------------------------------------------------------------------------

function handleUpgrade(req, clientSocket, head) {
  stats.upgraded += 1;
  const target = upstreamPath(req.url || '/');
  const headers = forwardHeaders(req, { forUpgrade: true });
  const upSocket = net.connect(cfg.upstream.port, cfg.upstream.host, () => {
    const lines = [`${req.method} ${target} HTTP/${req.httpVersion}`];
    for (const [k, v] of Object.entries(headers)) {
      lines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
    }
    upSocket.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head && head.length) upSocket.write(head);
    pipeBoth(clientSocket, upSocket);
    pipeBoth(upSocket, clientSocket);
  });
  upSocket.on('error', (err) => {
    log('warn', 'upgrade failed', { path: req.url, err: err.message });
    clientSocket.destroy();
  });
  clientSocket.on('error', () => upSocket.destroy());
  log('debug', 'upgraded', { path: req.url, upstream: target });
}

// ---------------------------------------------------------------------------
// Listening
// ---------------------------------------------------------------------------

function createServer() {
  const server = http.createServer(handler);
  server.on('upgrade', handleUpgrade);
  server.requestTimeout = cfg.requestTimeoutMs; // 0 = no limit, like the app
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 60000;
  return server;
}

function listenUnix(server) {
  const sockPath = cfg.sock;
  try {
    const st = fs.statSync(sockPath);
    if (st.isSocket()) {
      fs.unlinkSync(sockPath); // a previous run's socket, never a real file
    } else {
      throw new Error(`${sockPath} exists and is not a socket`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      log('error', 'refusing to use the socket path', { sockPath, err: err.message });
      process.exit(1);
    }
  }
  fs.mkdirSync(path.dirname(sockPath), { recursive: true });
  server.listen(sockPath, () => {
    try {
      fs.chmodSync(sockPath, cfg.sockMode);
      if (cfg.sockUid !== null || cfg.sockGid !== null) {
        fs.chownSync(sockPath, cfg.sockUid ?? -1, cfg.sockGid ?? -1);
      }
    } catch (err) {
      log('warn', 'could not set socket ownership', { sockPath, err: err.message });
    }
    log('info', 'listening on unix socket', {
      sockPath,
      mode: cfg.sockMode.toString(8),
      base: cfg.base || '(none)',
      upstream: `${cfg.upstream.host}:${cfg.upstream.port}`,
    });
  });
}

function listenTcp(server) {
  server.listen(cfg.listenPort, cfg.listenHost, () => {
    log('info', 'listening on tcp', {
      addr: `${cfg.listenHost}:${cfg.listenPort}`,
      base: cfg.base || '(none)',
      upstream: `${cfg.upstream.host}:${cfg.upstream.port}`,
    });
  });
}

// ---------------------------------------------------------------------------
// --check: print the effective configuration, then probe the upstream
// ---------------------------------------------------------------------------

function check() {
  process.stdout.write(`${JSON.stringify(healthPayload(), null, 2)}\n`);
  const req = http.request(
    { host: cfg.upstream.host, port: cfg.upstream.port, path: '/healthz', method: 'GET', timeout: 5000 },
    (res) => {
      res.resume();
      process.stdout.write(`upstream /healthz -> ${res.statusCode}\n`);
      process.exit(res.statusCode && res.statusCode < 500 ? 0 : 1);
    }
  );
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', (err) => {
    process.stderr.write(`upstream unreachable: ${err.message}\n`);
    process.exit(1);
  });
  req.end();
}

if (require.main === module) {
  if (process.argv.includes('--check')) {
    check();
  } else {
    if (!cfg.sock && !cfg.listenPort) {
      process.stderr.write('LISTEN_SOCK (or LISTEN_PORT for TCP testing) is required\n');
      process.exit(2);
    }
    if (!cfg.base) log('warn', 'BASEURL is empty: no prefix to strip and no Location to rewrite');
    const servers = [];
    if (cfg.sock) {
      const unixServer = createServer();
      servers.push(unixServer);
      listenUnix(unixServer);
    }
    if (cfg.listenPort) {
      const tcpServer = createServer();
      servers.push(tcpServer);
      listenTcp(tcpServer);
    }
    const shutdown = (signal) => {
      log('info', 'shutting down', { signal });
      for (const server of servers) server.close();
      if (cfg.sock) {
        try {
          fs.unlinkSync(cfg.sock);
        } catch (_) {
          /* already gone */
        }
      }
      setTimeout(() => process.exit(0), 100);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

module.exports = { upstreamPath, prefixPath, normalizeBase };

const http = require('http');
const https = require('https');
const net = require('net');
const url = require('url');

// ---------- 配置 ----------
const TARGET_URL = 'http://127.0.0.1:3080';
const PROXY_PORT = Number(process.env.PROXY_PORT) || 3079;
const PROXY_HTTPS = process.env.PROXY_HTTPS === 'true';
// --------------------------

// ---------- 硬编码证书（PEM） ----------
const CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDwDCCAqigAwIBAgIGEaAEszCfMA0GCSqGSIb3DQEBCwUAMHAxFjAUBgNVBAMT
DTE5Mi4xNjguMS4xMDAxCzAJBgNVBAYTAkNOMRAwDgYDVQQIEwdCZWlqaW5nMRAw
DgYDVQQHEwdCZWlqaW5nMRgwFgYDVQQKEw9JbnRyYW5ldCBTZXJ2ZXIxCzAJBgNV
BAsTAklUMB4XDTI2MDgxNTA5MTQwN1oXDTI4MDgxNDA5MTQwN1owcDEWMBQGA1UE
AxMNMTkyLjE2OC4xLjEwMDELMAkGA1UEBhMCQ04xEDAOBgNVBAgTB0JlaWppbmcx
EDAOBgNVBAcTB0JlaWppbmcxGDAWBgNVBAoTD0ludHJhbmV0IFNlcnZlcjELMAkG
A1UECxMCSVQwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCgBBDnRF77
p/pKtdv0FZjPwL3WLkF1l71BOLY78DxelPflWpeM5eCnq2D5f6K7lM5qTREgfZrI
6l3WVXJHTNq/sikmL5pL5Dwv5o57zvT9QHTsBbfhsKnkfk49kdnXnnPvdpXbFU4A
zmW/qDGWF4/aR4USV1sNvwKnpjPt+O41ar6Yg0vcc453YjUxIx9tIvTmLcMyS2NP
O3QsTSRZMwxI8UCuOXI+hyiyTnvFSz2JlP+0h1RLlt3ALw6S9UVbuXDiMhKNupGD
lS/6v8M25A5+DHRu2wpD3NLrgFsEV0xSiNMUx4YyIKYkJ4pdRCl2bD/E/AN2dXFR
QPfL2aIPiFovAgMBAAGjYDBeMAkGA1UdEwQCMAAwCwYDVR0PBAQDAgWgMB0GA1Ud
JQQWMBQGCCsGAQUFBwMBBggrBgEFBQcDAjAlBgNVHREEHjAchwTAqAFkggxzZXJ2
ZXIubG9jYWyCBnNlcnZlcjANBgkqhkiG9w0BAQsFAAOCAQEAJ+KL3P/6rqoowD4H
146H9REbVEluvEneRi5m65DYx61GVRkotx/4GGl67UZeccgAnPxT43udTFyYFwYl
V7NMQ5iiSBEt+Nk/hB8M/Rsp+5JuVjakqW3m0tRZvO4BOkXXzauqXoH1urhT6XFR
lDBfeTOdFMhhL8StwadoUpoFwS2KHKGb5qk25HgljWUzCKQ5l8+Qlwk4dCuZuttE
r3EGf4hjEzzFlfqQYJtFR7SI/E1t4qigPSe9P25f8ZtMn/sSvLc6jnfH2s3IY7K1
blREumLF9++9jGLN4djzT0CDRz86x0luMotfwv+u3WCuHO6QD0y9zbYsDH/HTjiP
r5iAsA==
-----END CERTIFICATE-----`;

const KEY_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEAoAQQ50Re+6f6SrXb9BWYz8C91i5BdZe9QTi2O/A8XpT35VqX
jOXgp6tg+X+iu5TOak0RIH2ayOpd1lVyR0zav7IpJi+aS+Q8L+aOe870/UB07AW3
4bCp5H5OPZHZ155z73aV2xVOAM5lv6gxlheP2keFEldbDb8Cp6Yz7fjuNWq+mINL
3HOOd2I1MSMfbSL05i3DMktjTzt0LE0kWTMMSPFArjlyPocosk57xUs9iZT/tIdU
S5bdwC8OkvVFW7lw4jISjbqRg5Uv+r/DNuQOfgx0btsKQ9zS64BbBFdMUojTFMeG
MiCmJCeKXUQpdmw/xPwDdnVxUUD3y9miD4haLwIDAQABAoIBAFB/WyWMnp/I9D/r
VthmmPZChv2dTW7jw+BwsDRc+XG3TTIDLeRCrI6Mx38cN3hYNrMBTBFlPp2+UTCG
0bOOtSjkbpD4N43gJmsOeDVOeq6AY5FsmwGdhwochC2zFrzCyJ35sQ+CmzgKnOMa
sL9J4SM1AXulmHfE1IgUM2GO7f7Ogcg8SnwKDmnKIDeU8tN+kZ8brx5vv0tdD/ca
sEJyyF0Kht8IlinVnxBkA9hAN77QLNsJJHRusKr477F3CP1rDsvg/yYfFX0GF/N0
xbIbiefZKklDcEW4b96l7lrh2azTCNyCGNMuzCZWxLJ70fWvSUVKV/mNzXPbcuvU
F1m8fWkCgYEA9feVNeznZlg3MNd/PEzYZ2EHeScnSjaA7T6yqqnX3tTK+h8LaXg1
qiKDNV6yYgPinPnNNKA/kiTwtNcu2CO1rcm4GPSaxq3Smg6jvr3dipYZYBMA2d13
OQVrv5ylYqSAANvDDvkUZU5wO8uLxPUejLDCuW6yqz5CnxjZRo0aw5MCgYEApor4
bENThCjylPUlXP4JjVwMOIZoy8H0E+XnQmHsr1aK/JY4EKEkTbp0IMclH0U/v2jE
0+E0bCrJu4dnNdQWlRzPlRyuvSUK7GE+odAxKubwhhphjMUHlFya4opdD87P7jAE
rjggdHJlbxAwwpqHmEExcdF8cn7rEWpiXUAKKHUCgYAHznPN4lb1yJb31d8T6txz
a4DxN2znzhMJdJP3FqzjRZ2rkpCqKEaLv8yqRPckZTssAEGjCfL6kHGTS8EQ2xFJ
Er3lDN5cr+efPBe2VhBR9bGYewHr6DuAc8uXqUEWgGIPpOnr77vV+0dUnoExHxZ5
IKMNf5XsGW3D3uYGdzQCQQKBgD4sT0WLdNg3uSfmxMYMiGBfZqiLdP/sLkRnZYgg
qo1ij4xwQAnlPnpOCyBZeABOh9fbMu+ueTWQW7NIfz1XKf8MvGn8RTeTZpqMSyd5
Y4GSqWRG4Pf+bi/yylecM9W87V8MShMIHQWb10Y5ExrzOX+bhuvour67puHfh00s
pR4pAoGAG0LPuec4ZZvgR1zze7HBubF2qFFxYgX4jmP2nvjLCz71jFXpo2DkxO5C
/67gcYYVQ1ho04z3JHNAmW6efC9BCbtc+vegGKF7UiB05Q6+yBOJfunIkNs0RCN+
OdS1WwmxoX+L20UDO54wr4f4McLGNaI7qg9d1b5vbYCFej0Oen4=
-----END RSA PRIVATE KEY-----`;
// --------------------------------------------------

const target = new URL(TARGET_URL);
const targetHost = target.hostname;
const targetPort = target.port || (target.protocol === 'https:' ? 443 : 80);

// ---------- 前端注入：在非安全上下文 + 非 loopback 反代场景下修复 DSH 前端 ----------
// 背景（详见 REVERSE_PROXY_ADAPTATION.md）：
//   3) crypto.randomUUID() 仅在 HTTPS / localhost 可用，HTTP 局域网 IP 访问会抛
//      "randomUUID is not a function" 并使控制台报错；
//   5) DSH "打开配置文件" 按钮调用桌面 GUI 编辑器，无头 NAS 上无法执行，需 CSS 隐藏；
//   4) DSH 的 dsh-client-connection 模块依 location.hostname 判定 connection.isLoopback，
//      经非 loopback 主机反代访问时 isLoopback=false，settings scope 退化为 "memory" 模式，
//      插件配置卡片静默渲染为空白。
// 注入脚本做三件事，全部在浏览器端，仅影响前端渲染路径；后端仍走 loopback socket +
// Host 栅栏，安全边界不变（DSH discussion #2403）：
//   a) Polyfill window.crypto.randomUUID（仅缺失时）；
//   b) 包装 dsh-client-connection 的 apply()，在 ctx.provide("connection", ...) 那一刻
//      强制把 connection.isLoopback 置为 true（附带 ctx.get 兜底）；
//   c) 【本脚独有，Go 版未做】包装 dsh-client-ui-settings 的
//      SettingsScopeController.prototype.enqueue，让 settings scope 即便处于 "memory"
//      模式也真正执行读写——作为 b) 之外的最终兜底，不依赖 isLoopback 判定。
const BOOTSTRAP_SCRIPT = `(function () {
  // (a) crypto.randomUUID 兼容补丁：HTTP 非安全上下文下 window.crypto.randomUUID 缺失
  var c = window.crypto;
  if (c && typeof c.randomUUID !== "function" && typeof c.getRandomValues === "function") {
    var getRand = c.getRandomValues.bind(c);
    var uuid = function () {
      var b = new Uint8Array(16);
      getRand(b);
      b[6] = (b[6] & 15) | 64;   // version 4
      b[8] = (b[8] & 63) | 128;  // variant 10
      var h = Array.from(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
      return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
    };
    var install = function (target) {
      try {
        Object.defineProperty(target, "randomUUID", { configurable: true, writable: true, value: uuid });
        return typeof target.randomUUID === "function";
      } catch (_) { return false; }
    };
    if (!install(c) && Object.getPrototypeOf(c)) install(Object.getPrototypeOf(c));
  }

  var wrapped = false;
  function wrapLoader(loader) {
    if (wrapped || !loader || typeof loader.load !== "function") return;
    wrapped = true;
    var origLoad = loader.load;
    loader.load = function (entry) {
      try {
        if (entry && typeof entry.id === "string" && typeof entry.factory === "function") {
          if (entry.id === "@deepseek-ai/dsh-client-connection") {
            // (b) 强制 connection.isLoopback=true
            var connFactory = entry.factory;
            entry.factory = function (require) {
              var exports = connFactory.apply(this, arguments);
              try {
                var origApply = exports && exports.apply;
                if (typeof origApply === "function") {
                  exports.apply = function (ctx) {
                    var patched = false;
                    try {
                      var origProvide = ctx && ctx.provide;
                      if (typeof origProvide === "function") {
                        ctx.provide = function (name, value) {
                          if (name === "connection" && value) {
                            try { Object.defineProperty(value, "isLoopback", { value: true, configurable: true, writable: true }); } catch (_e) {}
                            patched = true;
                          }
                          return origProvide.apply(ctx, arguments);
                        };
                      }
                    } catch (_e) {}
                    var r = origApply.apply(this, arguments);
                    try {
                      if (!patched) {
                        var conn = ctx && ctx.get && ctx.get("connection");
                        if (conn) Object.defineProperty(conn, "isLoopback", { value: true, configurable: true, writable: true });
                      }
                    } catch (_e) {}
                    return r;
                  };
                }
              } catch (_e) {}
              return exports;
            };
          } else if (entry.id === "@deepseek-ai/dsh-client-ui-settings") {
            // (c) 兜底：即便 settings scope 退化为 "memory" 也强制执行读写
            var setFactory = entry.factory;
            entry.factory = function (require) {
              var exports = setFactory.apply(this, arguments);
              try {
                var Ctl = exports && exports.SettingsScopeController;
                if (Ctl && Ctl.prototype && typeof Ctl.prototype.enqueue === "function") {
                  var origEnqueue = Ctl.prototype.enqueue;
                  Ctl.prototype.enqueue = function (operation) {
                    if (this.disposed) return Promise.resolve();
                    var self = this;
                    var task = this.tail.then(function () {
                      if (self.disposed) return;
                      return operation();
                    });
                    this.tail = task.catch(function () {});
                    return task;
                  };
                }
              } catch (_e) {}
              return exports;
            };
          }
        }
      } catch (_e) {}
      return origLoad.apply(loader, arguments);
    };
  }
  // 若加载器已安装则立即包装；否则拦截其赋值时刻（时机无关）。
  if (window.__ModuleLoader__) wrapLoader(window.__ModuleLoader__);
  try {
    Object.defineProperty(window, "__ModuleLoader__", {
      configurable: true,
      get: function () { return window.__proxy_boot_loader_store__; },
      set: function (v) {
        window.__proxy_boot_loader_store__ = v;
        try { wrapLoader(v); } catch (_e) {}
      }
    });
  } catch (_e) {}
})();`;

/** 在 HTML <head> 之后注入：隐藏无头按钮的样式 + 引导脚本。 */
function injectIntoHtml(body) {
  // 隐藏无头 NAS 上无法执行的桌面级 "打开配置文件" 按钮（REVERSE_PROXY_ADAPTATION.md 问题 5）
  const style = `<style>[data-slot="settings.action"] { display: none !important; }</style>`;
  const script = `<script>${BOOTSTRAP_SCRIPT}</script>`;
  const inject = style + script;
  const lower = body.toLowerCase();
  const idx = lower.indexOf('<head');
  if (idx !== -1) {
    const closeIdx = lower.indexOf('>', idx);
    if (closeIdx !== -1) {
      const pos = closeIdx + 1;
      return `${body.slice(0, pos)}${inject}${body.slice(pos)}`;
    }
  }
  return `${inject}${body}`;
}

// ---------- 后端可用性检查 ----------
/** 快速检查一次（超时 500ms） */
function quickCheckBackend(timeout = 500) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(targetPort, targetHost);
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Timeout'));
    }, timeout);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve();
    });
    socket.once('error', (err) => {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    });
  });
}

/** 持续等待后端可用（用于 WebSocket） */
async function waitForBackend(maxWaitMs = 10000) {
  const start = Date.now();
  let first = true;
  while (Date.now() - start < maxWaitMs) {
    try {
      await quickCheckBackend(2000); // 每次检查2秒超时
      if (first) console.log('[Proxy] Backend is available.');
      return;
    } catch (_) {
      if (first) {
        console.log('[Proxy] Backend not ready, waiting...');
        first = false;
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }
  throw new Error(`Backend ${targetHost}:${targetPort} not available after ${maxWaitMs}ms`);
}

// ---------- JS bundle 兜底改写（对齐 Go 版 rewriteJsBundle） ----------
// 把客户端 JS 中 `connection.isLoopback ? "host" : "memory"` 静态替换为 "host"，
// 让 settings scope 即便在运行时 hook 未及时生效时也以 host 模式读写。
// 覆盖四种引号/空格组合，与 Go 版 bytes.ReplaceAll 列表一致。
function rewriteJsBundle(buf) {
  const pairs = [
    ['connection.isLoopback ? "host" : "memory"', '"host"'],
    [`connection.isLoopback ? 'host' : 'memory'`, `'host'`],
    ['connection.isLoopback?"host":"memory"', '"host"'],
    [`connection.isLoopback?'host':'memory'`, `'host'`],
  ];
  let s = buf.toString('utf8');
  for (const [from, to] of pairs) {
    if (s.indexOf(from) !== -1) s = s.split(from).join(to);
  }
  return Buffer.from(s, 'utf8');
}

// ---------- 代理转发逻辑 ----------
function forwardRequest(req, res) {
  const targetReqUrl = new URL(req.url, TARGET_URL);
  const options = {
    hostname: targetHost,
    port: targetPort,
    path: targetReqUrl.pathname + targetReqUrl.search,
    method: req.method,
    headers: { ...req.headers }
  };

  // 仅当客户端原有该标头时才改写（与 Go 版一致：避免凭空添加 Sec-Fetch-Site 触发上游严格校验）
  if (options.headers['sec-fetch-site'] !== undefined) {
    options.headers['sec-fetch-site'] = 'same-origin';
  }
  options.headers.host = `${targetHost}:${targetPort}`;
  // 仅当存在 Origin 时改写为目标同源（防止上游 CSRF 校验失败并保留特权访问能力）
  if (options.headers.origin !== undefined) {
    options.headers.origin = `http://${options.headers.host}`;
  }

  // 透传客户端真实信息（便于后端日志/审计），对齐 Go 版 SetXForwarded()
  options.headers['x-forwarded-for'] = (req.socket.remoteAddress || '').replace(/^::ffff:/, '') + (options.headers['x-forwarded-for'] ? `, ${options.headers['x-forwarded-for']}` : '');
  options.headers['x-forwarded-host'] = req.headers.host || '';
  options.headers['x-forwarded-proto'] = (req.socket.server && req.socket.server instanceof https.Server) ? 'https' : 'http';

  // 请求上游以非压缩方式返回，方便代理层注入与改写（identity 不会触发任何编码协商）
  options.headers['accept-encoding'] = 'identity';

  const proxyReq = http.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    headers['access-control-allow-origin'] = '*';
    const ct = (headers['content-type'] || '').toLowerCase();
    const statusCode = proxyRes.statusCode;
    const isHtml = ct.includes('text/html');
    const isJs = ct.includes('javascript') || ct.includes('text/javascript');
    const isSse = ct.startsWith('text/event-stream');
    // 若上游/外部层无视 identity 仍压缩了，则不能注入改写（会得到乱码），直接透传
    const enc = (headers['content-encoding'] || '').toLowerCase();
    const encoded = enc === 'gzip' || enc === 'br' || enc === 'deflate' || enc === 'zstd';

    // SSE 流式响应：禁用缓冲/缓存，删 Content-Length（与 Go 版 ModifyResponse 一致）
    if (isSse) {
      headers['cache-control'] = 'no-cache, no-transform';
      headers['x-accel-buffering'] = 'no';
      delete headers['content-length'];
      res.writeHead(statusCode, headers);
      proxyRes.pipe(res);
      return;
    }

    // 压缩响应或非 2xx 的 HTML 直接透传，避免误改
    const canInjectHtml = isHtml && statusCode >= 200 && statusCode < 300 && !encoded;
    const canRewriteJs = isJs && statusCode >= 200 && statusCode < 300 && !encoded;

    if (canInjectHtml || canRewriteJs) {
      const chunks = [];
      proxyRes.on('data', (c) => chunks.push(c));
      proxyRes.on('end', () => {
        let body = Buffer.concat(chunks);
        if (canInjectHtml) {
          // 放宽注入条件：只看上游 Content-Type 是否为 text/html，不再要求客户端 accept 含 html
          // （首屏 SSR / 浏览器预取可能不发标准 Accept，Go 版亦如此）
          body = Buffer.from(injectIntoHtml(body.toString('utf8')), 'utf8');
        } else if (canRewriteJs) {
          // JS 兜底改写：把 connection.isLoopback ? "host" : "memory" 静态替换为 "host"
          // （REVERSE_PROXY_ADAPTATION.md 问题 4 的最后一道防线，覆盖运行时 hook 来不及生效的边界）
          body = rewriteJsBundle(body);
        }
        headers['content-length'] = String(body.length);
        res.writeHead(statusCode, headers);
        res.end(body);
      });
      proxyRes.on('error', (err) => {
        console.error(`[Proxy Response Error] ${err.message}`);
        if (!res.headersSent) {
          res.writeHead(502, { 'content-type': 'text/plain' });
          res.end('Proxy error');
        }
      });
    } else {
      res.writeHead(statusCode, headers);
      proxyRes.pipe(res);
    }
  });

  proxyReq.on('error', (err) => {
    console.error(`[HTTP Proxy Error] ${err.message}`);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Proxy error');
  });

  req.pipe(proxyReq);
}

// ---------- HTTP 请求处理 ----------
async function requestHandler(req, res) {
  // 快速检测后端（500ms 超时）
  try {
    await quickCheckBackend(500);
    // 后端已就绪，直接转发
    forwardRequest(req, res);
  } catch (_) {
    // 后端未启动，返回等待页面（自动刷新）
    const url = req.url;
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Refresh': `2; url=${url}`   // 每2秒刷新
    });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>服务启动中</title>
      <style>body{font-family:sans-serif;text-align:center;padding:50px;}</style>
      </head>
      <body>
        <h1>⏳ 服务正在启动中，请稍候...</h1>
        <p>后端服务 ${targetHost}:${targetPort} 尚未就绪，页面将每隔2秒自动重试。</p>
        <p><small>如果长时间无响应，请检查后端服务是否正常运行。</small></p>
      </body>
      </html>
    `);
  }
}

// ---------- WebSocket 升级处理 ----------
async function upgradeHandler(req, socket, head) {
  try {
    await waitForBackend(10000);
  } catch (err) {
    console.error(`[Proxy WebSocket] ${err.message}`);
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
    return;
  }

  const targetReqUrl = new URL(req.url, TARGET_URL);
  targetReqUrl.protocol = 'ws:';

  const proxySocket = net.connect(targetPort, targetHost, () => {
    const headers = { ...req.headers };
    ['origin', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest']
      .forEach(h => delete headers[h]);
    headers.host = `${targetHost}:${targetPort}`;

    let reqLine = `GET ${targetReqUrl.pathname}${targetReqUrl.search} HTTP/1.1\r\n`;
    reqLine += Object.keys(headers)
      .map(k => `${k}: ${headers[k]}`)
      .join('\r\n') + '\r\n\r\n';

    proxySocket.write(reqLine);
    if (head && head.length) proxySocket.write(head);
    socket.pipe(proxySocket).pipe(socket);
  });

  proxySocket.on('error', (err) => {
    console.error(`[WebSocket Proxy Error] ${err.message}`);
    socket.destroy();
  });
  socket.on('error', (err) => {
    console.error(`[Client Socket Error] ${err.message}`);
    proxySocket.destroy();
  });
}

// ---------- 创建服务器 ----------
let server;
if (PROXY_HTTPS) {
  try {
    server = https.createServer({ key: KEY_PEM, cert: CERT_PEM }, requestHandler);
    console.log('🔒 HTTPS 模式已启用（使用内嵌证书）');
  } catch (err) {
    console.error(`❌ 证书格式异常: ${err.message}，将降级为 HTTP`);
    server = http.createServer(requestHandler);
    console.log('🔓 HTTP 模式已启用（降级）');
  }
} else {
  server = http.createServer(requestHandler);
  console.log('🔓 HTTP 模式已启用（环境变量 PROXY_HTTPS 未设为 true）');
}

server.on('upgrade', upgradeHandler);

server.listen(PROXY_PORT, () => {
  const protocol = (PROXY_HTTPS && server instanceof https.Server) ? 'https' : 'http';
  console.log(`✅ Proxy listening on ${protocol}://localhost:${PROXY_PORT}`);
  console.log(`➡️  Forwarding to ${TARGET_URL}`);
});

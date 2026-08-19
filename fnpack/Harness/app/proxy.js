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

// ---------- 前端注入：绕过 DSH 前端的 loopback 门，修复经反代访问时插件设置页空白 ----------
// 背景：DSH 的 dsh-web-ui 前端在 Settings -> Plugins 页面，仅当页面 hostname 是
// loopback（localhost / 127/8 / [::1]）时，连接层 connection.isLoopback 才为 true，
// 进而 settings scope 才会以 "host" 模式读写主机设置。经本反代以非 loopback 主机名
// （如 NAS 局域网 IP）访问时 isLoopback=false，settings scope 退化为 "memory" 模式，
// 永远不调用 settings API，插件配置卡片静默渲染为空白。
// 这里通过向 index.html 注入一段引导脚本，在浏览器端做两件事：
//   1) 包装 dsh-client-connection 模块 apply()，把 connection.isLoopback 强制置为 true
//      （在 ctx.provide 注入 connection 的那一刻改，兼有 ctx.get 兜底）；
//   2) 包装 dsh-client-ui-settings 模块的 SettingsScopeController.prototype.enqueue，
//      让 settings scope 即便处于 "memory" 模式也真正执行读写（等价于把 "memory"
//      改成 "host"），保证插件设置页不再空白——这是兜底，不依赖 isLoopback 判定。
// 仅影响前端渲染路径；后端仍走 loopback socket + Host 栅栏，安全边界不变
// （DSH discussion #2403）。
const BOOTSTRAP_SCRIPT = `(function () {
  var wrapped = false;
  function wrapLoader(loader) {
    if (wrapped || !loader || typeof loader.load !== "function") return;
    wrapped = true;
    var origLoad = loader.load;
    loader.load = function (entry) {
      try {
        if (entry && typeof entry.id === "string" && typeof entry.factory === "function") {
          if (entry.id === "@deepseek-ai/dsh-client-connection") {
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
            var setFactory = entry.factory;
            entry.factory = function (require) {
              var exports = setFactory.apply(this, arguments);
              try {
                var Ctl = exports && exports.SettingsScopeController;
                if (Ctl && Ctl.prototype && typeof Ctl.prototype.enqueue === "function") {
                  var origEnqueue = Ctl.prototype.enqueue;
                  Ctl.prototype.enqueue = function (operation) {
                    if (this.disposed) return Promise.resolve();
                    var task = this.tail.then(async function () { if (this.disposed) return; await operation(); });
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

/** 在 HTML 正文的 <head> 之后注入引导脚本。 */
function injectIntoHtml(body) {
  const script = `<script>${BOOTSTRAP_SCRIPT}</script>`;
  const head = body.indexOf('<head>');
  if (head !== -1) {
    return `${body.slice(0, head + 6)}${script}${body.slice(head + 6)}`;
  }
  return `${script}${body}`;
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

  ['sec-fetch-site'].forEach(h => delete options.headers[h]);
  options.headers.host = `${targetHost}:${targetPort}`;
  options.headers.origin = `http://${options.headers.host}`;

  // 请求上游以非压缩方式返回，方便注入脚本（DSH 自身不压缩，这里显式声明以防外部层）
  if (options.headers['accept-encoding'] !== undefined) {
    delete options.headers['accept-encoding'];
  }
  options.headers['accept-encoding'] = 'identity';

  const proxyReq = http.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    headers['access-control-allow-origin'] = '*';
    const isHtml = /text\/html/i.test(headers['content-type'] || '');
    if (isHtml && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
      // 收集 HTML 正文并注入引导脚本（改动 body 后需重写 content-length）
      const chunks = [];
      proxyRes.on('data', (c) => chunks.push(c));
      proxyRes.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        if (req.method === 'GET' && req.headers['accept'] && /html/i.test(req.headers['accept'])) {
          body = injectIntoHtml(body);
        }
        const out = Buffer.from(body, 'utf8');
        headers['content-length'] = String(out.length);
        res.writeHead(proxyRes.statusCode, headers);
        res.end(out);
      });
      proxyRes.on('error', (err) => {
        console.error(`[Proxy Response Error] ${err.message}`);
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('Proxy error');
      });
    } else {
      res.writeHead(proxyRes.statusCode, headers);
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

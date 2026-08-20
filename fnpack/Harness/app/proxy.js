const http = require('http');
const net = require('net');
const url = require('url');

// ---------- 配置 ----------
const TARGET_URL = 'http://127.0.0.1:3080';
const PROXY_PORT = Number(process.env.PROXY_PORT) || 3079;
// --------------------------


const target = new URL(TARGET_URL);
const targetHost = target.hostname;
const targetPort = target.port || (target.protocol === 'https:' ? 443 : 80);

// ---------- 鉴权（内嵌登录页） ----------
// 密码来源：环境变量 PROXY_PASSWORD。
//   要求：长度 >= 8 位，且同时含 字母[A-Za-z]、数字[0-9] 与 标点。
//   标点白名单（排除 shell/JSON/SQL/HTML 注入类危险符号）：
//     . , - _ : / @ % ^ = + ~
//   危险标点（禁用）：` " ' \ $ ; | & * ? ( ) < > { } [ ] ! # 等
// 登录态：cookie harness_session，值 "<过期unix秒>.<HMAC-SHA256(password,过期秒) hex>"
//   HttpOnly + SameSite=Lax + Path=/；有效期 2 小时（启动时不滑动续期，保持简单）
// 无密码（env 未设或校验不过）时进入"无鉴权直通"模式，日志告警，不再拦截。
const crypto = require('crypto');
const AUTH_COOKIE = 'harness_session';
const AUTH_TTL = 2 * 60 * 60;            // 2 小时，单位秒
const AUTH_LOGIN_PATH = '/_login';
const AUTH_LOGOUT_PATH = '/_logout';

// 标点白名单（安全标点）。其余 ASCII 标点视为危险而拒绝。
const SAFE_PUNCT = new Set('.,-_:/@%^=+~'.split(''));

function classifyChar(ch) {
  const code = ch.charCodeAt(0);
  if (code >= 48 && code <= 57) return 'digit';            // 0-9
  if (code >= 65 && code <= 90) return 'letter';            // A-Z
  if (code >= 97 && code <= 122) return 'letter';           // a-z
  if (SAFE_PUNCT.has(ch)) return 'safe_punct';
  if (code < 128) return 'unsafe';                          // 其余 ASCII 标点/控制符
  return 'other';                                            // 中文/全角等非 ASCII 字符
}

function validatePassword(pwd) {
  if (typeof pwd !== 'string' || pwd.length < 8) {
    return { ok: false, reason: '长度不足 8 位' };
  }
  let hasLetter = false, hasDigit = false, hasPunct = false;
  for (const ch of pwd) {
    const k = classifyChar(ch);
    if (k === 'letter') hasLetter = true;
    else if (k === 'digit') hasDigit = true;
    else if (k === 'safe_punct') hasPunct = true;
    else if (k === 'unsafe') {
      return { ok: false, reason: `含危险标点 "${ch}"（仅允许 . , - _ : / @ % ^ = + ~）` };
    }
  }
  if (!hasLetter) return { ok: false, reason: '缺少字母' };
  if (!hasDigit) return { ok: false, reason: '缺少数字' };
  if (!hasPunct) return { ok: false, reason: '缺少标点（仅允许 . , - _ : / @ % ^ = + ~）' };
  return { ok: true };
}

const AUTH_PASSWORD = process.env.PROXY_PASSWORD || '';
const AUTH_VALID = validatePassword(AUTH_PASSWORD);

// 鉴权总开关：环境变量 PROXY_AUTH。默认开启（关闭需显式置 false/0/no/off/空）。
// 关闭后：isAuthed 恒返回 true（HTTP/WS 守卫全失效），登录/登出路由不接管（登录页不暴露）。
// 密码校验仍执行以在日志中提示合规性，但不影响拦截行为。
const AUTH_ENABLED = (() => {
  const raw = process.env.PROXY_AUTH;
  const v = (raw != null ? raw : 'true').trim().toLowerCase();
  return !['false', '0', 'no', 'off', ''].includes(v);
})();

if (!AUTH_ENABLED) {
  console.log('🔓 [Auth] PROXY_AUTH=false，鉴权已禁用——任何人可访问，登录页不暴露。');
} else if (AUTH_PASSWORD && !AUTH_VALID.ok) {
  console.error(`❌ [Auth] 密码校验失败: ${AUTH_VALID.reason}——鉴权未启用，任何人都可访问。请修正 PROXY_PASSWORD 后重启，或设 PROXY_AUTH=false 显式禁用。`);
} else if (!AUTH_PASSWORD) {
  console.warn('⚠️  [Auth] 未设置 PROXY_PASSWORD——鉴权未启用，任何人都可访问。');
} else {
  console.log('🔒 [Auth] 密码校验通过，登录鉴权已启用。');
}

function hmacToken(password, expireTs) {
  return crypto.createHmac('sha256', password).update(String(expireTs)).digest('hex');
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/** 校验请求是否已登录。返回 true=已登录。鉴权禁用或无密码直通模式恒返回 true。 */
function isAuthed(req) {
  if (!AUTH_ENABLED) return true;      // 总开关关闭
  if (!AUTH_VALID.ok) return true;     // 无鉴权直通
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[AUTH_COOKIE];
  if (!raw) return false;
  const dot = raw.indexOf('.');
  if (dot === -1) return false;
  const expireTs = parseInt(raw.slice(0, dot), 10);
  const token = raw.slice(dot + 1);
  if (!Number.isFinite(expireTs) || expireTs <= Math.floor(Date.now() / 1000)) return false;
  // 用 timingSafeEqual 防时序侧信道
  const expected = Buffer.from(hmacToken(AUTH_PASSWORD, expireTs), 'hex');
  const got = Buffer.from(token, 'hex');
  if (expected.length !== got.length) return false;
  return crypto.timingSafeEqual(expected, got);
}

/** 校验 next 参数：必须以 / 开头且不能指向登录页本身（防 open-redirect）。 */
function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) return '/';
  if (next === AUTH_LOGIN_PATH || next.startsWith(AUTH_LOGIN_PATH + '?')) return '/';
  return next;
}

const LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>登录 - Harness Proxy</title>
<style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;
    align-items:center;justify-content:center;font-family:-apple-system,
    "Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
    background:#0f172a;color:#e2e8f0}
  .card{width:340px;padding:32px 28px;background:#1e293b;border:1px solid #334155;
    border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.4)}
  h1{margin:0 0 8px;font-size:20px;font-weight:600;text-align:center;color:#f8fafc}
  .sub{margin:0 0 24px;font-size:13px;color:#94a3b8;text-align:center}
  label{display:block;margin:0 0 6px;font-size:13px;color:#cbd5e1}
  input{width:100%;padding:10px 12px;border:1px solid #475569;border-radius:8px;
    background:#0f172a;color:#f8fafc;font-size:14px;outline:none}
  input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.25)}
  button{width:100%;margin-top:18px;padding:11px;border:none;border-radius:8px;
    background:#6366f1;color:#fff;font-size:14px;font-weight:600;cursor:pointer;
    transition:background .15s}
  button:hover{background:#4f46e5}
  .err{margin-top:14px;padding:10px 12px;background:#7f1d1d;border:1px solid #991b1b;
    border-radius:8px;font-size:13px;color:#fecaca;text-align:center;word-break:break-all}
</style></head><body><div class="card">
  <h1>登录</h1><p class="sub">访问受密码保护</p>
  <form method="POST" action="${AUTH_LOGIN_PATH}">
    <label for="pw">密码</label>
    <input id="pw" name="password" type="password" autofocus required
           autocomplete="current-password">
    <button type="submit">登录</button>
  </form>
  __ERROR_SLOT__
</div></body></html>`;

function serveLoginPage(res, errMsg) {
  const body = LOGIN_PAGE_HTML.replace('__ERROR_SLOT__',
    errMsg ? `<div class="err">${errMsg.replace(/[&<>"]/g, s => ({'&':'&','<':'<','>':'>','"':'"'}[s]))}</div>` : '');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

/** 处理登录/登出路径。返回 true 表示已处理（调用方不再继续）。鉴权禁用时恒返回 false。 */
function handleAuthRoutes(req, res) {
  if (!AUTH_ENABLED) return false;   // 总开关关闭：不接管登录/登出路由，请求落入后端转发
  const u = new URL(req.url, 'http://x');
  const pathname = u.pathname;

  if (pathname === AUTH_LOGIN_PATH) {
    if (req.method === 'GET') {
      serveLoginPage(res, null);
      return true;
    }
    if (req.method === 'POST') {
      // 读取 body
      let body = '';
      req.on('data', c => { body += c; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        const form = new URLSearchParams(body);
        const pwd = form.get('password') || '';
        if (!AUTH_VALID.ok) {
          // 无密码模式下也走登录页：提示未启用鉴权
          serveLoginPage(res, '鉴权未启用（PROXY_PASSWORD 未设或非法），无需登录。');
          return;
        }
        if (pwd !== AUTH_PASSWORD) {
          serveLoginPage(res, '密码错误');
          return;
        }
        const expireTs = Math.floor(Date.now() / 1000) + AUTH_TTL;
        const token = hmacToken(AUTH_PASSWORD, expireTs);
        const cookieVal = `${expireTs}.${token}`;
        const next = safeNext(u.searchParams.get('next') || '/');
        res.writeHead(302, {
          'set-cookie': `${AUTH_COOKIE}=${cookieVal}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_TTL}`,
          'location': next,
        });
        res.end();
      });
      req.on('error', () => { if (!res.headersSent) { res.writeHead(400); res.end('Bad Request'); } });
      return true;
    }
    res.writeHead(405, { 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return true;
  }

  if (pathname === AUTH_LOGOUT_PATH) {
    res.writeHead(302, {
      'set-cookie': `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      'location': AUTH_LOGIN_PATH,
    });
    res.end();
    return true;
  }

  return false;
}

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
  options.headers['x-forwarded-proto'] = 'http';

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
  // 登录/登出路由优先处理（不需要后端就绪，也不需要鉴权）
  if (handleAuthRoutes(req, res)) return;

  // 快速检测后端（500ms 超时）
  let backendReady = false;
  try {
    await quickCheckBackend(500);
    backendReady = true;
  } catch (_) { backendReady = false; }

  // 后端未就绪：返回等待页面（自动刷新）。等待页不鉴权，否则状态都看不到会死锁
  if (!backendReady) {
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
    return;
  }

  // 后端已就绪：执行鉴权守卫
  if (!isAuthed(req)) {
    // 原址相对路径（去 query 再编码），作为 next 参数；非 GET 不带 next（无意义）
    const u = new URL(req.url, 'http://x');
    const next = req.method === 'GET' ? safeNext(u.pathname + u.search) : '/';
    const loginUrl = `${AUTH_LOGIN_PATH}?next=${encodeURIComponent(next)}`;
    res.writeHead(302, { 'location': loginUrl });
    res.end();
    return;
  }

  // 已登录或无鉴权模式：转发到后端
  forwardRequest(req, res);
}

// ---------- WebSocket 升级处理 ----------
async function upgradeHandler(req, socket, head) {
  // 鉴权守卫：未登录直接拒绝 WebSocket 升级
  // （浏览器无法对 ws 升级做 302 跳转，这里返回 401 让前端 ws onclose/onerror 自行处理）
  if (!isAuthed(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

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
const server = http.createServer(requestHandler);

server.on('upgrade', upgradeHandler);

server.listen(PROXY_PORT, () => {
  console.log(`✅ Proxy listening on http://localhost:${PROXY_PORT}`);
  console.log(`➡️  Forwarding to ${TARGET_URL}`);
});


/**
 * 成长工作台 · 抖音文案在线提取后端
 * ------------------------------------------------------------
 * 纯 Node 内置模块实现（无需 npm install），兼容 Node 18+。
 *
 * 功能：
 *   GET /api/douyin?url=<抖音分享链接>
 *     -> 跟随短链重定向 -> 抓取视频页 -> 提取视频文案(desc)/作者/话题
 *   返回 JSON: { ok, title, copy, author, tags, finalUrl, error }
 *
 * 说明：
 *   - 抖音对未登录请求常返回验证码页，此时 copy 可能为空。
 *     可把登录态 Cookie 通过请求头 `x-douyin-cookie` 传入（见 README）。
 *   - 本服务仅做"尽力而为"的提取 + 容错，真实可用性取决于运行网络与抖音风控。
 *
 * 运行：
 *   node server.js            # 默认端口 3000
 *   PORT=8080 node server.js  # 自定义端口
 */

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 3000;

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---------- 网络请求（跟随重定向） ----------
function fetchText(target, { redirects = 6, cookie = '', ua = MOBILE_UA } = {}) {
  return new Promise((resolve, reject) => {
    const visit = (u, depth) => {
      if (depth > redirects) return reject(new Error('重定向次数过多'));
      let reqUrl;
      try { reqUrl = new URL(u); } catch (e) { return reject(new Error('无效的链接')); }
      const lib = reqUrl.protocol === 'http:' ? http : https;
      const req = lib.get({
        hostname: reqUrl.hostname,
        path: reqUrl.pathname + reqUrl.search,
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Cookie': cookie || ''
        }
      }, res => {
        const status = res.statusCode;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, u).href;
          return visit(next, depth + 1);
        }
        if (status !== 200) { res.resume(); return reject(new Error('抖音返回状态 ' + status)); }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', c => { data += c; });
        res.on('end', () => resolve({ status, body: data, finalUrl: u }));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => req.destroy(new Error('请求超时')));
    };
    visit(target, 0);
  });
}

// ---------- HTML 实体解码 ----------
function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// ---------- 把 JS 字符串字面量还原成 JSON 对象 ----------
function decodeRenderData(raw) {
  let s = raw || '';
  try {
    s = s
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\'/g, "'")
      .replace(/\\u003c/gi, '<')
      .replace(/\\u003e/gi, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x27;/g, "'");
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

// ---------- 递归按 key 查找 ----------
function findByKey(obj, key, maxDepth) {
  maxDepth = maxDepth || 14;
  if (!obj || typeof obj !== 'object' || maxDepth <= 0) return undefined;
  if (Array.isArray(obj)) {
    for (const it of obj) {
      const r = findByKey(it, key, maxDepth - 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  for (const k of Object.keys(obj)) {
    if (k === key) return obj[k];
    const r = findByKey(obj[k], key, maxDepth - 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

// ---------- 从 HTML 提取抖音信息 ----------
function extractDouyinInfo(html, finalUrl) {
  const result = { title: '', copy: '', author: '', tags: [], finalUrl: finalUrl || '' };

  // 1) og:title
  let m = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i);
  if (m) result.title = decodeEntities(m[1]);

  // 2) meta description
  m = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
  const metaDesc = m ? decodeEntities(m[1]) : '';

  // 3) __RENDER_DATA__（抖音视频页主数据结构）
  let rdDesc = '', rdAuthor = '', rdTitle = '';
  const rd = html.match(/window\.__RENDER_DATA__\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (rd) {
    const obj = decodeRenderData(rd[1]);
    if (obj) {
      rdDesc = findByKey(obj, 'desc') || '';
      rdAuthor = findByKey(obj, 'author') || '';
      if (rdAuthor && typeof rdAuthor === 'object') rdAuthor = rdAuthor.nickname || rdAuthor.uniqueId || '';
      rdTitle = findByKey(obj, 'title') || '';
    }
  }

  // 4) 选用更完整的文案
  let copy = '';
  if (rdDesc && typeof rdDesc === 'string' && rdDesc.length > 0) copy = rdDesc;
  else if (metaDesc) copy = metaDesc;
  // 去掉抖音简介前缀「#在抖音，记录美好生活# 作者：xxx 的作品」
  copy = copy.replace(/^#在抖音[^\n]*#\s*/, '').replace(/^作者[：:][^\n]*的作品\s*/, '').trim();
  result.copy = copy;
  if (!result.title) result.title = (typeof rdTitle === 'string' && rdTitle) ? rdTitle : (copy ? copy.slice(0, 24) : '');
  result.author = typeof rdAuthor === 'string' ? rdAuthor : '';

  // 5) 话题标签
  const tagRe = /#([^#\s@,，。.！!?？]+)/g;
  let tm;
  while ((tm = tagRe.exec(result.copy)) !== null) result.tags.push(tm[1]);
  result.tags = [...new Set(result.tags)];

  return result;
}

// ---------- HTTP 服务 ----------
const server = http.createServer((req, res) => {
  // CORS（允许前端跨域调用）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-douyin-cookie');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;

  if (path === '/' || path === '/api') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>成长工作台 · 抖音文案提取后端</h2>' +
      '<p>用法：<code>GET /api/douyin?url=&lt;抖音链接&gt;</code></p>' +
      '<p>可带请求头 <code>x-douyin-cookie</code> 传入登录态 Cookie。</p>');
    return;
  }

  if (path === '/api/douyin') {
    const target = parsed.query.url;
    if (!target || !/^https?:\/\//.test(target)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: false, error: '缺少有效 url 参数' }));
    }
    const cookie = req.headers['x-douyin-cookie'] || '';
    fetchText(target, { cookie })
      .then(({ body, finalUrl }) => {
        const info = extractDouyinInfo(body, finalUrl);
        if (!info.copy) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          return res.end(JSON.stringify({
            ok: false,
            error: '未提取到文案（抖音可能返回了验证码页，请传入登录态 Cookie，或手动粘贴文案）',
            title: info.title,
            author: info.author,
            finalUrl: info.finalUrl
          }));
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, ...info }));
      })
      .catch(err => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message || '抓取失败' }));
      });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log('成长工作台抖音后端已启动: http://localhost:' + PORT);
  });
}

module.exports = { fetchText, extractDouyinInfo, decodeRenderData, findByKey };

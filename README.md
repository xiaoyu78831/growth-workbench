# 成长工作台（Growth Workbench）

一个**纯前端单文件 PWA** 个人成长记录小程序，含：首页概览、每日计划、运动打卡、灵感小本（支持抖音文案提取 + 爆款思维导图）、热点二创、内容复盘、资料库、数据备份恢复。

数据全部存浏览器 `localStorage`，开箱即用、可离线。

---

## 目录结构

```
growth-workbench/
├── index.html        # 主程序（全部 UI + 逻辑内联，直接用浏览器打开即可运行）
├── sw.js             # Service Worker（离线缓存，当前 v11）
├── manifest.json     # PWA 配置
├── icon.svg / icon-192.png / icon-512.png / apple-touch-icon.png
├── start-server.bat  # 本地预览脚本（Windows）
├── server.js         # 【可选】抖音文案在线提取后端（Node，无依赖）
└── README.md
```

> ⚠️ `.git/` 目录含 GitHub 令牌，已刻意不纳入发布包；请勿把 `.git/` 发给他人。

---

## 一、前端（PWA）运行

**方式 A：直接打开**
双击 `index.html` 用浏览器打开即可（部分浏览器要求通过 http 访问才能用 Service Worker，建议用方式 B）。

**方式 B：本地静态服务器**
```bash
# 任选其一
python -m http.server 8080
# 或
npx serve .
```
然后浏览器访问 `http://localhost:8080/`。

**部署到公网（GitHub Pages 示例）**
把 `index.html / sw.js / manifest.json / 图标` 推到仓库并开启 Pages 即可。

---

## 二、抖音文案提取（两种模式）

### 模式 1：离线 · 生成文案（默认可用）
在灵感新增页的「🎵 抖音文案 / 链接」框里**粘贴抖音【完整文案】**（标题 + 描述 + 话题，可含链接），点「📝 生成文案」即提取你粘贴的全部文字。

> 说明：抖音 App「复制链接」分享语本身只含视频标题，真正的整段口播/描述不在链接里，所以务必把视频下方完整描述一起粘贴。

### 模式 2：在线 · 自动抓取（需后端）
配置后端后，点「🌐 在线抓取」可让后端自动去抖音页面爬出视频文案（desc / 作者 / 话题）。

配置步骤：
1. 启动后端（见第三节）。
2. 在 App「我的 → 设置 → 抖音在线提取 → 后端地址」填入后端地址，例如 `http://你的服务器:3000`（手机访问需填电脑/服务器的局域网 IP 或可公网访问的地址）。
3. 灵感页粘贴抖音分享链接，点「🌐 在线抓取」。

---

## 三、抖音文案后端（server.js）

纯 Node 内置模块实现，**无需 `npm install`**，兼容 Node 18+。

```bash
node server.js            # 默认端口 3000
PORT=8080 node server.js  # 自定义端口
```

接口：
```
GET /api/douyin?url=<抖音分享链接>
```
返回示例：
```json
{
  "ok": true,
  "title": "视频标题",
  "copy": "完整视频文案…",
  "author": "作者昵称",
  "tags": ["干货", "教程"],
  "finalUrl": "https://www.douyin.com/video/xxx"
}
```

### 关于抖音反爬（重要）
- 抖音对**未登录请求**常返回验证码页，此时 `ok:false` 且 `copy` 为空。
- 解决：把登录态 Cookie 通过请求头 `x-douyin-cookie` 传入，例如：
  ```bash
  curl 'http://localhost:3000/api/douyin?url=<链接>' -H 'x-douyin-cookie: sessionid=xxxx; passport_csrf_token=yyyy'
  ```
  （Cookie 从抖音网页版登录后的开发者工具 → Application → Cookies 获取）
- 后端仅做"尽力而为"的提取 + 容错，真实可用性取决于运行网络与抖音风控。

---

## 四、给 Codex（或后续开发）的接手说明

本项目目标是做成一个完整的"成长类小程序"。当前已实现并验证：
- ✅ 首页完成率 / 运动统计联动
- ✅ 运动打卡（新增运动、图标、打卡窗口、每日重置）
- ✅ 灵感：抖音文案提取（链接前后全部收集）、爆款思维导图（SVG 图片）
- ✅ 抖音文案**后端自动抓取**（server.js，单测通过）

可继续优化的方向：
1. **后端健壮性**：抖音签名（`a_bogus` / `X-Bogus`）、滑动验证自动过、多账号 Cookie 池。
2. **字幕级提取**：下载视频后用 ASR（如 Whisper）识别口播，做到"粘贴链接即出完整字幕"。
3. **后端部署**：当前前端部署在静态 Pages，Node 后端需另部署（容器 / Serverless / 常驻进程），并配置 CORS 白名单（已在后端放开 `*`）。
4. **移动端体验**：PWA 加到桌面、iOS 添加到主屏幕引导。
5. **数据同步**：当前纯 localStorage，可加云同步（需后端 + 用户体系）。

---

## 五、安全提示

- 仓库使用的 GitHub PAT（classic）建议尽快在 GitHub → Settings → Developer settings 中 **Revoke** 撤销，避免泄露。
- 不要把 `.git/` 目录外发给他人。

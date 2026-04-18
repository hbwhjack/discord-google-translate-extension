# Discord Google Translate Overlay

给 **Discord 网页版** 用的 Chrome 扩展：自动把**服务器频道里的聊天消息**翻译成中文，并把译文用黄色显示在原文下面。

> 现在默认 **不翻译私信（DM）**，只翻译服务器里的频道消息。

## 功能

- 自动翻译 Discord 网页版频道消息
- 使用 **Google Translate**
- 译文显示在原文下方，黄色高亮
- 按消息结构分块翻译，尽量保留 `Q:` / `A:` / 段落结构
- 自动处理 Discord 动态加载、滚动加载、新消息和编辑后的消息
- 使用 `chrome.storage.local` 做**持久化缓存**
- 缓存默认 **90 天（约 3 个月）** 过期并自动清理
- 默认不翻译私信（`/channels/@me/...`），但可在设置里打开
- 提供 **popup 快速设置**
- 支持 **服务器 / 频道白名单黑名单**
- 支持 **设置与缓存导出 / 导入**

## 适用范围

- 站点：`https://discord.com/*`
- 浏览器：Chrome / Chromium 系浏览器
- 语言：默认翻译到 `zh-CN`

## 安装

1. 打开 Chrome
2. 进入 `chrome://extensions`
3. 打开右上角 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择这个项目目录：
   - `/home/hbwhjack/.hermes/workspace/discord-google-translate-extension`

## 使用方法

1. 打开 Discord 网页版：`https://discord.com/channels/...`
2. 进入一个**服务器频道**（不是私信，除非你在设置页里打开了私信翻译）
3. 插件会自动扫描当前消息并插入译文
4. 新消息、滚动加载的旧消息、被编辑的消息也会继续处理

### 设置页

在 `chrome://extensions` 里打开本扩展的 **扩展程序详情**，进入 **扩展程序选项**，可以修改：

- 目标语言
- 是否翻译私信（DM）
- 服务器白名单 / 黑名单
- 频道白名单 / 黑名单
- 清空翻译缓存
- 导出设置与缓存
- 导入设置与缓存

### Popup

点击浏览器工具栏里的扩展图标，可以快速修改：

- 目标语言
- 是否翻译私信（DM）
- 跳转到完整设置页

如果刚更新过插件：

1. 去 `chrome://extensions`
2. 对本扩展点击 **Reload**
3. 回 Discord 页面按 **Ctrl + Shift + R** 硬刷新

## 缓存说明

缓存存放在扩展的 `chrome.storage.local` 里，**现在是分片存储**，不是把所有内容都塞进一个大对象。

主要键名：

- `translationCacheMeta`
- `translationCacheBucket:00` 到 `translationCacheBucket:63`
- 旧版单对象键 `translationCache` 会在加载时自动迁移掉

单个桶里的结构大概是：

```json
{
  "translationCacheBucket:17": {
    "zh-CN::hello": {
      "translation": "你好",
      "updatedAt": 1770000000000
    }
  }
}
```

查看方法：

1. 打开扩展的 DevTools
2. 进入 **Application**
3. 找到 **Extension storage** → **Local**
4. 查看 `translationCacheMeta` 和 `translationCacheBucket:*`

或者在 Console 里执行：

```js
chrome.storage.local.get().then(console.log)
```

## 项目结构

- `manifest.json` — Chrome MV3 清单
- `src/content.js` — 内容脚本：扫描消息、翻译、分片缓存、渲染译文
- `src/common.js` — 文本清洗与通用工具
- `src/cache.js` — 缓存工具函数（Node 测试用模块）
- `src/cache-runtime.js` — 浏览器侧分片缓存运行时
- `tests/` — Node 内置测试

## 开发

安装依赖（如果你需要跑本地测试）：

```bash
source ~/.nvm/nvm.sh
npm test
```

当前测试使用 Node 内置测试运行器：

```bash
node --test
```

## 已知限制

- 依赖 Discord 当前 DOM 结构。Discord 改版后，可能需要调整选择器。
- 使用的是 Google 非官方公开接口，稳定性看 Google 脸色，不保证永久可用。
- 复杂富文本、超长嵌套内容的结构保留仍然不是百分百完美，但已经比简单整段翻译稳得多。

## 后续可做

- 设置页：切换目标语言
- 白名单/黑名单服务器与频道
- 手动清缓存按钮
- 排除代码块、链接、用户名等内容
- 缓存统计与导出

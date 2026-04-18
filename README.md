# Discord Google Translate Overlay

一个给 **Discord 网页版** 用的 Chrome 扩展：

- 自动扫描聊天消息
- 调用 **Google Translate** 翻译成中文（默认 `zh-CN`）
- 把译文插在原文下面
- 译文颜色为黄色，效果接近你给的截图

## 文件结构

- `manifest.json` — Chrome MV3 清单
- `src/background.js` — 调 Google 翻译接口
- `src/content.js` — 注入到 Discord 页面，抓消息并插入译文
- `src/common.js` — 公共工具函数
- `tests/common.test.js` — Node 内置测试

## 安装

1. 打开 Chrome
2. 进入 `chrome://extensions`
3. 打开右上角 **开发者模式**
4. 点 **加载已解压的扩展程序**
5. 选择这个目录：
   - `/home/hbwhjack/.hermes/hermes-agent/workspace/discord-google-translate-extension`

## 使用

1. 打开网页版 Discord：`https://discord.com/channels/...`
2. 进入任意聊天频道
3. 扩展会自动监听新消息并翻译
4. 译文会显示在原文下方，颜色为黄色

## 实现说明

- 翻译接口：`https://translate.googleapis.com/translate_a/single?client=gtx...`
- 使用 `chrome.storage.local` 做持久化缓存，默认缓存 **3 个月（90 天）**，过期自动清理
- 后台脚本也保留内存缓存，减少同一次会话里的重复读取
- 内容脚本会监听 DOM 变化，所以滚动加载和新消息也会处理
- 如果消息被编辑，脚本会重新比对原文并刷新译文

## 注意

- 这是基于 Discord 当前网页结构做的选择器匹配。Discord 改版后，可能需要微调选择器。
- 使用的是 Google 非官方公开接口，稳定性看 Google 脸色，不保证永远可用。
- 当前默认目标语言是简体中文；如果你要，我可以下一步再加弹窗设置目标语言/开关自动翻译/排除代码块。 

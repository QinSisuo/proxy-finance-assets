# Loon：三个 AI 的节点专项诊断

用途：对指定节点分别访问 ChatGPT、Claude、Gemini，解释各入口收到的响应，辅助定位“同一个节点 A 服务能用、B 服务不能用”。不把通用网站延迟或匿名页面 HTTP 200 当作已解锁。

## 入口

在支持 Generic 节点菜单的 Loon 版本中，在节点列表长按节点，选择「AI 三服务诊断」。全部请求使用该节点，不改变任何策略组的选择。iPhone 的实际显示待核实；Mac 0.4.0(991) 已识别这四项，但未找到可确认的手动执行入口，不能把右键菜单作为已验证操作。

也提供 ChatGPT、Claude、Gemini 三个单独诊断项。若从脚本列表直接执行且没有节点上下文，则分别读取同名策略组当前选中的节点；Loon 未返回默认节点时，先确认该组确实存在，再让 Loon 使用该组的当前选择，并明确标注“策略组”。组不存在或无法核实则停止，不默默改走默认路由。

脚本源文件为本仓库 `scripts/ai-service-check.js`，部署版本为 [`d29c75e`](https://github.com/QinSisuo/proxy-finance-assets/commit/d29c75ed15cd7fccdbce8f83428a15671bfbb760)。部署使用 GitHub 固定提交的 HTTPS 原始文件地址，避免 Mac 与 iPhone 本地文件路径差异；iCloud Scripts 中保留一份源码副本。已观察到 Mac 0.4.0(991) 的本地路径验收未产生启动日志，因此不能仅凭资源出现在列表中判定加载成功。

## 具体请求

| 服务 | 匿名 HTTPS 请求 | 判断内容 |
|---|---|---|
| ChatGPT | `https://chatgpt.com/`、`https://ios.chat.openai.com/` | 网页验证挑战、移动入口拒绝、明确地区错误、超时等；分别展示两项 |
| Claude | `https://claude.ai/` | 官方地区不可用重定向、验证挑战、网页响应等 |
| Gemini | `https://gemini.google.com/app?hl=en` | 网页响应、实际登录/验证跳转、可见限区错误标题、页面地区标记 |

脚本仅 GET，不读取或发送账号 Cookie、API Key、聊天内容，不发送测试对话。禁用自动 Cookie、校验证书。同站 HTTPS 跳转最多跟随两次且保留节点；跨站跳转只展示，不自动访问。

单请求 8 秒超时，整体脚本 35 秒。结果不持久化，只有手动运行才发请求。

## 如何理解结果

- 明确地区限制：实际官方限制页重定向、结构化地区错误或匹配到可见限区标题。
- 遇到验证挑战：服务要求额外验证，脚本无法确认 App 是否也被拦。
- 访问被拒绝：HTTP 403/451，但原因未确定。`type=dc` 只原样解释为响应类型，不武断归因于节点类型。
- 收到服务网页：收到带对应服务标题的网页，**不是已经验证账号或聊天**。
- 超时、DNS、TLS、限流分别显示，不混同地区限制。
- Gemini 页面地区字段是非公开结构，可能改变；多个冲突值或缺失显示未知，不按地区码自动判定可用。脚本不使用过时的 `45631641` 功能开关作为解锁结论。

## Test-URL 调整

仅 Gemini 组使用 `http://gemini.google.com/generate_204`，匿名 HEAD 和 GET 实测均直接 204，比旧 HTTP 首页的 301 更适合测目标主机的连接延迟。这仍不是解锁检测。

ChatGPT 和 Claude 没有找到能可靠判定服务可用性的单个 HTTP 端点，保留当前 Test-URL；使用上述 HTTPS 诊断补足针对性。全局测试地址、超时和节点选择保持原样。

## 依据

- [Loon Script API](https://nsloon.app/docs/Script/script_api/)：节点上下文、指定 node 的请求、毫秒超时和结果。
- [Loon Generic 示例](https://raw.githubusercontent.com/Loon0x00/LoonExampleConfig/master/Script/generic_example.js)：节点名称及 HTML 结果。
- [Cloudflare 官方挑战页标识](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)：`cf-mitigated: challenge`。
- [Claude 官方地区不可用页](https://claude.com/app-unavailable-in-region)。
- [RegionRestrictionCheck](https://github.com/lmc999/RegionRestrictionCheck/blob/main/check.sh)：用于定位检测端点；未照搬它的“未出现禁止字样即成功”判断。
- [Gemini 地区提取参考](https://github.com/shenguanqing/unlock-checker/blob/main/src/checks/gemini.js)：仅参考网页字段，未采用硬编码地区封锁表。
- [Gemini 官方地区说明](https://support.google.com/gemini/answer/13575153?hl=en)：网页/移动端与账号条件有区别，不能仅凭出口地区判断所有功能。

## 本地检查

`node --test tests/ai-service-check.test.cjs` 验证分类、节点固定、Cookie/证书选项、重定向、HTML 转义和单次结果回调。实际服务结果仍取决于运行时所选节点；手机端加载和报错复现需另外核实。

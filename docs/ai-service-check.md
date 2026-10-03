# Loon：三个 AI 的节点专项诊断

用途：对指定节点分别访问 ChatGPT、Claude、Gemini，解释各入口收到的响应，辅助定位“同一个节点 A 服务能用、B 服务不能用”。不把通用网站延迟或匿名页面 HTTP 200 当作已解锁。

## 入口

### 浏览器诊断页

为 Mac 提供无需 Generic 菜单的浏览器入口 `http://loon-ai.test/`：

- 首页：展示配置的比较节点，不发起检测。
- 「同节点对比」：每个指定节点访问三个服务，返回对照表和分项详情。
- 「当前策略组」：分别检测原有三个服务组的当前选择。
- 「最近记录」：只读取本机最近 10 次结果。

此地址由 Loon 的 Request Script 直接生成响应，不安装或监听本地 HTTP 服务器。需要 Loon 正在处理浏览器流量。只匹配精确的 HTTP 域名；配置增加 `loon-ai.test = 127.0.0.1` 的 Host 映射及一条该域名 DIRECT 规则。HTTP 入口不需 MitM，AI 服务检测仍使用 HTTPS 并校验证书。结果页禁止缓存和外部资源加载。

安装时将一项 Request Script 放入 `[Script]`：

```text
request if ${url} ~= /^http:\/\/loon-ai\.test\//i then script("固定提交的 HTTPS 脚本地址", "service=all&nodes=编码后的数组") with tag="AI 浏览器诊断", timeout=35
```

浏览器入口只采用配置中的比较节点，忽略网址中的节点参数。手机端是否能打开，仍需使用同一配置实际验收。

### Generic 入口

在支持 Generic 节点菜单的 Loon 版本中，在节点列表长按节点，选择「AI 三服务诊断」。全部请求使用该节点，不改变任何策略组的选择。iPhone 的实际显示待核实；Mac 0.4.0(991) 已识别这四项，但未找到可确认的手动执行入口，不能把右键菜单作为已验证操作。

也提供 ChatGPT、Claude、Gemini 三个单独诊断项。若从脚本列表直接执行且没有节点上下文，则分别读取同名策略组当前选中的节点；Loon 未返回默认节点时，先确认该组确实存在，再让 Loon 使用该组的当前选择，并明确标注“策略组”。组不存在或无法核实则停止，不默默改走默认路由。

### 固定节点对比与记录

新增「AI 同节点对比」参数示例：

```text
service=all&node=节点名称（URL 编码）
service=all&nodes=JSON 数组（URL 编码）&timeout=12&retry=1
service=history
```

`node` 指定一个节点，`nodes` 指定最多三个节点的 JSON 数组；两者都使用 `encodeURIComponent` 编码名称或数组。每个节点均检测三个服务，不切换策略组。长按节点传来的上下文也使用固定节点；若只能解析到策略组而无法固定具体节点，则不执行该项比较。没有上下文的原有四项继续分别检测同名服务策略组，报告明确区分两种模式。

「AI 最近检测」只读取当前设备脚本存储，不发送 HTTP 请求。最近 10 次记录只含检测时间、节点名称、入口、分类、状态码、耗时及每次尝试，不保存响应正文、Cookie 或账号信息。`history=false` 可关闭本次保存；存储不可用会报告保存失败。

报告顶部按节点排列 ChatGPT 网页、Claude、Gemini 的结果，ChatGPT 移动辅助入口单独展示。不会用辅助入口 403 合并得出“整个 ChatGPT 不可用”。每个结果包含 ISO 8601 UTC 检测时间、出口标签和请求记录。若是由 Loon 解析策略组的模式，出口仍标为策略组，不冒充已固定具体节点。

脚本源文件为本仓库 `scripts/ai-service-check.js`。配置部署仍使用 GitHub 固定提交的 HTTPS 原始文件地址；升级时同步替换各项源地址。iCloud Scripts 中保留一份源码副本。Mac 的本地路径验收此前未产生启动日志，不能仅凭资源出现在列表中判断加载成功。

## 具体请求

| 服务 | 匿名 HTTPS 请求 | 判断内容 |
|---|---|---|
| ChatGPT | `https://chatgpt.com/`、`https://ios.chat.openai.com/` | 网页验证挑战、移动辅助入口拒绝、明确地区错误、超时等；分别展示两项 |
| Claude | `https://claude.ai/` | 官方地区不可用重定向、验证挑战、网页响应等 |
| Gemini | `https://gemini.google.com/app?hl=en` | 网页响应、实际登录/验证跳转、可见限区错误标题、页面地区标记 |

脚本仅 GET，不读取或发送账号 Cookie、API Key、聊天内容，不发送测试对话。禁用自动 Cookie、校验证书。同站 HTTPS 跳转最多跟随两次且保留节点；跨站跳转只展示，不自动访问。

默认每次请求 12 秒，可通过 `timeout` 调整为 3–20 秒。仅超时、连接中断等网络错误允许重试一次；DNS、证书错误和所有 HTTP 响应不重试，`retry=0` 可关闭重试。同站跳转和重试共享每个检测项 28 秒预算，整体脚本仍为 35 秒。迟到的回调不会重复结束检测。

四个入口不变：用于说明失败原因，并未新增声称能证明“可聊天”的端点。要验证针对性，需固定同一节点，再用已登录 App 实际发消息，核对脚本结果与 App 的具体错误。

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

`node --test tests/ai-service-check.test.cjs` 验证分类、节点固定、跨节点对比、Cookie/证书选项、重试条件与预算、重定向、历史记录、HTML 转义和单次结果回调。实际服务结果仍取决于运行时所选节点；手机端加载和报错复现需另外核实。

2026-10-03：新版 21 项测试通过。以下为升级前的实测记录：Mac Loon 0.4.0(991) 已通过临时单次触发验证 HTTPS 源码加载及四个实际请求；隧道日志确认请求按指定节点/策略组选择转发，脚本正常结束。临时触发配置已清理。此验证确认脚本引擎执行，不代表已验证 Mac Generic 手动菜单或 iPhone 菜单，也不代表各 AI 已能登录、聊天。

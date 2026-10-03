# Loon：三个 AI 的使用前预检证据

用途：对指定节点分别访问 ChatGPT、Claude、Gemini，解释各入口收到的响应，辅助定位“同一个节点 A 服务能用、B 服务不能用”。不把通用网站延迟或匿名页面 HTTP 200 当作已解锁。

**目标状态更正：** 用户需要的是使用前的服务可用性检测。已有浏览器入口、匿名诊断和事后真实对话验收，不代表该目标已实现；当前脚本也没有把结果接入策略组原生 Test-URL。原生测速受控实验、候选链接与进一步预检所需证据见 [AI Test-URL 专项调查](ai-test-url-investigation.md)。

V3 增加候选节点和服务选择、服务级汇总、OpenAI 辅助接口结构检查、Claude 出口地区辅助检查及 Gemini 当前限区措辞。**尚无已验证的服务整体正向判据**：辅助接口通过不会被提升为“AI 可用”。这是可在使用前运行的证据工具，不能当作完整可用性筛选器。

## 入口

### 浏览器诊断页

为 Mac 实现无需 Generic 菜单的浏览器入口 `http://198.19.255.254/`，可选域名别名为 `http://loon-ai.test/`。IP 入口不依赖 DNS；首页、任务提交、后台执行、完成状态和历史读取均已通过真实 Loon 请求及 Edge 界面验收。手机端仍待实测：

- 首页：展示候选节点与服务选择器，不发起服务检测。
- 首页新增「候选节点／服务」选择器：读取三个 AI 组及其嵌套组的节点，选择后提交单节点、单服务或三服务预检。列表最多 200 个节点，读取最多 5 秒；不能完整读取时明确提示。不会修改策略选择。
- 「同节点对比」：提交固定节点任务，一分钟内开始；后台检测后页面自动显示对照表和分项详情。
- 「当前策略组」：分别检测原有三个服务组的当前选择。
- 「最近记录」：只读取本机最近 10 次结果。

此地址由 Loon 的 Request Script 直接生成响应，不安装或监听本地 HTTP 服务器。需要 Loon 正在处理浏览器流量。只匹配上述精确 HTTP 域名或 IP；配置增加 `loon-ai.test = 198.19.255.254` 的 Host 映射及该域名、该 IP 的 DIRECT 规则。HTTP 入口不需 MitM，AI 服务检测仍使用 HTTPS 并校验证书。结果页禁止缓存和外部资源加载。

Mac 0.4.0(991) 中，在 Request Script 内直接进行 HTTP 检测曾阻塞到整体超时。因此浏览器入口改为本机任务队列：Request Script 只提交任务或读取结果，一项每分钟触发的 Cron 只在存在待执行任务时进行检测。没有任务时不访问 AI 服务。重复点击会复用当前任务；等待超过 5 分钟的任务不会执行。页面每 5 秒读取状态，完成后停止刷新。Generic 入口仍直接执行。

安装时将 Request Script 与后台任务项一起放入 `[Script]`：

```text
request if ${url} ~= /^http:\/\/(?:loon-ai\.test|198\.19\.255\.254)\//i then script("固定提交的 HTTPS 脚本地址", "service=all&nodes=编码后的数组") with tag="AI 浏览器诊断", timeout=35
cron "* * * * *" then script("固定提交的 HTTPS 脚本地址", "service=worker") with tag="AI诊断后台任务", timeout=35
```

原有 `/compare` 只采用配置中的比较节点，忽略网址中的节点参数。新增 `/check` 只接受当前候选列表中的节点和固定服务名称；不接受任意节点描述、额外或重复参数。提交页显示实际排队任务的节点及服务。手机端是否能打开，仍需使用同一配置实际验收。

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

报告顶部按节点排列 ChatGPT、Claude、Gemini 的服务级汇总，分项证据在下面分别展示。主入口有确切限区证据时显示“明确受限”；主入口拒绝且原因未知时显示“本次入口请求被拒”；其余显示“无法确认可用”。不会用辅助入口 403 合并得出“整个 ChatGPT 不可用”。每个结果包含 ISO 8601 UTC 检测时间、出口标签和请求记录。若是由 Loon 解析策略组的模式，出口仍标为策略组，不冒充已固定具体节点。

脚本源文件为本仓库 `scripts/ai-service-check.js`。配置部署仍使用 GitHub 固定提交的 HTTPS 原始文件地址；升级时同步替换各项源地址。iCloud Scripts 中保留一份源码副本。Mac 的本地路径验收此前未产生启动日志，不能仅凭资源出现在列表中判断加载成功。

## 具体请求

| 服务 | 匿名 HTTPS 请求 | 判断内容 |
|---|---|---|
| ChatGPT | `https://chatgpt.com/`、`https://ios.chat.openai.com/`、`https://api.openai.com/compliance/cookie_requirements` | 网页和移动入口拒绝、明确地区错误、挑战；辅助接口必须是 HTTP 200、JSON 类型且包含布尔 `cookie_consent_required`，才显示“辅助接口预检通过” |
| Claude | `https://claude.ai/`、`https://claude.ai/cdn-cgi/trace` | 官方限区重定向和挑战；trace 必须是 HTTP 200、纯文本、`h=claude.ai` 和唯一两字母 `loc`，只报告地区信息 |
| Gemini | `https://gemini.google.com/app?hl=en` | 网页响应、实际登录/验证跳转、可见限区错误标题、页面地区标记 |

脚本仅 GET，不读取或发送账号 Cookie、API Key、聊天内容，不发送测试对话。禁用自动 Cookie、校验证书。同站 HTTPS 跳转最多跟随两次且保留节点；跨站跳转只展示，不自动访问。

默认每次请求 12 秒，可通过 `timeout` 调整为 3–20 秒。仅超时、连接中断等网络错误允许重试一次；DNS、证书错误和所有 HTTP 响应不重试，`retry=0` 可关闭重试。同站跳转和重试共享每个检测项 28 秒预算，整体脚本仍为 35 秒。迟到的回调不会重复结束检测。

每个节点共六项匿名入口检查。新增辅助接口是局部响应证据，不声称能证明“可聊天”。本轮只检查服务接口结构及分类，不打开 AI App、发送测试对话或替用户挑选节点。

## 如何理解结果

- 明确地区限制：实际官方限制页重定向、结构化地区错误或匹配到可见限区标题。
- 辅助接口预检通过：OpenAI 辅助接口返回预期 JSON。布尔值 true 和 false 都是合法响应，分别表示是否需要 Cookie 同意；不据此推断国家、网页或 App 可用。
- 收到出口地区信息：仅验证 Claude 域名的 Cloudflare trace 格式；不把国家代码映射成服务可用结论。
- 遇到验证挑战：服务要求额外验证，脚本无法确认 App 是否也被拦。
- 访问被拒绝：HTTP 403/451，但原因未确定。`type=dc` 只原样解释为响应类型，不武断归因于节点类型。
- 收到服务网页：收到带对应服务标题的网页，**不是已经验证账号或聊天**。
- 超时、DNS、TLS、限流分别显示，不混同地区限制。Apple URL 错误中的响应解码/解析失败单独显示；未知错误不假定为网络故障。错误说明保留有限摘要，移除 UserInfo 和嵌入网址，不存储原始错误对象。
- Gemini 页面地区字段是非公开结构，可能改变；多个冲突值或缺失显示未知，不按地区码自动判定可用。脚本不使用尚未验证当前含义的 `45631641` 功能开关作为解锁结论。

Gemini 标题中的 `isn’t currently supported in your country. Stay tuned!` 与 `isn’t available in your country` 均可识别；只检查当前服务的标题，排除 script、template、style 和注释中的预加载文本。当前 Google 网页端支持名单列有香港、澳门，部分社区脚本仍把 HKG、MAC 硬编码为不支持；不能采用这种排除表。网页与移动端条件需分开看。

## Test-URL 调整

仅 Gemini 组使用 `http://gemini.google.com/generate_204`。前轮匿名 HEAD 和 GET 曾均直接返回 204，因此当时只作为目标主机连接测速调整；后续专项调查中 HEAD 出现空响应而 GET 仍为 204。方法和运行路径有差异，不将这个地址作为稳定的 Gemini 可用性或解锁判据。

ChatGPT 和 Claude 没有找到能可靠判定服务可用性的单个 HTTP 端点，保留当前 Test-URL；上述 HTTPS 诊断只补充服务响应证据。该脚本不修改全局测试地址、超时或节点选择。用户自行选择节点；后续优化目标是使用前预检，不能把现有匿名诊断描述为已经实现了可用性筛选。

## 历史误报对照

以下实际对照仅用于记录此前诊断方法的局限，不是用户要求的使用前检测方案。后续工作应验证自动预检判据，不再以替用户挑选一个已知可用节点或发送测试对话为交付目标。

2026-10-03 的 Mac 实测中，一个出口收到 Gemini HTTP 200 和服务标题，但已登录浏览器明确显示「Gemini isn’t currently supported in your country. Stay tuned!」。更换该服务组的出口后，同一账号进入聊天界面并返回测试回复。这个例子说明，即便页面地区字段与提示相符，也只能记录该次证据，不能把非公开地区字段当作可用性判据。

另一项实测中，Loon 脚本请求 ChatGPT 出现原生 TLS 错误，但同一出口下浏览器安全连接正常，实际对话收到回复；系统 HTTPS 客户端也完成证书校验。TLS 错误的具体根因尚未查明，不能据此判定 App 不可用，也不应关闭证书校验。最终验收使用的出口分别完成了 ChatGPT、Gemini 网页端和 Claude 桌面端的短对话；这些结果只代表当时的设备、账号与出口。

## 依据

- [Apple URL 响应解析错误](https://developer.apple.com/documentation/foundation/nsurlerrorcannotparseresponse-c.enum.case)：同时核对本机 SDK `NSURLError.h` 的错误码；解析失败与连接中断分开处理。
- [Loon Script API](https://nsloon.app/docs/Script/script_api/)：节点上下文、指定 node 的请求、毫秒超时和结果。
- [Loon Generic 示例](https://raw.githubusercontent.com/Loon0x00/LoonExampleConfig/master/Script/generic_example.js)：节点名称及 HTML 结果。
- [Cloudflare 官方挑战页标识](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)：`cf-mitigated: challenge`。
- [Claude 官方地区不可用页](https://claude.com/app-unavailable-in-region)。
- [RegionRestrictionCheck](https://github.com/lmc999/RegionRestrictionCheck/blob/main/check.sh)：用于定位检测端点；未照搬它的“未出现禁止字样即成功”判断。
- [Gemini 地区提取参考](https://github.com/shenguanqing/unlock-checker/blob/main/src/checks/gemini.js)：仅参考网页字段，未采用硬编码地区封锁表。
- [Gemini 官方地区说明](https://support.google.com/gemini/answer/13575153?hl=en)：网页/移动端与账号条件有区别，不能仅凭出口地区判断所有功能。

## 本地检查

`node --test tests/ai-service-check.test.cjs` 验证分类、节点固定、跨节点对比、Cookie/证书选项、重试条件与预算、重定向、历史记录、后台任务队列与闲置行为、HTML 转义和单次结果回调。实际服务结果仍取决于运行时所选节点；手机端加载和报错复现需另外核实。

2026-10-03：25 项测试通过。Mac Loon 0.4.0(991) 已实测完成首页 HTTP 200、任务提交 HTTP 202、后台接单与两节点八项请求、完成状态 HTTP 200、历史读取 HTTP 200；执行器在没有待执行任务时不发起服务请求。Edge 已完成首页、同节点对比、当前策略组检测、自动显示结果及历史页面的界面验收。三个服务的实际短对话均已收到回复，Loon 日志核对了对应服务的出口。源码缓存与仓库版本字节一致，临时触发配置已清理。Mac Generic 菜单与 iPhone 仍待另行验收。

V3 本地检查：34 项通过，覆盖辅助响应结构、主入口与辅助结果隔离、当前 Gemini 限区措辞、嵌套候选列表、指定节点/服务排队、未知节点和异常参数拒绝。Mac Loon 实际返回的候选为 `{"type":"node","name":"…"}` 对象，已兼容；同时保留文档示例中的字符串数组形式，不接受未知对象类型作为节点。

2026-10-04 Mac Loon 0.4.0(991) 验证：首页 HTTP 200，读取 47 个去重候选且无读取不完整提示；选择节点及三个服务后 HTTP 202；后台使用指定单节点完成六项匿名 GET，结果页 HTTP 200。OpenAI 辅助接口通过结构检查，Claude trace 返回地区信息，三个主入口收到网页；服务级汇总仍全部为无法确认。另一次通过已有不可用参照出口仅检查 Gemini，得到 HTTP 200、CHN 辅助标记及无法确认，未误标为可用，也未能据此给出确定不可用结论。**完整可用性筛选仍未完成。**

下载缓存、iCloud 源码副本与仓库脚本字节一致。配置仅升级八处 AI 脚本固定版本引用，未修改现有 Test-URL 或节点选择。以上是 HTTP 入口和后台执行验收；未进行新的 App 对话、浏览器视觉验收或 iPhone 操作验收。

普通 HTTPS 客户端另行核对：OpenAI 辅助接口返回预期 JSON；Claude trace 有预期主机和地区；ChatGPT 两个候选后端接口和 Claude bootstrap 遇到 Cloudflare 挑战；Gemini 首页仍不能仅凭标题、地区字段或一个未验证开关判为可用。普通客户端证据与 Loon 指定节点运行结果分开记录。

# Loon AI Test-URL：使用前检测的边界

用户目标是在打开 ChatGPT、Claude、Gemini 之前，通过对应策略组的测试判断候选节点是否支持该服务。事后打开 App、发送测试对话或替用户选一个已知可用节点，都不能作为这个目标已完成的证据。

截至 2026-10-03，未找到能直接填入当前 Loon 原生 Test-URL、可靠区分这三个服务可用与不可用的公共链接。已有的匿名 HTTPS 诊断是辅助工具，尚未实现这一原生测速目标。

## 原生测速的受控实测

设备版本：Mac Loon 0.4.0 (991)。临时建立一个独立测试组，其模拟 HTTP 代理仅监听本机回环地址，不转发任何用户流量。各代理对相同虚拟测试地址返回不同受控响应；正常服务组和节点选择未改变。

| 受控响应 | Loon 原生测速显示 |
|---|---|
| HTTP 200 | 有延迟 |
| HTTP 204 | 有延迟 |
| HTTP 301，带 Location | 有延迟；未请求跳转目标 |
| HTTP 403 | Failed |
| HTTP 503 | 有延迟 |
| 收到连接但不返回 HTTP 响应 | Timeout |
| 延迟返回 HTTP 204 | 显示相应等待时间 |

模拟代理记录确认请求方法为 `HEAD /probe HTTP/1.1`。301 后没有收到 `/redirect-target` 请求。HEAD 不取得网页正文，原生测速因此不能检查正文中的地区提示、JSON 错误或网页功能状态。

另一次控制实验，对该虚拟地址添加返回 403 的 Rewrite。普通 HEAD 请求确实得到 403，而原生测速仍访问模拟代理并显示上述原始结果，说明本版本的原生测速绕过了该 Rewrite。不能把“普通 HTTP 请求可改写”当作“Test-URL 也可接入这种改写”的证据。未单独实测 Request Script 钩子，不宣称已证明所有脚本机制均被绕过。

实验结束后已关闭模拟进程，移除临时节点、策略组、Host 和 Rewrite；当前配置与实验前备份逐字节一致。这些状态码映射是在上述 Mac 版本中验证的，不扩大为所有版本的手机实测结果。

官方说明也将策略组测速定义为 Header 请求和延迟比较，参见 [策略组文档](https://nsloon.app/docs/Policy/policygroup/)及[官方配置示例](https://github.com/Loon0x00/LoonExampleConfig/blob/master/example.conf)。用户此前的 iPhone 截图明确提示 Test-URL 只支持 HTTP；当前 Mac 程序也包含同一校验提示。

尚未实测通过手写配置填入 HTTPS 是否能绕过界面限制，不能将它描述为可用方案。即使某个运行时接受 HTTPS，仍需另行验证响应判定规则；仅把协议改为 HTTPS 不能自动获得正文分析能力。

## 候选 HTTP 链接

下面是在当前既有分流下进行的匿名请求，只核对链接行为，不据此评价或挑选节点。没有自动跟随跳转、使用账号 Cookie 或发送对话。

该候选表使用普通 HTTP 客户端，与绕过 Rewrite 的原生测速路径有差异。另行建立的三个真实候选链接原生实验组因电脑重新锁屏未能执行，已全部移除；不能把下表冒充那项原生测试的结果。上节的受控原生机制实验已执行完成。

| 候选链接 | 本轮 HEAD 结果 | 对使用前预检的意义 |
|---|---|---|
| `http://chatgpt.com/` | 301 → HTTPS 同路径 | 原生测速到此结束，没有检查 HTTPS 服务 |
| `http://chatgpt.com/backend-api/sentinel/chat-requirements` | 301 → HTTPS 同路径 | 改成接口路径仍只是 HTTP 跳转 |
| `http://ios.chat.openai.com/` | 403 | 拒绝明文请求不足以证明 ChatGPT 不可用 |
| `http://api.openai.com/compliance/cookie_requirements` | 403 | HTTPS 地区辅助检查不能直接换成 HTTP 用于测速 |
| `http://claude.ai/` | 301 → HTTPS 同路径 | 没有到达 HTTPS 下的地区检查 |
| `http://claude.ai/api/organizations` | 301 → HTTPS 同路径 | 接口路径不能改变该限制 |
| `http://api.anthropic.com/v1/messages` | 400 | 无合法 API 请求及认证，不能判断 Claude 网页可用性 |
| `http://gemini.google.com/` | 本轮空响应；GET 为 301 | HEAD 与 GET 行为不能互相替代 |
| `http://gemini.google.com/app?hl=en` | 本轮空响应；GET 为 301 | 仍没有读取实际网页状态 |
| `http://gemini.google.com/generate_204` | 本轮空响应；GET 为 204 | 204 只表示连接测试入口响应，不能判定 Gemini 支持该节点 |

因此，上述链接至多用于目标主机的连接延迟或故障排查。没有一个在本轮验证中具备“响应成功就代表对应 AI 可用”的语义。此前将 Gemini 的 HTTP 204 入口作为更合适测速地址，只能解释为连接测速调整，不能交付为 Gemini 解锁检测。

## 现有专项检测工具的判据核对

直接核对 [subs-check 的 OpenAI 实现](https://github.com/beck-8/subs-check/blob/master/check/platform/openai.go)、[Claude 实现](https://github.com/beck-8/subs-check/blob/master/check/platform/claude.go)和[Gemini 实现](https://github.com/beck-8/subs-check/blob/master/check/platform/gemini.go)：

| 服务 | 该工具的检测方式 | 不直接采用为“服务可用”的原因 |
|---|---|---|
| ChatGPT | HTTPS GET 请求地区辅助接口及移动入口，再排除若干错误字样 | 正向条件主要是正文不含错误词，异常响应也可能被接受；API 与 App 的可用性并不相同 |
| Claude | HTTPS GET `claude.ai/cdn-cgi/trace`，读取 `loc` 并对照工具自带地区排除表 | 检查的是 Cloudflare 地区信息，没有检查 Claude 的服务流程与出口拦截 |
| Gemini | HTTPS GET 首页，读取非公开三字母国家字段并对照排除表 | 这是地区辅助信息，不是公开的功能可用性字段；无法覆盖账号、风控和功能限制 |

这些源码说明了社区所谓“解锁检测”与一个原生测速链接的区别，也说明不能仅因工具输出可用就认定判据已可靠。地区名单需以服务当前官方说明为准，例如 [Gemini 网页可用地区](https://support.google.com/gemini/answer/13575153?hl=en)和[Anthropic 支持地区](https://www.anthropic.com/supported-countries)。地区条件通过仍只是预检中的一项。

进一步核对时，Google 当前网页端名单包含香港和澳门，而上述 Gemini 实现仍把 HKG、MAC 列为封锁代码；不能照搬为当前服务判据。Google 也明确提醒网页和移动端条件可能不同。旧布尔开关在本轮两份匿名页面中仍出现不同值，但未验证其当前含义，不能仅凭相关性当作可用性字段。

## 若采用自动专项预检

专项检测需要在指定候选节点上进行 HTTPS 请求并解析服务响应，独立于原生 Test-URL 的延迟数字。无需发送实际聊天消息，也不应修改用户所选节点。

| 服务 | 自动预检可采用的证据 | 必须保留的限制 |
|---|---|---|
| ChatGPT | 对官方入口与 `https://api.openai.com/compliance/cookie_requirements` 进行结构检查；识别实际 `unsupported_country` 等地区错误与 Cloudflare 挑战 | 地区辅助接口返回 `cookie_consent_required` 不等于 ChatGPT 功能可用；API 与网页入口不得混同 |
| Claude | 识别官方地区不可用重定向；检查入口、登录流程与验证挑战 | 匿名 API 403 可能是 Cloudflare 挑战，不能直接判为节点不支持 |
| Gemini | 读取实际网页中的有效限制状态；辅助记录服务返回的地区信息 | HTTP 200、标题、非公开国家字段及未验证的旧功能开关都不能单独证明可用 |

本轮匿名 HTTPS 候选结构检查：OpenAI 辅助入口为 200，JSON 包含 `cookie_consent_required`；Claude `/api/organizations` 为 403 验证挑战页；Gemini 入口为 200，带服务标题和辅助地区字段。以上结果用于确认检测方法，未将它们转换为三个服务的“可用”结论。

真正可交付的预检应区分“检查条件通过”“明确不支持或被拦”“暂时无法确认”。不出现错误字样、收到 200、需要登录、验证挑战或脚本 TLS 异常，都不能默认为通过。旧诊断器还需要验证每项正向判据，才可作为这个使用前筛选目标的交付物。

在 Loon 内可采用 Generic 脚本入口：选择服务及候选节点，由脚本用 `node` 参数指定请求出口，读取 HTTPS 的状态、跳转和正文，并显示各项预检证据。官方 [Script API](https://nsloon.app/docs/Script/script_api/)提供指定节点的 HTTP 请求和节点入口参数，[脚本配置](https://nsloon.app/docs/Script/script_v2/)提供 Generic 手动执行方式。实现无需打开 AI App、发送对话或切换现有策略组节点，但结果应独立展示，不能伪装成原生延迟数字。

若要求结果只能出现在原生 Test-URL 的延迟位置，当前调查没有得到可靠的实现方式。外部服务器代测也不能直接替代指定节点的请求：外部服务器请求 AI 时使用的是它自己的出口，除非额外设计并验证经该候选节点的转发机制。

## 本轮实现状态

V3 预检工具增加按候选节点和服务提交检测、服务级汇总及两个严格验证格式的辅助入口。OpenAI `cookie_requirements` 的合法 JSON 可让该检查项通过，Claude trace 只报告实际返回的地区；两者都不让整个 AI 服务显示可用。网页标题、登录响应、挑战和 TLS 异常仍保持无法确认。Gemini 当前 `supported` 限区措辞已补充识别。

这完成了工具入口和部分判据的改进；三个服务的完整正向可用性判据与原生 Test-URL 集成仍未解决。不得用本地测试通过或辅助接口成功描述为用户的整个目标已经完成。

# V2EX 每日登录奖励 · Loon 插件

一个插件订阅地址即可安装到多台 iPhone。插件远程引用同仓库的 JavaScript；Loon 官方插件示例没有内嵌 JS 正文语法，所以仓库内有 `.plugin` 和 `.js` 两个源文件，**手机上只需导入插件 URL**。

插件地址：`https://raw.githubusercontent.com/QinSisuo/proxy-finance-assets/main/v2ex-daily-checkin/V2EX_Daily_Checkin.plugin`

2026-10-14 更新：领取失败后，“今天已尝试”的本机记录不再阻止再次运行；此前保存的“已领取”记录也不再替代网站检查。新版还保存 Safari 实际使用的 User-Agent 和 Accept-Language，并在每次请求后合并服务器返回的会话 Cookie 更新。脚本 URL 带 `v=20261014b`，用于触发资源重新下载。

旧版用户需要更新插件后，打开“捕获登录状态”，在 Safari 从 V2EX 首页进入每日任务页重新授权一次，再运行脚本。无需手动复制 Cookie。截图中的“浏览器环境被拒绝”是网站返回内容；上述两处请求上下文缺失已经修正，但还没有证据证明这就是该 iPhone 被拒绝的全部原因。若重新授权后仍被拒绝，脚本会停止，不能保证通过网站检查。

## 安装与首次授权

1. 在每台 iPhone 的 Loon 插件管理中添加上述 URL，开启插件。保持 Loon 和本机代理连接，确认 Loon 的 HTTPS 解密证书已安装并被 iOS 信任。插件只对 `www.v2ex.com` 声明 MITM。
2. 在 Safari 登录本人 V2EX 账号，从 `https://www.v2ex.com/` 首页点击每日登录奖励入口。Loon 的请求脚本只从该请求的 Cookie 头中筛选 `PB3_SESSION` 与 `A2`，并保存实际 User-Agent 与 Accept-Language，保存在**该设备的 Loon 本地持久存储**；不在通知、日志或 GitHub 中输出。登录页有验证码时，请本人正常完成登录；插件不会绕过。
3. 收到保存会话通知后，可在插件设置中关闭“捕获登录状态”，停止再次运行捕获脚本。插件中的 `[MITM]` 主机声明仍然存在；若不愿持续对该主机启用 HTTPS 解密，需要在 Loon 中单独管理 MITM 设置，但这样也会影响自动重新捕获。若会话过期，再打开捕获并重复第 2 步。每台设备需要分别登录授权；Cookie 不通过 GitHub 同步。
4. 在 Loon 脚本列表手动运行“V2EX 每日奖励”，然后用 Safari 查看任务页和铜币余额。脚本先访问 V2EX 首页，再从首页进入每日任务页；领取请求遇到网站明确的“请重新点击一次”提示时，只额外提交一次，并重新读取任务页确认。

## 每日运行

插件的“每日自动领取”默认开启，Cron `5 8 * * *` 表示设备本地时间 08:05。可在插件参数中调整。V2EX 奖励日期可能按 UTC 切换；在中国时区 08:05 只留有 5 分钟缓冲，若遇到未更新，可改成 09:05。iOS 后台调度、Loon 运行状态、VPN 与网络连接会影响执行，无法保证绝对准点。多设备同时运行时，各设备会先检查网站状态；若并发领取，最终以 V2EX 页面结果为准。

脚本只执行每日登录奖励，不阅读、点赞、发帖或操作其他任务。每次运行都先重新读取网站：页面明确已领取就跳过；仍提供合法领取按钮时可以重新尝试；页面状态不明时不发送领取请求。它接受 V2EX 正常的 HTTP 302 跳转，但同一次运行只在复查页面明确要求再次点击时提交第二次领取请求；网络结果不明时停止本次运行，允许以后重新运行并先核实网站状态。403、429、超时、登录失效和浏览器环境被网站拒绝均有通知。

## 机制与证据边界

- [Loon 官方插件示例](https://github.com/Loon0x00/LoonExampleConfig/blob/master/Plugin/Plugin_Example.plugin)确认插件元数据和 `[Script]`；[官方脚本文档](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/script.md)确认 `http-request`、Cron、`script-path`、`timeout`、`argument`、`enable`；[官方 API 文档](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/script_api.md)确认 `$httpClient`、`$persistentStore`、`$notification`、`$done`。`$request` 仅用于请求脚本。
- 用户提供的 [MyCheckIn.plugin](https://gist.githubusercontent.com/hughshen/3225051bf7eee12d7f5bb71fead2e688/raw/MyCheckIn.plugin)和 [Sub-Store 插件](https://github.com/sub-store-org/Sub-Store/blob/master/config/Loon.plugin)是 `[Argument]` 开关和远程脚本占位符的实际配置例子。
- Loon 官方 API 文档说明 `auto-cookie` 默认开启（build 662+）。本脚本显式关闭共享的自动 Cookie 处理，仅使用本次授权的会话，合并响应 `Set-Cookie` 中的 `PB3_SESSION`、`A2` 后再发送下一步请求。它不收集或保存挑战 Cookie，也不伪造浏览器版本。
- [社区 V2EX 实现](https://github.com/curtinp118/QinglongScripts/blob/main/V2EX/V2EX.py)展示从登录态页面提取 `once` 领取路径、GET 请求及已领提示；这不是 V2EX 官方接口说明。本脚本仅在**实时页面**存在明确的领取导航目标时请求该目标，不拼造动态参数。领取后必须重新读取任务页并看到已领标志才通知成功。
- 2026-10-13 在本人已登录的 macOS Loon 和 Safari 上验证：原脚本 08:05 正常触发，领取请求返回 302，但直接进入任务页的流程未领取；Safari 直接打开任务页也收到“浏览器有一些奇奇怪怪的设置”，从 V2EX 首页点击每日任务入口后成功领取。修订后的脚本已通过本地模拟测试；下一次实际定时领取仍需在未领取的日期验证。Cookie 字段 `PB3_SESSION`、`A2` 基于当前社区资料；若网站变更，脚本会提示登录失效而非扩大保存范围。

## 故障排查

| 提示 | 处理 |
| --- | --- |
| 没有登录状态 | 开启捕获，在 Safari 登录并打开每日任务页；确认 Loon 的 MITM 与证书信任生效 |
| 登录已失效 | Safari 重新登录并再次捕获；不要把 Cookie 发给任何人 |
| 未出现领取链接 | 网站页面结构或语言可能变化；在 Safari 手动查看，脚本不会猜接口 |
| 今天已有尝试，结果未确认 | 这是旧版提示。更新插件订阅，确认脚本 URL 带 `v=20261014b` 后重新运行；新版先检查网站，不按本机尝试次数锁定当天 |
| 旧授权缺少 Safari 浏览器信息 | 开启捕获，在 Safari 从首页进入每日任务页重新授权 |
| 网络错误或结果未确认 | 重新运行可先复查领取状态；如果网站显示已领取则跳过，页面无法判断时请在 Safari 查看 |
| 浏览器环境被拒绝 | 从 V2EX 首页点击每日任务入口手动检查；网站可能拒绝当前浏览器或网络环境 |
| HTTP 403/429 | 停止自动重试，稍后手动查看网站；不要绕过访问控制 |
| 无通知 | 检查 Loon 通知权限、脚本日志和插件资源更新状态 |

## 测试清单

| 测试 | 结果 |
| --- | --- |
| JS 语法、插件字段静态检查 | 已执行 |
| 无 Cookie、登录失效、已领跳过、302 跳转、再次点击、网站拒绝及复查 | Node 模拟测试已执行；不代表真实网站通过 |
| HTTP 403、429、超时、网络错误 | Node 模拟测试已执行 |
| 同日失败后重跑、超时实际成功后重跑、未知页面停止、缓存成功后仍查网站 | 2026-10-14 Node 模拟测试已执行 |
| 实际浏览器头传递、Set-Cookie 会话更新、过期会话删除、排除无关 Cookie | 2026-10-14 Node 模拟测试已执行；共 22 项模拟场景通过 |
| 无 Cookie 真实网站访问 | 已执行：重定向到登录页 |
| 登录态真实领取、铜币到账 | 2026-10-13 Safari 从首页进入后，任务页显示已领取；未核对铜币余额变化 |
| macOS Loon Cookie 捕获、定时触发 | 2026-10-13 已执行；修订版尚未经过次日真实领取 |
| iPhone Loon 导入与后台调度 | 本次未执行 |

发布代码不包含 Cookie、抓包或凭据。源文件公开后，手机读取脚本和插件仍依赖 GitHub Raw 可用。

# V2EX 每日登录奖励 · Loon 插件

一个插件订阅地址即可安装到多台 iPhone。插件远程引用同仓库的 JavaScript；Loon 官方插件示例没有内嵌 JS 正文语法，所以仓库内有 `.plugin` 和 `.js` 两个源文件，**手机上只需导入插件 URL**。

插件地址：`https://raw.githubusercontent.com/QinSisuo/proxy-finance-assets/main/v2ex-daily-checkin/V2EX_Daily_Checkin.plugin`

## 安装与首次授权

1. 在每台 iPhone 的 Loon 插件管理中添加上述 URL，开启插件。保持 Loon 和本机代理连接，确认 Loon 的 HTTPS 解密证书已安装并被 iOS 信任。插件只对 `www.v2ex.com` 声明 MITM。
2. 在 Safari 登录本人 V2EX 账号，访问 `https://www.v2ex.com/mission/daily`。Loon 的请求脚本只从该请求的 Cookie 头中筛选 `PB3_SESSION` 与 `A2`，保存在**该设备的 Loon 本地持久存储**；不在通知、日志或 GitHub 中输出。登录页有验证码时，请本人正常完成登录；插件不会绕过。
3. 收到保存会话通知后，可在插件设置中关闭“捕获登录状态”。若会话过期，再打开它并重复第 2 步。每台设备需要分别登录授权；Cookie 不通过 GitHub 同步。
4. 在 Loon 脚本列表手动运行“V2EX 每日奖励”，然后用 Safari 查看任务页和铜币余额。脚本只会请求页面实际给出的领取链接一次，并重新读取任务页确认。

## 每日运行

插件的“每日自动领取”默认开启，Cron `5 8 * * *` 表示设备本地时间 08:05。可在插件参数中调整。V2EX 奖励日期可能按 UTC 切换；在中国时区 08:05 只留有 5 分钟缓冲，若遇到未更新，可改成 09:05。iOS 后台调度、Loon 运行状态、VPN 与网络连接会影响执行，无法保证绝对准点。多设备同时运行时，各设备会先检查网站状态；若并发领取，最终以 V2EX 页面结果为准。

脚本只执行每日登录奖励，不阅读、点赞、发帖或操作其他任务。它不重试领取请求；如果网络结果不明，本机当天不再提交第二次，并提示手动查看。403、429、超时和登录失效均有通知。

## 机制与证据边界

- [Loon 官方插件示例](https://github.com/Loon0x00/LoonExampleConfig/blob/master/Plugin/Plugin_Example.plugin)确认插件元数据和 `[Script]`；[官方脚本文档](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/script.md)确认 `http-request`、Cron、`script-path`、`timeout`、`argument`、`enable`；[官方 API 文档](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/script_api.md)确认 `$httpClient`、`$persistentStore`、`$notification`、`$done`。`$request` 仅用于请求脚本。
- 用户提供的 [MyCheckIn.plugin](https://gist.githubusercontent.com/hughshen/3225051bf7eee12d7f5bb71fead2e688/raw/MyCheckIn.plugin)和 [Sub-Store 插件](https://github.com/sub-store-org/Sub-Store/blob/master/config/Loon.plugin)是 `[Argument]` 开关和远程脚本占位符的实际配置例子。
- [社区 V2EX 实现](https://github.com/curtinp118/QinglongScripts/blob/main/V2EX/V2EX.py)展示从登录态页面提取 `once` 领取路径、GET 请求及已领提示；这不是 V2EX 官方接口说明。本脚本仅在**实时页面**存在明确的领取导航目标时请求该目标，不拼造动态参数。领取后必须重新读取任务页并看到已领标志才通知成功。
- 当前环境只拿到 V2EX 未登录页，跳转 `/signin?next=%2Fmission%2Fdaily`，含验证码。**未取得本人登录态 HTML，也未做真实领取或真机 Loon 测试。** Cookie 字段 `PB3_SESSION`、`A2` 基于当前社区资料；若网站变更，脚本会提示登录失效而非扩大保存范围。

## 故障排查

| 提示 | 处理 |
| --- | --- |
| 没有登录状态 | 开启捕获，在 Safari 登录并打开每日任务页；确认 Loon 的 MITM 与证书信任生效 |
| 登录已失效 | Safari 重新登录并再次捕获；不要把 Cookie 发给任何人 |
| 未出现领取链接 | 网站页面结构或语言可能变化；在 Safari 手动查看，脚本不会猜接口 |
| 今天已有尝试，结果未确认 | 在 Safari 检查任务页和铜币余额；当天不会自动重复提交 |
| HTTP 403/429 | 停止自动重试，稍后手动查看网站；不要绕过访问控制 |
| 无通知 | 检查 Loon 通知权限、脚本日志和插件资源更新状态 |

## 测试清单

| 测试 | 结果 |
| --- | --- |
| JS 语法、插件字段静态检查 | 已执行 |
| 无 Cookie、登录失效、已领跳过、未领领取及复查 | Node 模拟测试已执行；不代表真实网站通过 |
| HTTP 403、429、超时、网络错误、防重复 | Node 模拟测试已执行 |
| 无 Cookie 真实网站访问 | 已执行：重定向到登录页 |
| 登录态真实领取、铜币到账 | 未执行：没有本人登录会话 |
| Loon 真机导入、Cookie 捕获、定时触发 | 未执行：没有本次 iPhone 测试环境 |

发布代码不包含 Cookie、抓包或凭据。源文件公开后，手机读取脚本和插件仍依赖 GitHub Raw 可用。

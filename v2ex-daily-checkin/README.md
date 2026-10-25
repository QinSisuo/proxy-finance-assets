# V2EX 每日奖励 · Loon

安装或更新一个插件 URL 即可，无需在 iPhone 手动导入 JS：

`https://raw.githubusercontent.com/QinSisuo/proxy-finance-assets/main/v2ex-daily-checkin/V2EX_Daily_Checkin.plugin`

## 2026-10-25 修复：网络失败误报已签到

用户真机日志显示 `Socket closed by remote peer`，之后原版仍然通知“已签到”。已用下载的原脚本复现：`fetchSignInOnce()` 请求失败后捕获异常但没有中止，`signin()` 随后读取上次保存的 `v2ex_html`。旧页面含“每日登录奖励已领取”时，会错误地把历史状态报告为本次结果。

当前脚本仅使用本次请求取得的页面，不读取或保存 `v2ex_html`。读取发生网络错误时，只重试一次读取；两次均失败则明确报告无法确认。领取后重新读取任务页确认，领取请求本身不做网络重试；下次运行仍可先检查网站并重新尝试。不会按本机日期锁定当天。

保留 [参考原脚本](https://raw.githubusercontent.com/anyehttp/quantumult-x/main/task/v2ex.js) 的完整 Cookie、`v2ex_data` 数据键、User-Agent、直接读取每日页以及 Loon 默认重定向和 Cookie 行为。没有额外首页请求、HTTP Referer 或手工 Cookie 合并。请求超时设为 10 秒。脚本只请求 V2EX 每日任务及其页面提供的领取链接，不访问原版的外部提示文件。

## iPhone 更新和第一次测试

1. 在 Loon 更新现有 V2EX 插件，确认脚本 URL 带 `V2EX_Daily_Checkin.js?v=20261025`。
2. 已通过原版保存的 Cookie 可以直接沿用，无需重新登录。手动运行“V2EX 每日奖励”。网站返回明确已领状态时才通知确认；网络仍断开则应显示失败，不能据此声称铜币已到账。
3. 若无 Cookie 或登录失效，开启插件“捕获登录状态”，保持代理连接及 Loon MITM、证书信任正常。在 Safari 登录 V2EX，从首页进入每日任务页，等到 Cookie 保存通知，再关闭捕获并测试。不要分享 Cookie。
4. 插件“每日自动领取”默认开启，每天设备本地时间 08:05，可修改时间。每台设备分别授权。若同时安装其他 V2EX 插件，仅保留一份定时任务，避免旧原版继续发出错误通知。
5. 用 Safari 每日任务页的领取状态及账户铜币记录确认到账；首页入口可能受刷新影响，单凭入口或通知不能证明铜币变化。

## 排查

- `网络连接被远端关闭`：本次网络请求失败，可能涉及节点、网络或网站连接；截图不能确定具体原因。保持本机代理开启，可稍后重跑，或在 Loon 中选择可正常访问 V2EX 的现有节点。
- HTTP 403/429 或网站拒绝：本次停止，不绕过网站检查。
- 页面结构无法识别：不提交猜测的领取请求。
- 仍收到 `v2ex签到 / ✅❌已签到`：这是旧原版的通知格式，检查是否未更新资源或仍启用了另一份旧任务。新版标题为 `V2EX 每日奖励`。

## 隐私与运行条件

Cookie 只保存在设备本地，沿用原版完整 Cookie 方案；没有验证最小 Cookie 集。不会记录 Cookie、完整网页或一次性令牌到日志或通知。保留原版以 `@` 分隔的多账号格式。

定时触发依赖 Loon、iOS 后台调度、网络与 VPN 连接状态，不保证任意情况下准点运行。网站奖励日期不由本机缓存决定，每次查询实时页面。

## 验证记录

- 已实际复现原版“旧页面 + Socket 错误 => 已签到”缺陷。
- 已执行 JS 语法检查和 16 项离线回归测试，包括该缺陷、读取重试、领取结果复查、领取响应丢失、403/429、登录失效及同日重跑。
- 已检查请求头和完整 Cookie 传递与参考版一致，未修改 Loon 的默认重定向/Cookie 开关。
- 修订版没有经过用户 iPhone 实际领取测试，也未确认铜币到账；模拟测试不能证明网络故障已消失。

开发检查：`node --check V2EX_Daily_Checkin.js` 和 `node test.js`。使用下载的参考脚本复现旧缺陷：`node test.js --reference /path/to/upstream-v2ex.js`。iPhone 用户无需运行开发工具。

Loon 语法与 API：[官方插件示例](https://github.com/Loon0x00/LoonExampleConfig/blob/master/Plugin/Plugin_Example.plugin)、[官方脚本文档](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/script.md)、[官方 API 文档](https://github.com/Loon0x00/LoonManual/blob/master/docs/cn/script_api.md)。

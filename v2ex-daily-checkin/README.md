# V2EX 每日奖励 · 原版兼容配置

插件订阅地址保持不变：

`https://raw.githubusercontent.com/QinSisuo/proxy-finance-assets/main/v2ex-daily-checkin/V2EX_Daily_Checkin.plugin`

2026-10-14 本版直接引用用户已经确认可用的 [MyCheckIn.plugin](https://gist.githubusercontent.com/hughshen/3225051bf7eee12d7f5bb71fead2e688/raw/MyCheckIn.plugin) 中的 V2EX 脚本：

`https://raw.githubusercontent.com/anyehttp/quantumult-x/main/task/v2ex.js`

保留单插件安装、每天设备本地时间 08:05 和参数开关，只配置 V2EX。运行不需要电脑或常驻服务器。

## 更新与使用

1. 在 Loon 更新现有的 V2EX 插件订阅，检查两个脚本条目的 `script-path` 均指向 `anyehttp/quantumult-x/main/task/v2ex.js`。如果仍出现“浏览器环境被拒绝”或“旧授权缺少 Safari 浏览器信息”等之前的通知，说明还在运行旧脚本，请检查插件资源更新。
2. 同一台 iPhone 如果已经使用参考插件并成功保存 Cookie，新配置使用相同的本机数据键 `v2ex_data`，可直接沿用。此前自编脚本的 `v2ex_daily_cookie_v1` 不会被读取，因为它已裁剪掉原版保留的信息。
3. 若该设备还没有原版登录状态，打开“捕获登录状态”，在 Safari 登录 V2EX 并进入每日任务页。Loon 的 MITM 和已信任证书需要正常生效。收到“获取签到Cookie成功”后可关闭捕获开关。
4. 手动运行“V2EX 每日奖励”，再通过 Safari 的每日任务页和铜币余额确认结果。“每日自动领取”默认开启，时间可在插件参数中修改；iOS 和网络状态可能影响后台触发，不能保证任意情况下准点运行。
5. 若参考插件同时启用了 V2EX 定时任务，保留其中一个定时任务，避免两份配置同时运行。

## 与之前版本的实际差异

| 项目 | 参考原版（本版直接使用） | 此前自编版本 |
| --- | --- | --- |
| Cookie | 保存访问 V2EX 时的完整 Cookie 到 `v2ex_data` | 仅保存 `PB3_SESSION`、`A2` |
| 起始请求 | 直接请求 `/mission/daily` | 先请求首页 |
| User-Agent | 使用原脚本的固定字符串 | 改成捕获的 Safari 字符串 |
| HTTP Referer | 不额外指定 | 额外指定 |
| 自动重定向与 Cookie | 沿用 Loon 默认行为 | 手动关闭并实现会话更新 |
| 当天重跑 | 每次读取网页判断 | 曾以本机尝试记录阻止，后来移除 |

这些是已核对的代码差异，尚未通过逐项账号实验确定哪一项导致之前 iPhone 失败。因此本版整体采用已经被用户确认可用的原脚本，不宣称找到了唯一根因。

## 原脚本的行为与限制

原脚本从每日页面提取动态 `once` 领取链接，使用 GET 请求；根据返回页面中的“每日登录奖励已领取”判断结果。它保存完整 Cookie 和页面 HTML 到 Loon 本机持久存储，不是已验证的最小 Cookie 方案；也没有领取后的独立任务页复查。这里明确采用原版兼容行为，不能把它称为满足此前全部严格验证要求的自编实现。

原版会请求作者的两个公开提示文件；默认没有把 Cookie 加到这些请求中。若本机另行配置了 `bark_key`，原脚本还有 Bark 通知功能。源码由第三方仓库维护，今后的上游变化会影响使用。Cookie 不放进插件、GitHub、聊天或安装 URL，每台设备分别保存和授权。

本仓库 `V2EX_Daily_Checkin.js` 仅用于提醒尚未更新插件的旧客户端，当前插件不会执行它。

## 测试记录

- 实际获取参考插件及其原脚本，核对两个脚本地址、捕获表达式、数据键和请求流程。
- 使用 Node 的模拟 Loon API 执行原脚本，测试捕获、无 Cookie、已领取、未领取、失败后重跑；不使用真实凭据、不发网络请求。
- 校验本插件只包含 V2EX 的请求、定时任务和 MITM 主机。
- 用户表示参考原插件在其设备可用；本次更新尚未经过用户 iPhone 的实际领取验证。

开发模拟测试：先下载原脚本到临时文件，再运行 `node test.js /path/to/v2ex.js`。该命令仅用于开发检查，iPhone 用户不需要运行。

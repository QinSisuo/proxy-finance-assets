# 微信链接尝试打开 X / GitHub App

Loon 插件地址：`https://raw.githubusercontent.com/QinSisuo/proxy-finance-assets/main/wechat-open-app/Wechat_Open_App.plugin`

当前版本为 **v3.2.0**。按 Loon 官方插件格式，使用 `#!date` 显示版本标识和日期；`#!loon_version` 声明最低 Loon 版本，并非本插件版本。

在 Loon 中添加上述插件，按 Loon 提示启用 HTTPS 解密并信任证书。微信内用 GET 打开 X、Twitter 或 GitHub 的 HTML 页面时，插件会显示轻量跳转页：X 尝试通过 `x.com` 与 `twitter.com` 之间的跨域 Universal Link 唤起 X，并提供 X 官方文档确认的 `x://` 备用按钮；GitHub 自动发出带原始链接的 Loon 系统通知，用户点击通知后由 Loon 请求系统打开链接；同时保留 `www.github.com` 过渡页中的手动入口。GitHub 页面不再自动导航到网页版，以保留用户点击入口。页面保留原网页入口。其他 App、非网页请求和非微信请求不处理。

更新已有插件时，请在 Loon 中更新插件及脚本。本版脚本地址带 `?v=3.2.0`，用于区分此前缓存。`www.github.com` 必须纳入已启用的 HTTPS 解密范围，插件已声明该域名。GitHub 主站首页以及部分产品、仓库子页面被 GitHub 官方的 App 关联文件排除，不能保证所有链接都进入 App。

## 平台限制

Loon 只能改写网络响应，无法命令微信或 iOS 打开其他 App。微信可能阻止网页自动发起的 URL Scheme 或 Universal Link，因此本插件不能保证无点击自动切换。若两个 X 按钮都被微信拦截，请在微信右上角菜单中选择“在浏览器中打开”；单靠 Loon 插件无法越过微信的应用跳转限制。GitHub 官方说明，若 Universal Link 被用户关闭，可长按链接选“在 GitHub 中打开”重新启用。

跳转页会替代目标网页的首个文档请求。遇到登录、设置等路径时插件会放行。若有兼容问题，可在 Loon 中停用插件；不需要关闭代理。

## GitHub 系统通知入口

已确认测试链接 `https://github.com/YIKUAIBANZI/forge-skill` 在用户的备忘录中能进入 App，在微信中不能。网页版跨域尝试没有解决该设备上的问题。v3.2.0 增加原生通知入口，需要在 iOS 和 Loon 中允许通知；插件参数“GitHub 系统通知”默认开启，可单独关闭。同一链接在 30 秒内不重复发通知，最近一次 URL 和时间只存储在本机。通知带原始 HTTPS 链接，不添加网页绕过参数。

这是需要点击通知一次的替代方案，不能实现完全无点击唤起。通知点击是否进入 GitHub App 仍需在真实设备验证。Loon 公开脚本 API 没有直接调用系统启动 App 的接口。参考：https://nsloon.app/docs/Script/script_api/

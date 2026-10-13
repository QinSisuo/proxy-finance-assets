# 微信链接尝试打开 X / GitHub App

Loon 插件地址：`https://raw.githubusercontent.com/QinSisuo/proxy-finance-assets/main/wechat-open-app/Wechat_Open_App.plugin`

当前版本为 **v3.3.0**。按 Loon 官方插件格式，使用 `#!date` 显示版本标识和日期；`#!loon_version` 声明最低 Loon 版本，并非本插件版本。

在 Loon 中添加上述插件，按 Loon 提示启用 HTTPS 解密并信任证书。微信内用 GET 打开 X、Twitter 或 GitHub 的 HTML 页面时，插件会显示轻量跳转页：X 尝试通过 `x.com` 与 `twitter.com` 之间的跨域 Universal Link 唤起 X，并提供 X 官方文档确认的 `x://` 备用按钮；GitHub 停留在 `www.github.com` 过渡页，用户点击“打开 GitHub App”后跳向对应仓库。页面不会自动导航到网页版，以保留用户点击入口。页面保留原网页入口。其他 App、非网页请求和非微信请求不处理。

更新已有插件时，请在 Loon 中更新插件及脚本。本版脚本使用固定提交地址，避免下载到此前缓存的脚本。`www.github.com` 必须纳入已启用的 HTTPS 解密范围，插件已声明该域名。GitHub 主站首页以及部分产品、仓库子页面被 GitHub 官方的 App 关联文件排除，不能保证所有链接都进入 App。

## 平台限制

Loon 只能改写网络响应，无法命令微信或 iOS 打开其他 App。微信可能阻止网页自动发起的 URL Scheme 或 Universal Link，因此本插件不能保证无点击自动切换。若两个 X 按钮都被微信拦截，请在微信右上角菜单中选择“在浏览器中打开”；单靠 Loon 插件无法越过微信的应用跳转限制。GitHub 官方说明，若 Universal Link 被用户关闭，可长按链接选“在 GitHub 中打开”重新启用。

跳转页会替代目标网页的首个文档请求。遇到登录、设置等路径时插件会放行。若有兼容问题，可在 Loon 中停用插件；不需要关闭代理。

## GitHub 已验证的操作方式

用户在自己的 iPhone 微信中验证：打开 `https://github.com/YIKUAIBANZI/forge-skill` 后，让过渡页停留，再点击页面按钮，可以进入 GitHub App，无需点击通知。旧版过早自动导航到网页版，使用户来不及点击按钮。v3.3.0 保留页面等待和手动按钮，移除通知及最近链接的本机存储。

该结果验证的是这条仓库链接在用户设备上的一次点击打开流程，尚未验证全部 GitHub 链接或完全无点击唤起。X 的自动跳转逻辑保持原样。

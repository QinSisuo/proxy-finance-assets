# 微信链接尝试打开 X / GitHub App

Loon 插件地址：`https://raw.githubusercontent.com/QinSisuo/proxy-finance-assets/main/wechat-open-app/Wechat_Open_App.plugin`

当前版本为 **v3.4.2**。按 Loon 官方插件格式，使用 `#!date` 显示版本标识和日期；`#!loon_version` 声明最低 Loon 版本，并非本插件版本。

在 Loon 中添加上述插件，按 Loon 提示启用 HTTPS 解密并信任证书。微信内用 GET 打开 X、Twitter 或 GitHub 的 HTML 页面时，插件会显示轻量跳转页：X 尝试通过 `x.com` 与 `twitter.com` 之间的跨域 Universal Link 唤起 X；GitHub 停留在 `www.github.com` 过渡页，用户点击“打开 GitHub App”后跳向对应仓库。GitHub 页面不会自动导航到网页版，以保留用户点击入口。页面保留原网页入口。其他 App、非网页请求和非微信请求不处理。

更新已有插件时，请在 Loon 中更新插件及脚本。本版脚本使用固定提交地址，避免下载到此前缓存的脚本。`www.github.com` 必须纳入已启用的 HTTPS 解密范围，插件已声明该域名。GitHub 主站首页以及部分产品、仓库子页面被 GitHub 官方的 App 关联文件排除，不能保证所有链接都进入 App。

## 平台限制

Loon 只能改写网络响应，无法命令微信或 iOS 打开其他 App。微信可能阻止网页自动发起的 Universal Link，因此本插件不能保证无点击自动切换。GitHub 官方说明，若 Universal Link 被用户关闭，可长按链接选“在 GitHub 中打开”重新启用。

跳转页会替代目标网页的首个文档请求。遇到登录、设置等路径时插件会放行。若有兼容问题，可在 Loon 中停用插件；不需要关闭代理。

## GitHub 已验证的操作方式

用户在自己的 iPhone 微信中验证：打开 `https://github.com/YIKUAIBANZI/forge-skill` 后，让过渡页停留，再点击页面按钮，可以进入 GitHub App，无需点击通知。旧版过早自动导航到网页版，使用户来不及点击按钮。v3.3.0 保留页面等待和手动按钮，移除通知及最近链接的本机存储。

该结果验证的是这条仓库链接在用户设备上的一次点击打开流程，尚未验证全部 GitHub 链接或完全无点击唤起。X 的自动跳转逻辑保持原样。

v3.3.1 将两个 GitHub 入口拆分，并为网页入口增加内部请求 URL 改写，但用户实测网页入口仍会打开 App。v3.3.2 将“继续在微信中打开网页”改成没有 `href` 的普通按钮，点击后由脚本延迟执行网页导航，避免直接点击 GitHub 超链接。“打开 GitHub App”仍保留已经验证可用的链接。页面加载后不会自动执行导航。本次网页按钮修复的手机效果仍需验证。

用户实测 v3.3.2 的网页按钮仍会进入 App。v3.4.0 根据 GitHub 当前公开的 `apple-app-site-association`，将网页入口加入 `tab=readme-ov-file`；该非 achievements 标签匹配 `exclude=true`，在测试仓库首页的关联规则中应留在网页。App 入口不加入该参数。已有网页 tab 参数会被替换为 README 标签。部分先匹配的组织或 PR 子页面规则可能不适用，手机实际行为仍需验证。本版同时删除“如果仍留在微信……”的页面提示。

用户随后确认 GitHub 的问题已解决。v3.4.1 按用户要求移除 X 页面的“使用 X 专用链接打开 App”按钮及其 Scheme 入口，保留自动跳转、主 App 按钮和网页按钮。

用户确认 X 和 GitHub 均达到预期后，v3.4.2 仅整理插件名称、功能介绍、主页和分类标签，脚本及实现配置未变。

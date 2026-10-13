# 微信链接尝试打开 X / GitHub App

Loon 插件地址：`https://raw.githubusercontent.com/QinSisuo/proxy-finance-assets/main/wechat-open-app/Wechat_Open_App.plugin`

在 Loon 中添加上述插件，按 Loon 提示启用 HTTPS 解密并信任证书。微信内用 GET 打开 X、Twitter 或 GitHub 的 HTML 页面时，插件会显示轻量跳转页：X 尝试使用 `twitter://` 唤起 X；GitHub 尝试重新导航到 GitHub Universal Link。页面保留手动按钮和原网页入口。其他 App、非网页请求和非微信请求不处理。

## 平台限制

Loon 只能改写网络响应，无法命令微信或 iOS 打开其他 App。微信可能阻止网页自动发起的 URL Scheme 或 Universal Link，因此本插件不能保证无点击自动切换；GitHub 的自动切换尤其依赖微信和 iOS 对 Universal Link 的处理。若跳转失败，请点“打开 App”，或在微信右上角菜单中选择“在浏览器中打开”。GitHub 官方说明，若 Universal Link 被用户关闭，可长按链接选“在 GitHub 中打开”重新启用。

跳转页会替代目标网页的首个文档请求。遇到登录、设置等路径时插件会放行。若有兼容问题，可在 Loon 中停用插件；不需要关闭代理。

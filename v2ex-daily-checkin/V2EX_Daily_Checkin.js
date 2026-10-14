/* Legacy endpoint: active plugin now references the user's working upstream script. */
(function () {
  try {
    $notification.post("V2EX 每日奖励", "请更新插件订阅", "已切换为 MyCheckIn.plugin 使用的原版 V2EX 脚本。请在 Loon 更新 V2EX 插件；同设备可沿用原插件保存的登录状态。");
  } finally {
    if (typeof $request === "undefined") $done(); else $done({});
  }
})();

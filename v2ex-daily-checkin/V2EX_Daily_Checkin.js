/* Loon. Request compatibility: anyehttp/quantumult-x/task/v2ex.js.
 * Keep its cookie key, Cookie and User-Agent; never reuse persisted HTML.
 */
(function () {
  var BASE = "https://www.v2ex.com", DAILY = BASE + "/mission/daily";
  var COOKIE_KEY = "v2ex_data";
  var USER_AGENT = "(Mozilla/5.0 (iPhone; CPU iPhone OS 15_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.3 Mobile/15E148 Safari/604.1";
  var finished = false, messages = [];
  function finish(message) {
    if (finished) return;
    finished = true;
    try { $notification.post("V2EX 每日奖励", "", message); }
    finally { if (typeof $request === "undefined") $done(); else $done({}); }
  }
  function header(headers, name) {
    for (var key in (headers || {})) {
      if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === name) return String(headers[key]);
    }
    return "";
  }
  function get(cookie, url, callback) {
    var called = false;
    function complete(error, response, body) {
      if (called || finished) return;
      called = true;
      try { callback(error, response, body); }
      catch (_) { finish("处理本次响应失败，领取状态未确认。请稍后重试。"); }
    }
    try {
      // Use the upstream's request shape and Loon's default redirect/cookie behavior.
      $httpClient.get({url: url, timeout: 10000, headers: {"user-agent": USER_AGENT, "cookie": cookie}}, complete);
    } catch (_) { complete("request failed", null, ""); }
  }
  function networkIssue(error) {
    if (/Socket closed|remote peer/i.test(String(error))) return "网络连接被远端关闭";
    if (/timeout|timed out/i.test(String(error))) return "网络请求超时";
    return "网络请求失败";
  }
  function text(html) {
    return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, " ");
  }
  function claimed(html) { return /每日登录奖励已领取|今日的登录奖励已领取|daily login reward has been claimed/i.test(text(html)); }
  function pageIssue(html) {
    if (/need to sign in first|你要查看的页面需要先登录|请先登录|<form[^>]+action=["']\/signin/i.test(html)) return "登录已失效，请重新登录并捕获 Cookie";
    if (/浏览器有一些奇奇怪怪的设置|请用一个干净安装的浏览器重试/.test(text(html))) return "网站拒绝当前请求，请在 Safari 检查";
    return "";
  }
  function readDaily(cookie, callback, attempt) {
    get(cookie, DAILY, function (error, response, body) {
      if (error) {
        // Retry only a read, never an uncertain reward submission.
        if (!attempt) return readDaily(cookie, callback, 1);
        return callback(networkIssue(error) + "；读取每日页失败，无法确认是否已领取");
      }
      var status = Number(response && response.status);
      if (status !== 200) return callback("每日页 HTTP " + status + "，无法确认领取状态");
      if (typeof body !== "string" || !body) return callback("每日页为空，无法确认领取状态");
      var problem = pageIssue(body);
      if (problem) return callback(problem);
      callback("", body);
    });
  }
  function runAccount(cookie, callback, repeated) {
    readDaily(cookie, function (error, html) {
      if (error) return callback(error);
      if (claimed(html)) return callback("今日已签到，登录奖励已领取");
      var match = /(?:onclick\s*=\s*["'][^"']*location\.href\s*=\s*['"]|<a\b[^>]*href\s*=\s*["'])(\/mission\/daily\/redeem\?once=\d+)['"]/i.exec(html);
      if (!match) return callback("本次页面没有可确认的领取链接，未提交领取请求");
      get(cookie, BASE + match[1], function (claimError, response, claimBody) {
        var status = Number(response && response.status);
        var location = header(response && response.headers, "location");
        var destinationPath = location.indexOf(BASE + "/") === 0 ? location.slice(BASE.length) : location;
        var destination = !location ? "未暴露跳转" :
          /^\/mission\/daily(?:[?#]|$)/.test(destinationPath) ? "跳转到任务页" :
          /^\/signin(?:[?#]|$)/.test(destinationPath) ? "跳转到登录页" : "其他跳转";
        function reportFailure(message, pageState) {
          callback(message + "\n诊断：领取 " + (claimError ? "网络错误" : status >= 100 && status <= 599 && status % 1 === 0 ? "HTTP " + status : "无状态码") +
            " / " + destination + " / " + pageState);
        }
        // Re-read even if the submission response was lost: it may have succeeded.
        readDaily(cookie, function (checkError, finalHtml) {
          if (checkError) return reportFailure("领取结果未确认：" + checkError, "复查失败");
          if (claimed(finalHtml)) return callback("签到成功，今日登录奖励已领取");
          var freshLink = /(?:onclick\s*=\s*["'][^"']*location\.href\s*=\s*['"]|<a\b[^>]*href\s*=\s*["'])(\/mission\/daily\/redeem\?once=\d+)['"]/i.test(finalHtml);
          var pageState = freshLink ? "复查仍可领" : "复查状态未知";
          if (claimError) return reportFailure(networkIssue(claimError) + "；复查未确认领取，本次不重复提交", pageState);
          if (status !== 200 && status !== 302 && status !== 303) return reportFailure("领取请求 HTTP " + status + "；复查未确认领取", pageState);
          var responseProblem = typeof claimBody === "string" ? pageIssue(claimBody) : "";
          if (responseProblem) return reportFailure("领取未成功：" + responseProblem, pageState);
          var asksAgain = /请重新点击一次以领取每日登录奖励/.test(text(typeof claimBody === "string" ? claimBody : ""));
          if (asksAgain && freshLink && !repeated) return runAccount(cookie, callback, true);
          if (asksAgain) return reportFailure("网站要求重新点击领取，但本次未能完成；已停止自动提交，请在 Safari 查看", pageState);
          if (freshLink) return reportFailure("领取未成功：任务页仍提供领取按钮，网站未返回可识别的失败原因", pageState);
          reportFailure("领取结果未确认：领取页与复查页均没有已领取标志，请在 Safari 查看每日任务页", pageState);
        });
      });
    });
  }
  try {
    if (typeof $request !== "undefined") {
      if ($request.method === "OPTIONS") { finished = true; return $done({}); }
      var captured = header($request.headers, "cookie");
      if (!captured) return finish("未获取到 Cookie，请先在 Safari 登录并进入每日任务页。");
      if (!$persistentStore.write(captured, COOKIE_KEY)) return finish("Cookie 本机保存失败。");
      return finish("获取签到 Cookie 成功，已保存到本机。请手动运行每日奖励测试。");
    }
    var manual = typeof $argument !== "undefined" && $argument && typeof $argument.manualCookie === "string"
      ? $argument.manualCookie.trim() : "";
    manual = manual.replace(/^Cookie:[ \t]*/i, "");
    if (/[\x00-\x1f\x7f]/.test(manual)) return finish("请在「手动 Cookie」中填写单行 Cookie 值。");
    var saved = manual || $persistentStore.read(COOKIE_KEY) || "";
    if (!saved) return finish("未检测到 Cookie，请开启捕获并在 Safari 登录 V2EX。");
    // Match the upstream's existing multi-account format without migrating credentials.
    var accounts = manual ? [manual] : saved.split("@").filter(function (item) { return item.trim(); });
    if (!accounts.length) return finish("未检测到有效 Cookie，请重新捕获。");
    function next(index) {
      if (index >= accounts.length) return finish(messages.join("\n"));
      runAccount(accounts[index], function (message) {
        messages.push((accounts.length > 1 ? "账号 " + (index + 1) + "：" : "") + message);
        next(index + 1);
      });
    }
    next(0);
  } catch (_) { finish("脚本执行失败，领取状态未确认。请稍后重新运行。"); }
})();

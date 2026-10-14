/* Loon only. No third-party services; no Cookie or HTML logging. */
(function () {
  var BASE = "https://www.v2ex.com", DAILY = BASE + "/mission/daily";
  var CK = "v2ex_daily_cookie_v1", ATTEMPT = "v2ex_daily_attempt_v1", RESULT = "v2ex_daily_result_v1";
  var ended = false;
  function finish(message, silent) {
    if (ended) return;
    ended = true;
    if (!silent) try { $notification.post("V2EX 每日奖励", "", message); } catch (_) {}
    if (typeof $request === "undefined") $done(); else $done({});
  }
  function dateKey() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function store(key, value) { return $persistentStore.write(value, key); }
  function read(key) { return $persistentStore.read(key) || ""; }
  function header(headers, name) {
    if (!headers) return "";
    for (var key in headers) if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === name) return String(headers[key]);
    return "";
  }
  function selectCookie(raw) {
    var parts = String(raw || "").split(";"), chosen = [];
    for (var i = 0; i < parts.length; i++) {
      var match = /^\s*(PB3_SESSION|A2)=([^;]+)\s*$/.exec(parts[i]);
      if (match) chosen.push(match[1] + "=" + match[2]);
    }
    return chosen.join("; ");
  }
  function loggedOut(html) { return /(?:need to sign in first|你要查看的页面需要先登录|请先登录|<form[^>]+action=["']\/signin)/i.test(html); }
  function claimed(html) { return /(?:每日登录奖励已领取|今日的登录奖励已领取|daily login reward has been claimed)/i.test(html); }
  function clickAgain(html) { return /请重新点击一次以领取每日登录奖励/.test(html); }
  function rejected(html) { return /(?:浏览器有一些奇奇怪怪的设置|请用一个干净安装的浏览器重试)/.test(html); }
  function redeemPath(html) {
    /* Match only an explicit navigation target offered on the live daily page. */
    var match = /(?:onclick\s*=\s*["'][^"']*location\.href\s*=\s*['"]|<a\b[^>]*href\s*=\s*["'])(\/mission\/daily\/redeem\?once=[A-Za-z0-9_-]+)(?:['"])/i.exec(html);
    return match ? match[1] : "";
  }
  function get(url, cookie, referer, callback) {
    var headers = {"Cookie": cookie, "Accept": "text/html"};
    if (referer) headers.Referer = referer;
    try { $httpClient.get({url: url, timeout: 10000, "auto-redirect": false, headers: headers}, callback); }
    catch (_) { callback("request failed", null, ""); }
  }
  function issue(error, response, body) {
    if (error) return "网络错误或超时";
    var status = response && response.status;
    if (status === 403 || status === 429) return "HTTP " + status + "，已停止，不会重试";
    if (status !== 200) return "HTTP " + status + "，未执行领取";
    if (typeof body !== "string") return "页面内容不可读";
    return "";
  }
  function checkDaily(cookie, today, referer, callback) {
    get(DAILY, cookie, referer, function (error, response, body) {
      var problem = issue(error, response, body);
      if (problem) return finish("读取每日任务页失败：" + problem);
      if (loggedOut(body)) return finish("登录已失效，请在 Safari 重新登录并重新捕获登录状态。");
      if (claimed(body)) { store(RESULT, today); return finish("网站确认：每日登录奖励已领取。"); }
      if (rejected(body)) return finish("V2EX 拒绝了当前浏览器环境；请在 Safari 从首页进入每日任务页手动检查。");
      callback(body);
    });
  }
  function redeem(cookie, today, body, allowance) {
    var path = redeemPath(body);
    if (!path) return finish("页面未出现可确认的领取链接；可能是页面结构变化。没有发送领取请求。");
    if (allowance === 0) {
      // Record the attempt for diagnostics; it must not prevent a later run
      // from checking the live page and retrying an unclaimed reward.
      if (!store(ATTEMPT, today)) return finish("无法保存运行状态，未发送领取请求。");
    }
    get(BASE + path, cookie, DAILY, function (error, response) {
      if (error) return finish("领取请求网络错误或超时；本次停止。可重新运行，先检查网站领取状态。");
      var status = response && response.status;
      if (status !== 200 && status !== 302 && status !== 303) return finish("领取请求返回 HTTP " + status + "；本次停止。下次运行将先检查网站领取状态。");
      get(DAILY, cookie, DAILY, function (checkError, checkResponse, checkBody) {
        var checkProblem = issue(checkError, checkResponse, checkBody);
        if (checkProblem) return finish("领取后复查失败：" + checkProblem + "；可重新运行检查领取状态。");
        if (loggedOut(checkBody)) return finish("领取后登录失效，结果未确认；请重新登录并手动查看。");
        if (claimed(checkBody)) { store(RESULT, today); return finish("网站复查确认：每日登录奖励已领取。请查看铜币余额。"); }
        if (rejected(checkBody)) return finish("V2EX 拒绝了当前浏览器环境；请在 Safari 从首页进入每日任务页手动检查。");
        if (allowance === 0 && clickAgain(checkBody)) return redeem(cookie, today, checkBody, 1);
        return finish("领取结果无法确认，本次停止。可重新运行检查，或在 Safari 查看每日任务页。");
      });
    });
  }
  try {
    if (typeof $request !== "undefined") {
      if ($request.method !== "GET" || !/^https:\/\/www\.v2ex\.com\/mission\/daily(?:\?|$)/.test($request.url || "")) return finish("", true);
      var selected = selectCookie(header($request.headers, "cookie"));
      if (!selected) return finish("未发现所需登录 Cookie；请先在 Safari 登录 V2EX，再打开每日任务页。");
      if (!store(CK, selected)) return finish("无法在 Loon 本机保存登录状态。");
      return finish("已在本机保存会话。请关闭“捕获登录状态”，并手动运行每日奖励脚本测试。");
    }
    var cookie = read(CK);
    if (!cookie) return finish("没有登录状态。请在 Safari 登录 V2EX，并打开每日任务页。");
    var today = dateKey();
    // Always inspect V2EX. Device-local dates and cached results are not
    // authoritative for the website's reward day or a changed account.
    get(BASE + "/", cookie, "", function (homeError, homeResponse, homeBody) {
      var homeProblem = issue(homeError, homeResponse, homeBody);
      if (homeProblem) return finish("读取 V2EX 首页失败：" + homeProblem);
      checkDaily(cookie, today, BASE + "/", function (body) { redeem(cookie, today, body, 0); });
    });
  } catch (_) { finish("脚本异常；没有继续提交领取请求。请查看 Loon 脚本日志。"); }
})();

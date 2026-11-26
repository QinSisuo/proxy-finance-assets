// Loon 3.5.1 (983)+. Each run uses fresh pages and follows at most one reward control per account.
(function () {
  "use strict";
  const HOME = "https://www.v2ex.com/";
  const DAILY = HOME + "mission/daily";
  const SESSION = "v2ex_daily_session_v2";
  const LEASE = "v2ex_daily_running_v2";
  const AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
  const DAILY_URL = /^https:\/\/(?:www\.)?v2ex\.com\/mission\/daily(?:\?[^#]*)?$/;
  const intercepted = typeof $request !== "undefined";
  const args = typeof $argument !== "undefined" && $argument || {};
  const read = key => $persistentStore.read(key) || "";
  const write = (key, value) => $persistentStore.write(value, key);

  function header(headers, name) {
    const key = Object.keys(headers || {}).find(k => k.toLowerCase() === name);
    return key ? headers[key] : "";
  }

  // These two names come from observed V2EX sessions. Ignore tracking, preferences
  // and challenge cookies. Do not guess additional credentials on login failure.
  function authCookie(value) {
    if (/[\x00-\x1f\x7f]/.test(value)) return "";
    const pairs = [];
    const names = [];
    for (const part of String(value).split(";")) {
      const match = /^(PB3_SESSION|A2)=("[^\s";]*"|[^\s";]+)$/.exec(part.trim());
      if (!match || match[2] === '""') continue;
      if (names.includes(match[1])) return "";
      names.push(match[1]);
      pairs.push(match[0]);
    }
    return pairs.join("; ");
  }

  class CredentialError extends Error {}

  function credentials() {
    const rawManual = typeof args.manualCookie === "string" ? args.manualCookie.trim() : "";
    let manual = rawManual.replace(/^["']\s*["']$/, "").trim();
    if (manual) {
      if ((manual.startsWith('"') && manual.endsWith('"')) || (manual.startsWith("'") && manual.endsWith("'"))) {
        manual = manual.slice(1, -1).trim();
      }
      const value = authCookie(manual.replace(/^Cookie:[ ]*/i, ""));
      if (!value) throw new CredentialError("手动 Cookie 格式无效。请填写单行登录 Cookie，或清空后在 Safari 授权。");
      return {source: "手动", values: [value]};
    }
    const saved = read(SESSION);
    if (saved) {
      const value = authCookie(saved);
      if (!value) throw new CredentialError("本机授权已失效。请在 Safari 重新授权。");
      return {source: "本机授权", values: [value]};
    }
    const old = read("v2ex_data");
    if (!old) throw new CredentialError("尚未授权。请开启「捕获登录状态」，在 Safari 从 V2EX 首页进入每日任务页。");
    // The old format used an unescaped @. Split only clearly complete cookie sets.
    const groups = old.split(/@(?=[ ]*[\w.-]+=)/);
    if (groups.length > 1) {
      const values = groups.map(authCookie);
      if (values.every(v => v.split("; ").length === 2)) return {source: "旧版", values};
      throw new CredentialError("旧版授权的账号分隔不明确。请在 Safari 为本机重新授权。");
    }
    const value = authCookie(old);
    if (!value) throw new CredentialError("旧版授权缺少可用登录字段。请在 Safari 重新授权。");
    return {source: "旧版", values: [value]};
  }

  // Apply only same-origin session updates usable at the task URL. Never import a
  // third-party cookie jar. Ignore Set-Cookie for paths that do not cover the task.
  function updatedCookie(previous, headers) {
    const received = header(headers, "set-cookie");
    if (!received) return previous;
    const values = {};
    for (const pair of previous.split("; ")) {
      const at = pair.indexOf("=");
      if (at > 0) values[pair.slice(0, at)] = pair.slice(at + 1);
    }
    for (const line of [].concat(received)) {
      for (const field of String(line).split(/,(?=\s*[\w.-]+=)/)) {
        const parts = field.trim().split(/;\s*/);
        const pair = /^(PB3_SESSION|A2)=(.*)$/.exec(parts.shift());
        if (!pair) continue;
        const attrs = {};
        for (const part of parts) {
          const i = part.indexOf("=");
          if (i > 0) attrs[part.slice(0, i).toLowerCase()] = part.slice(i + 1).trim();
        }
        if (attrs.domain && !/^\.?(?:www\.)?v2ex\.com$/i.test(attrs.domain)) continue;
        if (attrs.path && !["/", "/mission", "/mission/", "/mission/daily"].includes(attrs.path)) continue;
        const expired = /^-?\d+$/.test(attrs["max-age"]) ? Number(attrs["max-age"]) <= 0 :
          Date.parse(attrs.expires) <= Date.now();
        if (expired || !pair[2] || pair[2] === '""') delete values[pair[1]];
        else if (authCookie(pair[0])) values[pair[1]] = pair[2];
      }
    }
    return Object.keys(values).map(k => k + "=" + values[k]).join("; ");
  }

  function inspectDailyPage(html) {
    if (typeof html !== "string" || !html) return {kind: "unknown"};
    var source = html.replace(/<!--[\s\S]*?(?:-->|$)/g, "");
    // Only an actual interstitial title qualifies here. Embedded scripts can contain sample messages.
    if (/<title\b[^>]*>\s*(?:Just a moment|Attention Required|Access denied|请稍候)[^<]*<\/title>/i.test(source))
      return {kind: "blocked"};
    source = source.replace(/<(script|style|title|textarea|xmp)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "");
    function decode(value) {
      return value.replace(/&(?:nbsp|#160|#xa0);/gi, " ").replace(/&(?:quot|#34|#x22);/gi, '"')
        .replace(/&(?:apos|#39|#x27);/gi, "'").replace(/&amp;/gi, "&");
    }
    function attrs(raw) {
      var a = Object.create(null), part, re = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      while ((part = re.exec(raw))) {
        var key = part[1].toLowerCase();
        if (a[key] !== undefined) { a.duplicate = true; continue; }
        a[key] = decode(part[2] || part[3] || part[4] || "");
      }
      return a;
    }
    var tags = /<(\/?)([a-z][a-z0-9:-]*)\b((?:[^'"<>]|"[^"]*"|'[^']*')*)>|([^<]+)/gi;
    var m, stack = [], visible = [], done = false, login = false, blocked = false;
    var path = "", conflict = false;
    while ((m = tags.exec(source))) {
      var parent = stack.length ? stack[stack.length - 1] : {};
      if (m[4] !== undefined) {
        if (parent.hidden) continue;
        var words = decode(m[4]).replace(/\s+/g, " ").trim();
        if (!words) continue;
        visible.push(words);
        // Authenticated Safari: div#Main > div.box > div.cell > span.gray, with leading spacing.
        if (!parent.side && /^(?:(?:\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{8})\s*(?:的\s*)?)?(?:每日登录奖励已领取|今日的登录奖励已领取|已成功领取(?:每日登录奖励)?(?:\s*\d+(?:\.\d+)?\s*铜币)?|(?:Today's |The )?daily login reward has been claimed)[。.!！]?$/i.test(words)) done = true;
        continue;
      }
      var tag = m[2].toLowerCase();
      if (m[1]) {
        for (var j = stack.length - 1; j >= 0; j--) {
          if (stack[j].tag === tag) { stack.length = j; break; }
        }
        continue;
      }
      var a = attrs(m[3]), classes = a["class"] || "";
      // A base URL can change the destination of a displayed relative navigation.
      if (tag === "base" && a.href && !/^https:\/\/(?:www\.)?v2ex\.com(?:\/[^?#]*)?$/.test(a.href)) conflict = true;
      var hidden = parent.hidden || /^(template|noscript|iframe|object|svg|head)$/i.test(tag) ||
        a.hidden !== undefined || a.inert !== undefined || a["aria-hidden"] === "true" ||
        /(?:^|\s)(?:hidden|d-none|hide)(?:\s|$)/i.test(classes) ||
        /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(a.style || "") ||
        (a.type || "").toLowerCase() === "hidden";
      var side = parent.side || /^(aside|footer|nav|header)$/.test(tag) || /^(Top|Bottom|Rightbar|Leftbar)$/i.test(a.id || "");
      var disabled = parent.disabled || a.disabled !== undefined || a["aria-disabled"] === "true";
      if (!hidden) {
        if (tag === "form" && /^\/signin(?:[?#]|$)/i.test(a.action || "")) login = true;
        if (/^(?:cf-challenge-running|challenge-running|challenge-form)$/i.test(a.id || "") ||
            /(?:^|\s)(?:cf-turnstile|g-recaptcha|h-captcha)(?:\s|$)/i.test(classes)) blocked = true;
        if (!side && !disabled && /^(a|input|button)$/.test(tag)) {
          var href = (a.href || "").trim(), js = (a.onclick || "").trim();
          if (/\/mission\/daily\/redeem\b/i.test(href + " " + js)) {
            var assignment = /^((?:window\.)?location\.href)\s*=\s*(["'])([^"']+)\2\s*;?$/i.exec(js);
            var url = tag === "a" && !js ? href : (tag !== "a" && !href && assignment ? assignment[3] : "");
            var action = /^(?:https:\/\/(?:www\.)?v2ex\.com)?(\/mission\/daily\/redeem\?once=\d+)$/.exec(url);
            var otherEvent = Object.keys(a).some(function (k) { return /^on/i.test(k) && k !== "onclick"; });
            if (!action || a.duplicate || otherEvent || parent.inForm || a.form !== undefined ||
                a.formaction !== undefined || (path && path !== action[1])) conflict = true;
            else path = action[1];
          }
        }
      }
      if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag))
        stack.push({tag: tag, hidden: hidden, side: side, disabled: disabled, inForm: parent.inForm || tag === "form"});
    }
    var text = visible.join(" ");
    if (done && !path) return {kind: "claimed"};
    if (blocked || /浏览器有一些奇奇怪怪的设置|请用一个干净安装的浏览器重试|verify you are human|checking your browser/i.test(text)) {
      console.log("V2EX 拦截详情: blocked=" + blocked + " 文本=" + text.slice(0, 100));
      return {kind: "blocked"};
    }
    if (login || /need to sign in first|你要查看的页面需要先登录|请先登录/i.test(text)) return {kind: "login"};
    if (/请重新点击一次以领取每日登录奖励/.test(text)) return {kind: "again"};
    if (conflict || (done && path)) return {kind: "unknown"};
    if (done) return {kind: "claimed"};
    return path ? {kind: "ready", path: path} : {kind: "unknown"};
  }

  function classify(error, response, body) {
    const status = Number(response && response.status);
    if (error) {
      const detail = /timeout|timed out/i.test(String(error)) ? "网络请求超时" :
        /socket closed|remote peer/i.test(String(error)) ? "网络连接被远端关闭" : "网络请求失败";
      return {kind: "network", detail};
    }
    if (status === 401) return {kind: "login", status};
    if (status === 403 || status === 429) return {kind: "blocked", status};
    if (status >= 300 && status < 400) {
      const location = String(header(response.headers, "location"));
      const path = location.replace(/^https?:\/\/(?:www\.)?v2ex\.com(?:\/|$)/i, "/");
      if (/^\/signin(?:[?#]|$)/.test(path)) return {kind: "login", status};
      if (/^\/mission\/daily(?:[?#]|$)/.test(path)) return {kind: "dailyRedirect", status};
      return {kind: "redirect", status};
    }
    if (status !== 200) return {kind: "http", status};
    if (!/^text\/html(?:\s*;|\s*$)/i.test(header(response.headers, "content-type")) ||
        typeof body !== "string" || !body.trim()) return {kind: "unreadable", status};
    return Object.assign({status}, inspectDailyPage(body));
  }

  function description(result) {
    const label = result.status ? "HTTP " + result.status + "，" : "";
    switch (result.kind) {
      case "network": return result.detail;
      case "login": return label + "登录失效，请更新当前使用的授权";
      case "blocked": return label + (result.status === 429 ? "网站限流，请稍后再查看" : "网站拒绝请求或要求验证，请在 Safari 处理");
      case "redirect": return label + "网站跳到了其他页面";
      case "dailyRedirect": return label + "网站返回任务页跳转";
      case "again": return label + "网站要求再次点击，请在 Safari 操作";
      case "ready": return label + "任务页仍显示可领取";
      case "unreadable": return label + "响应中没有可读的 HTML 任务页";
      case "http": return label + "网站未返回正常任务页";
      default: return label + "页面结构无法确认";
    }
  }

  function capture() {
    if ($request.method !== "GET" || !DAILY_URL.test($request.url)) return "";
    if (typeof $response === "undefined") return "请更新插件并刷新脚本后，再从 Safari 进入每日任务页。";
    const page = classify(null, $response, $response.body);
    if (page.kind !== "ready" && page.kind !== "claimed") return "授权未更新。" + description(page);
    const input = authCookie(header($request.headers, "cookie"));
    if (!input) return "页面已打开，但未读到可用登录字段。请确认 Safari 已登录。";
    const value = updatedCookie(input, $response.headers);
    if (!value || !write(SESSION, value)) return "本机登录状态保存失败。";
    return "已保存本机登录状态。请关闭「捕获登录状态」，手动运行「V2EX 检查登录」。";
  }

  function get(session, url, referer) {
    return new Promise(resolve => {
      let complete = false;
      setTimeout(() => receive("timeout"), 12000);
      function receive(error, response, body) {
        if (complete) return;
        complete = true;
        // Loon has no reliable clearTimeout. Late callbacks return above.
        try {
          if (!error && response) session.cookie = updatedCookie(session.cookie, response.headers);
          resolve(classify(error, response, body));
        } catch (_) { resolve({kind: "unreadable"}); }
      }
      const headers = {
        Cookie: session.cookie,
        "User-Agent": AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh-Hans;q=0.9",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document"
      };
      if (referer) headers.Referer = referer;
      const isDevice = typeof $loon !== "undefined";
      const opts = {
        url,
        headers,
        timeout: 10000,
        insecure: false,
        "auto-redirect": isDevice ? true : false,
        "auto-cookie": isDevice ? true : false
      };
      try {
        $httpClient.get(opts, receive);
      } catch (_) { receive("network"); }
    });
  }

  function isBarrier(page) { return page.kind === "blocked" || page.kind === "login"; }

  async function dailyPage(session, referer) {
    if (!session.cookie) return {kind: "login"};
    const ref = referer || HOME;
    let page = await get(session, DAILY, ref);
    if (page.kind === "network") page = await get(session, DAILY, ref);
    if (session.cookie && (page.kind === "claimed" || page.kind === "ready") && session.persist &&
        read(SESSION) === session.prior && session.cookie !== session.prior) {
      if (write(SESSION, session.cookie)) session.prior = session.cookie;
    }
    return page;
  }

  async function runAccount(session, onlyCheck, ownsLease) {
    const before = await dailyPage(session);
    if (before.kind === "claimed") return {message: "今日已签到，登录奖励已领取"};
    if (before.kind !== "ready") return {message: "读取任务页：" + description(before), stop: before.kind === "blocked"};
    if (onlyCheck) return {message: "登录有效，今日奖励可领取。"};
    if (!session.cookie) return {message: "任务页已撤销登录状态，请重新授权。"};
    if (!ownsLease()) return {message: "本机运行状态已变化，本次未提交。", stop: true};

    const receipt = await get(session, HOME.slice(0, -1) + before.path, DAILY);
    console.log("V2EX 提交领取响应: HTTP " + receipt.status + " (" + receipt.kind + ")");
    if (isBarrier(receipt)) return {message: "提交领取：" + description(receipt), stop: receipt.kind === "blocked"};
    if (typeof $loon !== "undefined") await new Promise(r => setTimeout(r, 2000));
    const after = await dailyPage(session, DAILY);
    console.log("V2EX 复查页面响应: HTTP " + after.status + " (" + after.kind + ")");
    if (after.kind === "claimed") return {message: "签到成功，今日登录奖励已领取"};
    const first = receipt.kind === "claimed" ? "领取响应显示已领" :
      receipt.kind === "unknown" && receipt.status === 200 ? "领取响应 HTTP 200" : description(receipt);
    return {message: (after.kind === "ready" ? "尚未领取。" : "领取结果未确认。") +
      first + "；再次读取：" + description(after) + "。本次已停止，点通知可到 V2EX 首页查看。", stop: after.kind === "blocked"};
  }

  let lease = "";
  async function scheduled() {
    let auth;
    try { auth = credentials(); } catch (e) { return e instanceof CredentialError ? e.message : "无法读取本机授权，请检查 Loon 的脚本存储。"; }
    // Only the Cron rule binds daily. The manual diagnostic never receives it.
    const onlyCheck = args.daily !== true;
    const now = Date.now();
    const until = Number(read(LEASE).split("/")[0]);
    if (until > now && until <= now + 125000) return "本机已有任务在运行，请等它结束后再试。";
    lease = (now + 125000) + "/" + Math.random().toString(36).slice(2);
    const ownsLease = () => read(LEASE) === lease;
    if (!write(LEASE, lease) || !ownsLease()) return "无法取得本机运行状态，本次未提交。";
    const reports = [];
    for (const initial of auth.values) {
      // Reserve room for two reads, one submission and two verification reads.
      if (Date.now() - now > 55000) {
        reports.push("剩余账号尚未检查，已接近 Loon 执行时限。");
        break;
      }
      const session = {cookie: initial, prior: auth.source === "本机授权" ? initial : "",
        persist: auth.source === "本机授权" || (auth.source === "旧版" && auth.values.length === 1)};
      const result = await runAccount(session, onlyCheck, ownsLease);
      const prefix = auth.values.length > 1 ? "账号 " + (reports.length + 1) + " · " : "";
      reports.push(prefix + result.message);
      console.log("V2EX · " + auth.source + " · " + result.message);
      if (result.stop) break;
    }
    return reports.join("\n");
  }

  (async function main() {
    let message;
    try { message = intercepted ? capture() : await scheduled(); }
    catch (_) { message = "本次未能确认结果，请在 Safari 查看每日任务页。"; }
    finally {
      try {
        try { if (lease && read(LEASE) === lease) write(LEASE, ""); } catch (_) {}
        if (message) $notification.post("V2EX 每日奖励", "", message, HOME);
      } finally { if (intercepted) $done({}); else $done(); }
    }
  })();
})();

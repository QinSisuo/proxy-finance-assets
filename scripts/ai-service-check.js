/* Loon Generic: service-specific, anonymous HTTPS diagnostics.
 * No credentials, conversation requests, or policy changes. Keeps 10 local summaries.
 * A reachable entry page is not proof that an account can chat.
 * Sources and limitations: docs/ai-service-check.md
 */
(function () {
  "use strict";
  var SERVICES = {
    ChatGPT: [{ name: "网页入口", url: "https://chatgpt.com/" },
              { name: "移动辅助入口", url: "https://ios.chat.openai.com/" }],
    Claude: [{ name: "网页入口", url: "https://claude.ai/" }],
    Gemini: [{ name: "网页入口", url: "https://gemini.google.com/app?hl=en" }]
  };
  function headersLower(headers) {
    var out = {};
    Object.keys(headers || {}).forEach(function (k) { out[k.toLowerCase()] = String(headers[k]); });
    return out;
  }
  function host(url) { return ((String(url).match(/^https:\/\/([^/?#]+)/i) || [])[1] || "").toLowerCase(); }
  function resolveLocation(url, location) {
    location = String(location || "").trim();
    if (!location || /[\r\n]/.test(location)) return "";
    if (/^https:\/\//i.test(location)) return location;
    if (/^\/\//.test(location)) return "https:" + location;
    if (/^[a-z][a-z0-9+.-]*:/i.test(location) || !host(url)) return "";
    var origin = "https://" + host(url);
    var base = String(url).replace(/^https:\/\/[^/?#]+/i, "").split("#")[0] || "/";
    if (location.charAt(0) === "#") return origin + base + location;
    if (location.charAt(0) === "?") return origin + base.split("?")[0] + location;
    var path = location.charAt(0) === "/" ? location : base.split("?")[0].replace(/[^/]*$/, "") + location;
    var suffix = (path.match(/[?#][\s\S]*$/) || [""])[0];
    var parts = [];
    path.split(/[?#]/)[0].split("/").forEach(function (part) {
      if (part === "..") parts.pop();
      else if (part !== ".") parts.push(part);
    });
    return origin + parts.join("/") + suffix;
  }
  function claudeRegionRedirect(url) {
    return /^https:\/\/(?:www\.)?(?:anthropic\.com|claude\.com)\/app-unavailable-in-region(?:[/?#]|$)/i.test(url);
  }
  function result(kind, label, detail) { return { kind: kind, label: label, detail: detail || "" }; }
  function errorInfo(error) {
    var text = typeof error === "string" ? error : error && (error.message || error.localizedDescription || error.description) || "未提供错误说明";
    var domain = error && typeof error === "object" ? String(error.domain || "") : (String(text).match(/Domain=(NSURLErrorDomain)\b/) || [])[1] || "";
    var code = error && typeof error === "object" ? Number(error.code) : Number((String(text).match(/\bCode=(-?\d+)/) || [])[1]);
    text = String(text).split(/UserInfo\s*=/)[0].replace(/https?:\/\/[^\s"<>]+/gi, "[请求网址]").replace(/\s+/g, " ").slice(0, 300);
    if (typeof error === "object" && domain && Number.isFinite(code)) text = domain + " Code=" + code + " " + text;
    return { text: text, domain: domain, code: code };
  }
  function classify(service, probe, response) {
    if (response.error) {
      var info = errorInfo(response.error), error = info.text, code = info.domain === "NSURLErrorDomain" ? info.code : null;
      var evidence = "；底层错误：" + error;
      if (code === -1001 || /timed?\s*out|timeout|超时/i.test(error)) return result("timeout", "请求超时", "本次未得到响应，不能据此判断地区限制" + evidence);
      if (code <= -1200 && code >= -1206 || /certificate|\bTLS\b|\bSSL\b|TLSError|SSLError|证书/i.test(error)) return result("network", "TLS 或证书错误", "该请求未通过安全连接检查，不能据此判断地区限制" + evidence);
      if (code === -1003 || code === -1006 || /\bDNS\b|resolve|nodename|找不到主机/i.test(error)) return result("network", "域名解析失败", "检查该节点的域名解析，不能据此判断地区限制" + evidence);
      if (code === -1015 || code === -1016 || code === -1017 || /decode|encoding|parse response|数据.*格式|解码/i.test(error)) return result("decode", "响应解析失败", "运行时未能解析响应，不能据此判断服务或地区不可用" + evidence);
      if (code === -1004 || code === -1005 || code === -1009 || /connection|connect|network|reset|refused|unreachable|连接|网络/i.test(error)) return result("network", "连接失败", "该节点未完成请求，不能据此判断地区限制" + evidence);
      return result("unknown", "请求失败，原因待确认", "未识别底层错误类型，不能据此判断服务或地区不可用" + evidence);
    }
    var status = Number(response.status), h = headersLower(response.headers);
    var body = typeof response.body === "string" ? response.body : "";
    var location = resolveLocation(response.url || probe.url, h.location || "");
    if (service === "Claude" && status >= 300 && status < 400 && claudeRegionRedirect(location)) {
      return result("region", "明确地区限制", "Claude 重定向到官方地区不可用页面");
    }
    if (h["cf-mitigated"] === "challenge" || /<title[^>]*>\s*Just a moment(?:\.\.\.)?\s*<\/title>/i.test(body)) {
      return result("challenge", "遇到验证挑战", "脚本无法完成验证；此结果不等于地区不支持");
    }
    var json = null;
    try { json = JSON.parse(body); } catch (_) {}
    var code = json && json.error && (json.error.code || json.error.type);
    if (code === "unsupported_country" || code === "unsupported_country_region_territory") {
      return result("region", "明确地区限制", "该入口返回 " + code);
    }
    if (status === 401) return result("auth", "入口要求登录", "已收到认证响应；未验证账号与对话功能");
    if (status === 429) return result("rate", "请求受到限流", "稍后重试，不能据此判断地区限制");
    if (status === 403 || status === 451) {
      var detail = "该入口拒绝本次请求，具体原因尚未确认";
      if (json && json.type === "dc") detail += "（响应 type=dc）";
      if (json && typeof json.cf_details === "string" && /VPN/i.test(json.cf_details)) detail += "；响应提及 VPN";
      return result("denied", "访问被拒绝", detail);
    }
    if (status >= 500) return result("server", "服务端错误", "本次 HTTP " + status);
    if (status >= 300 && status < 400) {
      if (service === "Gemini" && /^https:\/\/(?:www\.)?google\.com\/sorry\//i.test(location)) return result("challenge", "Google 要求验证", "实际跳转到 Google 验证页面");
      if (service === "Gemini" && host(location) === "accounts.google.com") return result("auth", "入口要求登录", "实际跳转到 Google 登录页面；未验证账号功能");
      return result("redirect", "重定向，待确认", location ? "跳转目标：" + host(location) : "未识别跳转目标");
    }
    if (status >= 200 && status < 300) {
      // Inspect actual visible error headings, never preloaded translations in scripts.
      var markup = body.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, "");
      var heading, headingPattern = /<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi;
      while ((heading = headingPattern.exec(markup))) {
        var visible = heading[1].replace(/<[^>]*>/g, " ").replace(/&#39;|&apos;/g, "'").replace(/&rsquo;/g, "’").replace(/\s+/g, " ").trim();
        if (/^(?:Gemini|Claude) (?:is not|isn't|isn’t) (?:currently )?available in (?:your|this) (?:country|region)(?: yet)?[.!]?$/i.test(visible)) {
          return result("region", "页面提示地区限制", visible);
        }
      }
      var title = (markup.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
      var expected = service === "ChatGPT" ? /ChatGPT/i : service === "Claude" ? /Claude/i : /Gemini/i;
      if (expected.test(title)) {
        var detail = "识别到服务页面标题；账号与对话功能仍需验证";
        if (service === "Gemini") {
          var matches = {}, match, re = /,\s*2\s*,\s*1\s*,\s*200\s*,\s*"([A-Z]{3})"/g;
          while ((match = re.exec(body))) matches[match[1]] = true;
          var regions = Object.keys(matches);
          detail += regions.length === 1 ? "；页面地区标记：" + regions[0] + "（非公开字段，仅供对照）" : "；页面地区未知";
        }
        return result("page", "收到服务网页", detail);
      }
      return result("unknown", "有响应，无法确认", "HTTP " + status + "，未识别服务页面；不判定为可用");
    }
    return result("unknown", "无法确认", "HTTP " + status);
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function configuredGroups(config) {
    try {
      if (!config || typeof config.getConfig !== "function") return [];
      var summary = config.getConfig();
      if (typeof summary === "string") summary = JSON.parse(summary);
      var groups = summary && summary.all_policy_groups;
      return Array.isArray(groups) ? groups.filter(function (name) { return typeof name === "string"; }) : [];
    } catch (_) { return []; }
  }
  function selectedNode(params, service, config) {
    var explicit = params.nodeInfo && params.nodeInfo.name || params.node;
    var name = explicit || params.policyGroup || service;
    if (typeof name !== "string" || !name) throw new Error("没有可测试的节点或策略组");
    var groups = configuredGroups(config);
    if (!explicit && (!config || typeof config.getSelectedPolicy !== "function") && groups.indexOf(name) < 0) throw new Error("无法读取策略组所选节点；请长按具体节点运行");
    // Snapshot a selected child so all requests use the same node during this run.
    var seen = {};
    for (var i = 0; i < 12; i++) {
      if (seen[name]) throw new Error("策略组引用循环");
      seen[name] = true;
      var next = config && config.getSelectedPolicy ? config.getSelectedPolicy(name) : "";
      if (!next) {
        // Loon may omit an implicit default selection. Route through the group only
        // after confirming that this exact group exists in the current config.
        if (i === 0 && !explicit && groups.indexOf(name) < 0) throw new Error("未读到 " + name + " 的所选节点；请长按具体节点运行");
        if (/^(DIRECT|REJECT(?:-DROP)?)$/i.test(name)) throw new Error("当前选择为 " + name + "，请选择代理节点");
        return name;
      }
      name = next;
    }
    throw new Error("策略组嵌套过深，未执行检测");
  }
  var HISTORY_KEY = "ai-service-check.history.v2";
  function parseOptions(argument) {
    var values = {};
    if (argument && typeof argument === "object") values = argument;
    else if (typeof argument === "string") {
      if (argument.indexOf("=") < 0) values.service = argument;
      else argument.split("&").forEach(function (part) {
        var equals = part.indexOf("=");
        if (equals < 0) throw new Error("参数格式错误");
        values[part.slice(0, equals)] = decodeURIComponent(part.slice(equals + 1));
      });
    }
    var options = { service: values.service || "all", timeout: values.timeout == null ? 12 : Number(values.timeout),
      retry: values.retry == null ? 1 : Number(values.retry), history: String(values.history) !== "false", nodes: [] };
    if (!Number.isFinite(options.timeout) || options.timeout < 3 || options.timeout > 20) throw new Error("timeout 应为 3–20 秒");
    if (options.retry !== 0 && options.retry !== 1) throw new Error("retry 应为 0 或 1");
    if (values.node) options.nodes = [values.node];
    if (values.nodes) options.nodes = Array.isArray(values.nodes) ? values.nodes : JSON.parse(values.nodes);
    if (!Array.isArray(options.nodes) || options.nodes.length > 3 || options.nodes.some(function (n) { return typeof n !== "string" || !n.trim(); })) throw new Error("nodes 应为最多 3 个节点名称的 JSON 数组");
    options.nodes = options.nodes.filter(function (n, i, all) { return all.indexOf(n) === i; });
    if (options.service !== "all" && options.service !== "history" && !SERVICES[options.service]) throw new Error("未知检测服务");
    return options;
  }
  function retryable(response) {
    if (!response.error) return false;
    var verdict = classify("", {}, response);
    return verdict.kind === "timeout" || verdict.kind === "network" && verdict.label === "连接失败";
  }
  function request(probe, node, service, label, options) {
    options = options || { timeout: 12, retry: 1 };
    var started = Date.now(), deadline = started + 28000, attempts = [], retried = false;
    function once(url, hops) {
      var remaining = deadline - Date.now();
      if (remaining <= 0) return Promise.resolve({ error: "timeout", url: url });
      var timeout = Math.min(options.timeout * 1000, remaining);
      var attempt = { url: url, elapsed: 0, status: 0, kind: "unknown", label: "未完成" };
      attempts.push(attempt);
      var attemptStarted = Date.now();
      return new Promise(function (resolve) {
        var settled = false;
        function finish(value) {
          if (settled) return;
          settled = true;
          var verdict = classify(service, probe, value);
          attempt.elapsed = Date.now() - attemptStarted;
          attempt.status = Number(value.status) || 0;
          attempt.kind = verdict.kind; attempt.label = verdict.label;
          if (value.error) attempt.error = errorInfo(value.error).text;
          resolve(value);
        }
        // Loon has no reliable clearTimeout; settled also ignores late callbacks.
        setTimeout(function () { finish({ error: "timeout", url: url }); }, Math.min(timeout + 500, remaining));
        try {
          $httpClient.get({
            url: url, node: node, timeout: timeout, insecure: false,
            "auto-redirect": false, "auto-cookie": false,
            headers: { "Accept": "text/html,application/json", "Accept-Language": "en-US,en;q=0.9" }
          }, function (error, response, data) {
            finish({ error: error, status: response && response.status,
              headers: response && response.headers || {}, body: data, url: url });
          });
        } catch (error) { finish({ error: String(error), url: url }); }
      }).then(function (r) {
        if (retryable(r) && options.retry && !retried && deadline - Date.now() >= 3000) {
          retried = true;
          return once(url, hops);
        }
        var location = resolveLocation(url, headersLower(r.headers).location || "");
        if (!r.error && r.status >= 300 && r.status < 400 && location &&
            host(location) === host(probe.url) && location !== url && hops < 2) {
          return once(location, hops + 1);
        }
        return r;
      });
    }
    return once(probe.url, 0).then(function (r) {
      var verdict = classify(service, probe, r);
      verdict.service = service; verdict.probe = probe.name; verdict.node = label || node;
      verdict.url = r.url; verdict.status = Number(r.status) || 0;
      verdict.elapsed = Date.now() - started; verdict.attempts = attempts; verdict.retried = retried;
      if (retried && !r.error) verdict.detail += "；重试后收到响应，首次连接不稳定";
      return verdict;
    });
  }
  function readHistory(store) {
    try {
      var history = store && store.read && JSON.parse(store.read(HISTORY_KEY) || "[]");
      return Array.isArray(history) ? history.slice(-10).filter(function (r) { return r && Array.isArray(r.rows) && typeof r.time === "string"; }) : [];
    } catch (_) { return []; }
  }
  function saveReport(report, store) {
    if (!store || typeof store.write !== "function") return false;
    try {
      var history = readHistory(store); history.push(report);
      return store.write(JSON.stringify(history.slice(-10)), HISTORY_KEY) === true;
    } catch (_) { return false; }
  }
  function webPath() {
    if (typeof $request === "undefined" || !$request) return null;
    var match = String($request.url || "").match(/^http:\/\/(?:loon-ai\.test|198\.19\.255\.254)(\/[^?#]*)?(?:[?#].*)?$/i);
    return match ? match[1] || "/" : null;
  }
  function finish(payload, status) {
    if (webPath() === null) { $done(payload); return; }
    var navigation = '<p><a href="/">首页</a> · <a href="/compare">同节点对比</a> · <a href="/groups">当前策略组</a> · <a href="/history">最近记录</a></p>';
    var html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHTML(payload.title) +
      '</title><style>body{max-width:960px;margin:24px auto;padding:0 16px;font:16px/1.6 -apple-system,sans-serif}a{color:#386e9c}td{overflow-wrap:anywhere}pre{white-space:pre-wrap}</style></head><body><h1>' + escapeHTML(payload.title) + '</h1>' + navigation +
      (payload.htmlMessage || '<pre>' + escapeHTML(payload.content || "") + '</pre>') + '</body></html>';
    $done({ response: { status: status || 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" }, body: html } });
  }
  function render(rows, report) {
    report = report || {};
    var colors = { page: "#386e9c", region: "#b33737", denied: "#b33737" };
    var html = '<div style="font-family:-apple-system;font-size:15px;line-height:1.55">';
    html += '<p>检测时间：' + escapeHTML(report.time || "未记录") + '<br>模式：' + escapeHTML(report.mode || "专项诊断") + '</p>';
    html += '<p>匿名入口检测；账号与实际对话尚未验证。移动入口拒绝单独显示，不据此判定整个 ChatGPT 不可用。</p>';
    html += '<table style="border-collapse:collapse;width:100%;font-size:13px"><tr><th>节点</th><th>ChatGPT 网页</th><th>Claude</th><th>Gemini</th></tr>';
    var nodes = [];
    rows.forEach(function (r) { if (r.node && nodes.indexOf(r.node) < 0) nodes.push(r.node); });
    nodes.forEach(function (node) {
      html += '<tr><td style="border:1px solid #999;padding:5px">' + escapeHTML(node) + '</td>';
      Object.keys(SERVICES).forEach(function (service) {
        var r = rows.filter(function (row) { return row.node === node && row.service === service && row.probe === "网页入口"; })[0];
        html += '<td style="border:1px solid #999;padding:5px">' + escapeHTML(r ? r.label + (r.retried ? "（已重试）" : "") : "未检测") + '</td>';
      });
      html += '</tr>';
    });
    html += '</table>';
    rows.forEach(function (r) {
      html += '<div style="margin:14px 0;padding:10px;border:1px solid #999;border-radius:8px">';
      html += '<b>' + escapeHTML(r.service + " · " + r.probe) + '</b><br>';
      html += '<span style="color:' + (colors[r.kind] || "#a66a00") + '">' + escapeHTML(r.label) + '</span><br>';
      html += escapeHTML(r.detail) + '<br><small>测试出口：' + escapeHTML(r.node || "未确定") + '<br>';
      if (r.status) html += 'HTTP ' + r.status + ' · ';
      if (r.elapsed != null) html += escapeHTML(r.elapsed) + ' ms · ';
      html += escapeHTML(r.url || "");
      (r.attempts || []).forEach(function (a, i) {
        html += '<br>请求 ' + (i + 1) + '：' + escapeHTML(a.label) + (a.status ? ' / HTTP ' + escapeHTML(a.status) : '') + ' / ' + escapeHTML(a.elapsed) + ' ms';
        if (a.error) html += ' / ' + escapeHTML(a.error);
      });
      html += '</small></div>';
    });
    return html + '<p>实际能否聊天，请在相同节点下用对应 App 验证。</p></div>';
  }
  function run() {
    console.log("AI_SERVICE_CHECK_V2: 开始专项诊断");
    if (typeof $request !== "undefined" && webPath() === null) { $done({}); return Promise.resolve(); }
    var options = parseOptions(typeof $argument === "undefined" ? null : $argument);
    var store = typeof $persistentStore === "undefined" ? null : $persistentStore;
    var path = webPath();
    if (path !== null) {
      if ($request.method && String($request.method).toUpperCase() !== "GET") {
        finish({ title: "请使用浏览器打开诊断页", content: "仅支持 GET" }, 405); return Promise.resolve();
      }
      if (path === "/") {
        finish({ title: "Loon AI 诊断", htmlMessage: '<p>点击「同节点对比」，分别检测以下节点的 ChatGPT、Claude 和 Gemini 入口：</p><ul>' +
          options.nodes.map(function (node) { return '<li>' + escapeHTML(node) + '</li>'; }).join("") +
          '</ul><p>检测最多约 28 秒。首页和最近记录不会发起服务检测。实际能否聊天需在对应 App 中验证。</p><p>要检查原有三个策略组的当前选择，点击「当前策略组」。</p>' });
        return Promise.resolve();
      }
      if (path === "/history") options.service = "history";
      else if (path === "/groups") options.nodes = [];
      else if (path === "/compare") {
        if (!options.nodes.length) throw new Error("此入口未配置比较节点，请在脚本参数中指定 node 或 nodes");
      } else { finish({ title: "没有这个诊断页面", content: "请返回首页" }, 404); return Promise.resolve(); }
    }
    if (options.service === "history") {
      var history = readHistory(store).reverse();
      finish({ title: "AI 最近检测", content: history.length ? "本机最近 " + history.length + " 次检测" : "本机尚无检测记录",
        htmlMessage: history.map(function (report) { return render(report.rows, report); }).join('<hr>') || '<p>本机尚无检测记录，请先运行专项诊断。</p>' });
      return Promise.resolve();
    }
    var names = options.service === "all" ? Object.keys(SERVICES) : [options.service];
    var environment = typeof $environment === "undefined" ? {} : ($environment || {});
    var params = environment.params || {};
    var config = typeof $config === "undefined" ? null : $config;
    var groups = configuredGroups(config), jobs = [], time = new Date().toISOString();
    var targets = options.nodes.length ? options.nodes.map(function (node) { return { node: node }; }) : [params];
    var fixed = options.nodes.length > 0 || !!(params.nodeInfo && params.nodeInfo.name || params.node || params.policyGroup);
    // Resolve every target before starting requests, so each comparison uses a snapshot.
    var plan = [];
    targets.forEach(function (target) {
      names.forEach(function (service) {
        try {
          var node = selectedNode(target, service, config);
          if (fixed && groups.indexOf(node) >= 0) throw new Error("未解析到具体节点：" + node + "；请选择或明确指定节点再比较");
          var label = groups.indexOf(node) >= 0 ? "策略组 " + node + "（当前选择由 Loon 解析）" : node;
          plan.push({ service: service, node: node, label: label });
        } catch (error) {
          jobs.push(Promise.resolve({ service: service, probe: "节点选择", node: target.node || "", kind: "unknown", label: "未执行检测", detail: String(error) }));
        }
      });
    });
    plan.forEach(function (p) { SERVICES[p.service].forEach(function (probe) { jobs.push(request(probe, p.node, p.service, p.label, options)); }); });
    return Promise.all(jobs).then(function (rows) {
      var report = { time: time, mode: fixed ? "固定节点对比" : "分别检测各服务策略组", rows: rows };
      var saved = options.history && saveReport(report, store);
      var content = "检测时间：" + time + "；" + report.mode + "\n" + rows.map(function (r) {
        return r.service + " / " + r.probe + ": " + r.label + "；" + r.detail + (r.status ? "；HTTP " + r.status : "") + (r.elapsed != null ? "；" + r.elapsed + " ms" : "") + "；测试出口：" + (r.node || "未确定") +
          (r.attempts ? "；" + r.attempts.map(function (a, i) { return "请求" + (i + 1) + "=" + a.label + (a.status ? "/HTTP " + a.status : "") + "/" + a.elapsed + "ms"; }).join("，") : "");
      }).join("\n") + "\n本机记录：" + (saved ? "已保存（最多 10 次）" : options.history ? "未能保存" : "已关闭");
      console.log(content);
      console.log("AI_SERVICE_CHECK_REPORT=" + JSON.stringify(report));
      finish({ title: fixed ? "AI 同节点对比" : "AI 三服务诊断", content: content, htmlMessage: render(rows, report) });
    });
  }
  function fail(error) {
    console.log("AI_SERVICE_CHECK: " + String(error));
    finish({ title: "AI 检测失败", content: String(error) }, 500);
  }
  if (typeof $httpClient === "undefined" && typeof module !== "undefined" && module.exports) {
    module.exports = { classify: classify, selectedNode: selectedNode, render: render, resolveLocation: resolveLocation, parseOptions: parseOptions, request: request, readHistory: readHistory, saveReport: saveReport, run: run };
  } else {
    try { run().catch(fail); }
    catch (error) { fail(error); }
  }
}());

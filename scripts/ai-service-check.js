/* Loon Generic: service-specific, anonymous HTTPS diagnostics.
 * No credentials, conversation requests, policy changes, or stored results.
 * A reachable entry page is not proof that an account can chat.
 * Sources and limitations: docs/ai-service-check.md
 */
(function () {
  "use strict";
  var SERVICES = {
    ChatGPT: [{ name: "网页入口", url: "https://chatgpt.com/" },
              { name: "移动入口", url: "https://ios.chat.openai.com/" }],
    Claude: [{ name: "网页入口", url: "https://claude.ai/" }],
    Gemini: [{ name: "网页入口", url: "https://gemini.google.com/app?hl=en" }]
  };
  function headersLower(headers) {
    var out = {};
    Object.keys(headers || {}).forEach(function (k) { out[k.toLowerCase()] = String(headers[k]); });
    return out;
  }
  function host(url) { return (String(url).match(/^https:\/\/([^/?#]+)/i) || [])[1] || ""; }
  function resolveLocation(url, location) {
    if (/^https:\/\//i.test(location)) return location;
    if (/^\/\//.test(location)) return "https:" + location;
    if (/^\//.test(location)) return "https://" + host(url) + location;
    return "";
  }
  function claudeRegionRedirect(url) {
    return /^https:\/\/(?:www\.)?(?:anthropic\.com|claude\.com)\/app-unavailable-in-region(?:[/?#]|$)/i.test(url);
  }
  function result(kind, label, detail) { return { kind: kind, label: label, detail: detail || "" }; }
  function classify(service, probe, response) {
    if (response.error) {
      var error = String(response.error);
      if (/timed?\s*out|timeout|超时/i.test(error)) return result("timeout", "请求超时", "本次未得到响应，不能据此判断地区限制");
      if (/certificate|\bTLS\b|\bSSL\b|证书/i.test(error)) return result("network", "TLS 或证书错误", "该请求未通过安全连接检查，不能据此判断地区限制");
      if (/\bDNS\b|resolve|nodename|找不到主机/i.test(error)) return result("network", "域名解析失败", "检查该节点的域名解析，不能据此判断地区限制");
      return result("network", "连接失败", "该节点未完成请求，不能据此判断地区限制");
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
  function selectedNode(params, service, config) {
    var explicit = params.nodeInfo && params.nodeInfo.name || params.node;
    var name = explicit || params.policyGroup || service;
    if (typeof name !== "string" || !name) throw new Error("没有可测试的节点或策略组");
    if (!explicit && (!config || typeof config.getSelectedPolicy !== "function")) throw new Error("无法读取策略组所选节点；请长按具体节点运行");
    // Snapshot a selected child so all requests use the same node during this run.
    var seen = {};
    for (var i = 0; i < 12; i++) {
      if (seen[name]) throw new Error("策略组引用循环");
      seen[name] = true;
      var next = config && config.getSelectedPolicy ? config.getSelectedPolicy(name) : "";
      if (!next) {
        if (i === 0 && !explicit) throw new Error("未读到 " + name + " 的所选节点；请长按具体节点运行");
        if (/^(DIRECT|REJECT(?:-DROP)?)$/i.test(name)) throw new Error("当前选择为 " + name + "，请选择代理节点");
        return name;
      }
      name = next;
    }
    throw new Error("策略组嵌套过深，未执行检测");
  }
  function request(probe, node, service) {
    var started = Date.now();
    function once(url, hops) {
      return new Promise(function (resolve) {
        var settled = false;
        function finish(value) { if (!settled) { settled = true; resolve(value); } }
        setTimeout(function () { finish({ error: "timeout", url: url }); }, 9000);
        try {
          $httpClient.get({
            url: url, node: node, timeout: 8000, insecure: false,
            "auto-redirect": false, "auto-cookie": false,
            headers: { "Accept": "text/html,application/json", "Accept-Language": "en-US,en;q=0.9" }
          }, function (error, response, data) {
            finish({ error: error, status: response && response.status,
              headers: response && response.headers || {}, body: data, url: url });
          });
        } catch (error) { finish({ error: String(error), url: url }); }
      }).then(function (r) {
        var location = resolveLocation(url, headersLower(r.headers).location || "");
        // Follow only same-host HTTPS redirects, retaining the exact chosen node.
        // Cross-host login and region redirects are displayed, never silently treated as success.
        if (!r.error && r.status >= 300 && r.status < 400 && location &&
            host(location) === host(probe.url) && location !== url && hops < 2) {
          return once(location, hops + 1);
        }
        var verdict = classify(service, probe, r);
        verdict.service = service; verdict.probe = probe.name; verdict.node = node;
        verdict.url = r.url; verdict.status = Number(r.status) || 0;
        verdict.elapsed = Date.now() - started;
        return verdict;
      });
    }
    return once(probe.url, 0);
  }
  function render(rows) {
    var colors = { page: "#386e9c", region: "#b33737", denied: "#b33737" };
    var html = '<div style="font-family:-apple-system;font-size:15px;line-height:1.55">';
    html += '<p>按指定节点直接访问各 AI 服务。结果仅代表本次匿名请求，不等于账号或对话已验证。</p>';
    rows.forEach(function (r) {
      html += '<div style="margin:14px 0;padding:10px;border:1px solid #999;border-radius:8px">';
      html += '<b>' + escapeHTML(r.service + " · " + r.probe) + '</b><br>';
      html += '<span style="color:' + (colors[r.kind] || "#a66a00") + '">' + escapeHTML(r.label) + '</span><br>';
      html += escapeHTML(r.detail) + '<br><small>节点：' + escapeHTML(r.node || "未确定") + '<br>';
      if (r.status) html += 'HTTP ' + r.status + ' · ';
      if (r.elapsed != null) html += r.elapsed + ' ms · ';
      html += escapeHTML(r.url || "") + '</small></div>';
    });
    return html + '<p>网页验证挑战与移动入口拒绝可以同时出现。换节点后再运行，可直接对照原因；脚本不会自动切换节点。</p></div>';
  }
  function run() {
    console.log("AI_SERVICE_CHECK: 开始专项诊断");
    var argument = typeof $argument === "undefined" ? "all" : $argument;
    var wanted = typeof argument === "string" ? argument.replace(/^service=/, "") : "all";
    var names = wanted === "all" ? Object.keys(SERVICES) : [wanted];
    if (names.some(function (n) { return !SERVICES[n]; })) throw new Error("未知检测服务");
    var environment = typeof $environment === "undefined" ? {} : ($environment || {});
    var params = environment.params || {};
    var config = typeof $config === "undefined" ? null : $config;
    var jobs = [];
    names.forEach(function (service) {
      try {
        var node = selectedNode(params, service, config);
        SERVICES[service].forEach(function (probe) { jobs.push(request(probe, node, service)); });
      } catch (error) {
        jobs.push(Promise.resolve({ service: service, probe: "节点选择", kind: "unknown", label: "未执行检测", detail: String(error) }));
      }
    });
    return Promise.all(jobs).then(function (rows) {
      var content = rows.map(function (r) { return r.service + " / " + r.probe + ": " + r.label + "；" + r.detail + "；节点：" + (r.node || "未确定"); }).join("\n");
      console.log(content);
      $done({ title: "AI 三服务诊断", content: content, htmlMessage: render(rows) });
    });
  }
  function fail(error) {
    console.log("AI_SERVICE_CHECK: " + String(error));
    $done({ title: "AI 检测失败", content: String(error) });
  }
  if (typeof $httpClient === "undefined" && typeof module !== "undefined" && module.exports) {
    module.exports = { classify: classify, selectedNode: selectedNode, render: render, resolveLocation: resolveLocation, run: run };
  } else {
    try { run().catch(fail); }
    catch (error) { fail(error); }
  }
}());

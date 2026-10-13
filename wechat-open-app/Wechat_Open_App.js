/* global $request, $done */
(function () {
  var request = $request || {};
  var headers = request.headers || {};
  function header(name) {
    var key = Object.keys(headers).find(function (item) { return item.toLowerCase() === name; });
    return key ? String(headers[key]) : "";
  }
  var original = String(request.url || "");
  var match = /^https:\/\/(?:www\.)?(x\.com|twitter\.com|github\.com)(?=[:/?#]|$)/i.exec(original);
  if (!match || !/MicroMessenger/i.test(header("user-agent")) || request.method !== "GET" ||
      !/text\/html/i.test(header("accept")) ||
      (/^https:\/\/(?:www\.)?github\.com/i.test(original) && /\/(?:login|sessions|settings|notifications|api|_graphql)(?:[/?#]|$)/i.test(original))) {
    $done({});
    return;
  }
  var isGithub = /github\.com/i.test(match[1]);
  if (/(?:[?&])loon_open_web=1(?:[&#]|$)/.test(original)) {
    // Keep browser navigation on www.github.com; fetch github.com internally
    // instead of returning GitHub's www -> apex redirect to the web view.
    $done(isGithub && /^https:\/\/www\.github\.com/i.test(original) ?
      { url: original.replace(/^https:\/\/www\.github\.com/i, "https://github.com") } : {});
    return;
  }
  var appName = isGithub ? "GitHub" : "X";
  var isGithubBridge = isGithub && /(?:[?&])loon_github_bridge=1(?:[&#]|$)/.test(original);
  function bypass(url) {
    var hash = url.indexOf("#");
    var beforeHash = hash < 0 ? url : url.slice(0, hash);
    var suffix = hash < 0 ? "" : url.slice(hash);
    return beforeHash + (beforeHash.indexOf("?") < 0 ? "?" : "&") + "loon_open_web=1" + suffix;
  }
  function removeBridge(url) {
    return url.replace(/([?&])loon_github_bridge=1(?=&|#|$)/, function (_, separator) {
      return separator === "?" && /[?&]loon_github_bridge=1&/.test(url) ? "?" : "";
    }).replace(/\?&/, "?");
  }
  if (isGithub && !isGithubBridge && !/^https:\/\/www\.github\.com/i.test(original)) {
    // Loon serves the bridge on www.github.com before GitHub's canonical redirect.
    // Its link to github.com can then invoke Universal Links from another origin.
    var bridge = original.replace(/^https:\/\/github\.com/i, "https://www.github.com");
    var hashAt = bridge.indexOf("#");
    var bridgeBase = hashAt < 0 ? bridge : bridge.slice(0, hashAt);
    bridge = bridgeBase + (bridgeBase.indexOf("?") < 0 ? "?" : "&") +
      "loon_github_bridge=1" + (hashAt < 0 ? "" : bridge.slice(hashAt));
    $done({ response: { status: 302, headers: { Location: bridge, "Cache-Control": "no-store" }, body: "" } });
    return;
  }
  var destination = isGithub ? removeBridge(original).replace(/^https:\/\/www\.github\.com/i, "https://github.com") : original;
  var web = bypass(destination);
  function githubBrowserURL(url) {
    var hashAt = url.indexOf("#");
    var beforeHash = hashAt < 0 ? url : url.slice(0, hashAt);
    var suffix = hashAt < 0 ? "" : url.slice(hashAt);
    // GitHub's AASA excludes non-achievement tab links from Universal Links.
    // This is GitHub's existing repository README tab, not a Loon-only marker.
    if (/[?&]tab=[^&]*/.test(beforeHash)) {
      beforeHash = beforeHash.replace(/([?&])tab=[^&]*/g, "$1tab=readme-ov-file");
    } else {
      beforeHash += (beforeHash.indexOf("?") < 0 ? "?" : "&") + "tab=readme-ov-file";
    }
    return beforeHash + suffix;
  }
  var webButton = isGithub ? githubBrowserURL(web) : web;
  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function quoteJs(value) { return JSON.stringify(value).replace(/</g, "\\u003c"); }
  // A link to a different associated domain has a better chance of invoking
  // Universal Links than a link back to the current page's domain.
  var alternate = original.replace(/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)/i,
    /^(?:https:\/\/)(?:www\.)?x\.com/i.test(original) ? "https://twitter.com" : "https://x.com");
  var target = isGithub ? web : bypass(alternate);
  var html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'">' +
    '<title>打开 ' + appName + '</title><style>body{font:17px -apple-system,BlinkMacSystemFont,sans-serif;margin:0;background:#f6f7f8;color:#16181c}' +
    'main{max-width:430px;margin:12vh auto;padding:26px}a,button{display:block;text-align:center;padding:15px;margin:14px 0;border-radius:12px;background:#111;color:white;text-decoration:none}' +
    'button{width:100%;border:0;font:inherit;cursor:pointer}.secondary{background:#e6e8eb;color:#16181c}p{line-height:1.5;color:#536471;word-break:break-all}</style></head><body><main>' +
    '<h1>打开 ' + appName + '</h1>' +
    (isGithub ? '<p>点击下方按钮，在 GitHub App 中打开此链接。页面会保持在这里，等待你的选择。</p>' : '<p>正在尝试打开对应 App。若微信拦截，请点下方按钮。</p>') +
    '<a id="open" href="' + escapeHtml(target) + '">' + (isGithub ? '打开 GitHub App' : '尝试打开 X App') + '</a>' +
    (isGithub ? '' : '<a class="secondary" href="x://">使用 X 专用链接打开 App</a>') +
    (isGithub ? '<button class="secondary" type="button" id="web">继续在微信中打开网页</button>' :
      '<a class="secondary" href="' + escapeHtml(webButton) + '">继续在微信中打开网页</a>') +
    '</main>' +
    (isGithub ? '<script>document.getElementById("web").addEventListener("click",function(){this.disabled=true;setTimeout(function(){location.replace(' + quoteJs(webButton) + ');},150);});</script>' :
      '<script>setTimeout(function(){location.href=' + quoteJs(target) + ';},150);</script>') + '</body></html>';
  $done({ response: { status: 200, headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  }, body: html } });
}());

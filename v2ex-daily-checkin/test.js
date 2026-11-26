/* Offline contract tests. All pages, balances, credentials and tokens are synthetic. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const read = name => fs.readFileSync(__dirname + "/" + name, "utf8");
const program = new vm.Script(read("V2EX_Daily_Checkin.js"));
const origin = "https://www.v2ex.com";
const daily = origin + "/mission/daily";
const target = "/mission/daily/redeem?once=31415926";
const secret = "synthetic-session-value";
const auth = "synthetic-auth-value";
const unrelated = "irrelevant-cookie-value";
const unchecked = "private-error-detail";
const cookie = "PB3_SESSION=" + secret + "; A2=" + auth;
const rawCookie = cookie + "; V2EX_REFERRER=" + unrelated;
const storeKey = "v2ex_daily_session_v2";
const legacy = () => ({v2ex_data: rawCookie, v2ex_html: "每日登录奖励已领取"});
const usual = () => ({[storeKey]: cookie});

const control = `<input class="super normal button" type="button" value="领取 X 铜币" onclick="location.href = '${target}';" />`;
const page = content => `<!doctype html><html><head><title>V2EX › 每日登录奖励</title></head><body><main id="Main"><div class="box"><div class="header">每日登录奖励</div><div class="cell">${content}</div></div></main></body></html>`;
const html = body => ({status: 200, headers: {"Content-Type": "text/html; charset=utf-8"}, body});
const available = html(page(control));
const claimed = html(page("<div class='message'>每日登录奖励已领取</div>"));
const login = html('<html><form action="/signin">You need to sign in first to view this page</form></html>');
const denied = html(page("你的浏览器有一些奇奇怪怪的设置"));
const retryClick = html(page("请重新点击一次以领取每日登录奖励"));
const closed = {error: "Socket closed by remote peer " + unchecked};
const timeout = {error: "Request timed out " + unchecked};
const redirect = location => ({status: 302, headers: {Location: location}, body: ""});
const normalRedirect = redirect("/mission/daily");
const accepted = /签到成功|今日已签到|今日(?:登录)?奖励已领取|今天已领取/;
const captureRequest = () => ({url: daily, method: "GET", headers: {Cookie: rawCookie}});
const captureOptions = (response, request = {}) => ({
  data: usual(), request: {...captureRequest(), ...request}, response
});

function requestHeader(request, name) {
  const key = Object.keys(request.headers).find(key => key.toLowerCase() === name);
  return request.headers[key];
}

// Deliver callbacks from the host rather than from within $httpClient.get. Assertions
// and unexpected requests then stay visible even if the plugin catches exceptions.
async function start({data = usual(), argument = {daily: true}, request, response, failWrite} = {}) {
  const pending = [], requests = [], notes = [], logged = [], reads = [], writes = [], done = [];
  const timers = new Map();
  let nextTimer = 0;
  const context = {
    $argument: argument,
    setTimeout(fn, ms) { timers.set(++nextTimer, {fn, ms}); return nextTimer; },
    $persistentStore: {
      read(key) { reads.push(key); return data[key]; },
      write(value, key) {
        if (key === failWrite) return false;
        data[key] = value;
        writes.push({key, value});
        return true;
      },
      remove(key) { delete data[key]; return true; }
    },
    $notification: {post(...parts) { notes.push(parts); }},
    console: {log(...args) { logged.push(args); }, error(...args) { logged.push(args); }},
    $httpClient: {get(options, callback) {
      requests.push(options);
      pending.push({options, callback});
    }},
    $done(...args) { done.push(args); }
  };
  if (request) context.$request = request;
  if (response) context.$response = response;
  program.runInNewContext(context, {timeout: 2000});
  await new Promise(resolve => setImmediate(resolve));
  async function deliver(reply, expectedUrl) {
    assert.equal(pending.length, 1, "expected exactly one outstanding request");
    const {options, callback} = pending.shift();
    if (expectedUrl) assert.equal(options.url, expectedUrl);
    callback(reply.error || null, reply.error ? null : {status: reply.status, headers: reply.headers || {}}, reply.body);
    await new Promise(resolve => setImmediate(resolve));
  }
  async function dropCallback(expectedUrl) {
    const outstanding = pending.shift();
    assert.equal(outstanding?.options.url, expectedUrl);
    assert(timers.size > 0);
    const [id, timer] = Array.from(timers).pop();
    timers.delete(id);
    assert(timer.ms > 0 && timer.ms < 60000);
    timer.fn();
    await new Promise(resolve => setImmediate(resolve));
    return outstanding.callback;
  }
  function finish() {
    assert.equal(pending.length, 0, "unexpected extra HTTP request");
    assert.equal(done.length, 1, "script must call $done exactly once");
    for (const note of notes) assert.equal(note[0], "V2EX 每日奖励");
    const output = JSON.stringify([notes, logged]);
    for (const value of [secret, auth, unrelated, unchecked, "31415926"]) {
      assert(!output.includes(value), "notifications and logs must not expose private input");
    }
    assert(!reads.includes("v2ex_html"), "never load old HTML");
    assert(!writes.some(row => String(row.value).includes("<html") || String(row.value).includes("31415926")));
    for (const r of requests) {
      assert([daily, origin + target].includes(r.url), "unexpected HTTP destination");
      assert.equal(r.insecure, false);
      assert.equal(r["auto-redirect"], false);
      assert.equal(r["auto-cookie"], false);
      assert.equal(r.insecure, false);
      assert(Number(r.timeout) > 0 && Number(r.timeout) <= 15000);
      const value = requestHeader(r, "cookie");
      assert(value && !value.includes(unrelated), "only session credentials on the request");
    }
    return {data, notes: notes.map(note => note.slice(1, 3).join(" ")).join("\n"), requests, done, writes, reads};
  }
  return {deliver, dropCallback, finish, pending};
}
async function run(options, replies = []) {
  const job = await start(options);
  for (const reply of replies) await job.deliver(reply);
  return job.finish();
}
async function sequence(replies, urls, options) {
  const r = await run(options, replies);
  assert.deepEqual(r.requests.map(r => r.url), urls);
  return r;
}
function noSuccess(result) { assert.doesNotMatch(result.notes, accepted); }
function sameFields(actual, expected) {
  assert.deepEqual(actual.split(/;\s*/).sort(), expected.split(/;\s*/).sort());
}
const cases = [];
function check(name, test) { cases.push({name, test}); }

check("plugin imports one script URL and schedules local 08:05", async () => {
  const plugin = read("V2EX_Daily_Checkin.plugin");
  assert.match(plugin, /^#!name=.+$/m);
  assert.match(plugin, /^\[Argument\]$/m);
  assert.match(plugin, /^schedule\s*=\s*input,\s*"5 8 \* \* \*"/m);
  assert.match(plugin, /^hostname\s*=\s*www\.v2ex\.com,\s*v2ex\.com\s*$/m);
  const rules = plugin.split(/^\[Script\]\s*$/m)[1].split(/^\[/m)[0].trim().split("\n").filter(line => line.trim() && !line.startsWith("#"));
  assert.equal(rules.length, 3);
  const capture = rules.find(line => line.startsWith("response "));
  assert(capture);
  const guard = /\$\{url\}\s*~=\s*\/(\S+)\/([ims]*)\s/.exec(capture);
  assert(guard, "URL guard required for response scripts");
  const rx = new RegExp(guard[1], guard[2]);
  for (const value of [daily, daily + "?from=home", origin.replace("www.", "") + "/mission/daily", origin.replace("www.", "") + "/mission/daily?from=home"]) assert(rx.test(value));
  for (const value of [daily + "/redeem", origin.replace("www.", "") + "/mission/daily/redeem", daily + "Extra", "https://example.invalid/mission/daily"]) assert(!rx.test(value));
  assert.match(capture, /requires_body\s*=\s*true/i);
  assert.match(capture, /enable[d]?\s*=\s*\$\{capture\}/);
  const cron = rules.find(line => line.startsWith("cron ${schedule}"));
  assert.match(cron, /enable[d]?\s*=\s*\$\{daily\}/);
  assert.match(cron, /\$\{manualCookie\}/);
  assert.match(cron, /\{\$\{manualCookie\}, \$\{daily\}\}/);
  const generic = rules.find(line => line.startsWith("generic "));
  assert.match(generic, /\{\$\{manualCookie\}\}\) with tag="V2EX 检查登录"/);
  assert(!generic.includes("${daily}"));
  for (const line of rules) {
    const match = /script\("([^"]+)"/.exec(line);
    assert.equal(match[1], "https://raw.githubusercontent.com/QinSisuo/proxy-finance-assets/main/v2ex-daily-checkin/V2EX_Daily_Checkin.js?v=20261127.6");
  }
});
check("no credential prompts before making any request", async () => {
  const r = await sequence([], [], {data: {}});
  assert.match(r.notes, /授权|登录状态|Cookie/);
  noSuccess(r);
});
for (const [name, response] of [["available", available], ["already claimed", claimed]]) {
  check("capture verified Safari page (" + name + ") and keep only candidate auth fields", async () => {
    const r = await run({...captureOptions(response, {url: daily + "?from=home"}), data: {}});
    sameFields(r.data[storeKey], cookie);
    assert(!r.data.v2ex_data);
    assert.equal(r.done[0].length, 1);
    assert.deepEqual(Object.keys(r.done[0][0]), [], "pass the original Safari response through");
    assert.match(r.notes, /保存|授权/);
  });
  check("capture verified Safari page on apex domain v2ex.com (" + name + ")", async () => {
    const apexUrl = origin.replace("www.", "") + "/mission/daily";
    const r = await run({...captureOptions(response, {url: apexUrl}), data: {}});
    sameFields(r.data[storeKey], cookie);
    assert(!r.data.v2ex_data);
    assert.equal(r.done[0].length, 1);
    assert.deepEqual(Object.keys(r.done[0][0]), [], "pass the original Safari response through");
    assert.match(r.notes, /保存|授权/);
  });
}
const before = "PB3_SESSION=previous-local-value";
for (const [name, response, request] of [
  ["login HTML", login, {}], ["unknown HTML", html(page("unknown")), {}],
  ["redirect", normalRedirect, {}], ["403", {status: 403, body: available.body}, {}],
  ["non-HTML", {...available, headers: {"Content-Type": "application/json"}}, {}],
  ["claimed on other host", claimed, {url: "https://example.invalid/mission/daily"}],
  ["claim subpath", claimed, {url: origin + target}], ["POST", claimed, {method: "POST"}],
  ["anonymous Cookie", claimed, {headers: {Cookie: "V2EX_REFERRER=" + unrelated}}]
]) {
  check("capture preserves saved session on " + name, async () => {
    const r = await run({...captureOptions(response, request), data: {[storeKey]: before}});
    assert.equal(r.data[storeKey], before);
    assert.equal(r.requests.length, 0);
    assert(!r.writes.some(w => w.key === storeKey));
  });
}
check("explicitly failed credential store never reports saved", async () => {
  const r = await run({...captureOptions(claimed), data: {}, failWrite: storeKey});
  assert.equal(r.data[storeKey], undefined);
  assert.match(r.notes, /失败|无法/);
});
for (const flag of [undefined, false]) {
  check("check only returns before claiming (" + typeof flag + ")", async () => {
    const r = await sequence([available], [daily], {argument: {daily: flag}});
    assert.match(r.notes, /可领取|可领|待领取|未领取/);
    noSuccess(r);
  });
}
check("fresh claimed page performs a single GET", async () => {
  assert.match((await sequence([claimed], [daily])).notes, accepted);
});
check("claim once from advertised action, then verify with fresh page", async () => {
  const r = await sequence([available, normalRedirect, claimed], [daily, origin + target, daily]);
  assert.match(r.notes, accepted);
});
check("Cookie manual override keeps @ and never replaces captured session", async () => {
  const manual = 'A2="example@value"; PB3_SESSION=manually-selected';
  const r = await sequence([claimed], [daily], {data: usual(), argument: {manualCookie: "Cookie: " + manual + "; pref=" + unrelated}});
  sameFields(requestHeader(r.requests[0], "cookie"), manual);
  assert.equal(r.data[storeKey], cookie);
  assert(!JSON.stringify(r.notes).includes("manually-selected"));
});
check("multiline manual input stops ahead of network and never falls back", async () => {
  const r = await sequence([], [], {argument: {manualCookie: "A2=sample\r\nHost: example.invalid"}});
  assert.match(r.notes, /单行|格式|无效/);
});
check("empty manual input uses valid capture", async () => {
  for (const emptyVal of [" ", '""', "''", ' " " ']) {
    const r = await sequence([claimed], [daily], {data: usual(), argument: {manualCookie: emptyVal}});
    sameFields(requestHeader(r.requests[0], "cookie"), cookie);
  }
});
check("old single-account Cookie containing @ stays one account", async () => {
  const old = 'A2="old@value"; PB3_SESSION=old-session';
  const r = await sequence([claimed], [daily], {data: {v2ex_data: old + "; pref=" + unrelated}});
  sameFields(requestHeader(r.requests[0], "cookie"), old);
});
check("old unambiguous multi-account entries stay separate", async () => {
  const second = "PB3_SESSION=second; A2=second";
  const r = await sequence([claimed, claimed], [daily, daily], {data: {v2ex_data: rawCookie + "@" + second}});
  sameFields(requestHeader(r.requests[0], "cookie"), cookie);
  sameFields(requestHeader(r.requests[1], "cookie"), second);
});

for (const [name, reply] of [
  ["unrecognized page", html(page("unknown layout"))],
  ["untrusted text content type", {...available, headers: {"Content-Type": "application/json"}}],
  ["HTML comment", html(page("<!-- " + control + " -->"))],
  ["hidden control", html(page("<div hidden>" + control + "</div>"))],
  ["disabled control", html(page(control.replace("type=", "disabled type=")))],
  ["template example", html(page("<template>" + control + "</template>"))],
  ["changed form method", html(page('<form method="POST">' + control + '</form>'))],
  ["foreign base URL", html(page('<base href="https://example.invalid/">' + control))],
  ["two different actions", html(page(control + control.replace("31415926", "231")))],
  ["challenge before ready", html(page('<div class="cf-turnstile"></div>' + control))],
  ["script tag", html(page("<script>let target = " + JSON.stringify(control) + ";</script>"))],
  ["conflicting button and success text", html(page(control + "<p>每日登录奖励已领取</p>"))],
  ["cross-origin link", html(page('<a href="https://example.invalid' + target + '">领取奖励</a>'))],
  ["expired session", login], ["sign-in redirect", redirect("/signin?next=" + unchecked)],
  ["external redirect", redirect("https://example.invalid/" + unchecked)],
  ["browser rejected", denied], ["HTTP 403", {status: 403}], ["HTTP 429", {status: 429}]
]) {
  check("before claim, stop on " + name, async () => {
    const r = await sequence([reply], [daily]);
    noSuccess(r);
    assert(r.notes.trim(), "explain stopping");
    if ([403, 429].includes(reply.status)) assert.match(r.notes, new RegExp(String(reply.status)));
  });
}
for (const [name, reply] of [
  ["HTTP 403", {status: 403}], ["HTTP 429", {status: 429}],
  ["browser rejected", denied], ["login redirect", redirect("/signin?next=" + unchecked)]
]) {
  check("stop after explicit rejection (" + name + ")", async () => {
    const r = await sequence([available, reply], [daily, origin + target]);
    noSuccess(r);
    assert.match(r.notes, /403|429|登录|拒绝|验证|Safari/);
  });
}
for (const [name, submitted] of [
  ["socket loss", closed], ["timeout", timeout], ["response claimed", claimed],
  ["normal redirect", normalRedirect], ["explicit click-again", retryClick]
]) {
  check("no resubmission or success when task still offers a button (" + name + ")", async () => {
    const r = await sequence([available, submitted, available], [daily, origin + target, daily]);
    noSuccess(r);
    assert(r.notes.trim());
  });
}
check("session rotation from the live page reaches the submit and verification requests", async () => {
  const rotated = {...available, headers: {...available.headers, "Set-Cookie": [
    "A2=rotated; Domain=.v2ex.com; Path=/; HttpOnly",
    "PB3_SESSION=foreign; Domain=example.invalid; Path=/",
    "PB3_SESSION=unrelated-path; Path=/elsewhere"
  ]}};
  const r = await sequence([rotated, normalRedirect, claimed], [daily, origin + target, daily]);
  sameFields(requestHeader(r.requests[1], "cookie"), "PB3_SESSION=" + secret + "; A2=rotated");
  assert.equal(requestHeader(r.requests[1], "referer"), daily);
  assert.equal(requestHeader(r.requests[2], "cookie"), requestHeader(r.requests[1], "cookie"));
  sameFields(r.data[storeKey], requestHeader(r.requests[1], "cookie"));
});
check("a response clearing both auth cookies prevents the submit", async () => {
  const cleared = {...available, headers: {...available.headers, "Set-Cookie": ["A2=; Path=/", "PB3_SESSION=; Max-Age=0"]}};
  noSuccess(await sequence([cleared], [daily]));
});
check("a clock-stale local lease cannot consume the reward day", async () => {
  const r = await sequence([claimed], [daily], {data: {...usual(), v2ex_daily_running_v2: "1/old"}});
  assert.match(r.notes, accepted);
});
check("readonly generic can be used while automatic claims are disabled", async () => {
  const r = await sequence([available], [daily], {argument: {manualCookie: rawCookie}});
  assert.match(r.notes, /可领取/);
  noSuccess(r);
});
check("lost response can be confirmed by the final page", async () => {
  const r = await sequence([available, closed, claimed], [daily, origin + target, daily]);
  assert.match(r.notes, accepted);
});
check("network failure with stale success cache allows a new same-day run", async () => {
  const data = legacy();
  const job = await start({data});
  for (let i = 0; i < 2 && job.pending.length; i++) await job.deliver(closed, daily);
  const failure = job.finish();
  assert.match(failure.notes, /网络|连接|超时/);
  noSuccess(failure);
  assert.match((await sequence([available, normalRedirect, claimed], [daily, origin + target, daily], {data})).notes, accepted);
});
check("failed final verification does not reuse old HTML or repeat a claim", async () => {
  const job = await start({data: legacy()});
  await job.deliver(available, daily);
  await job.deliver(normalRedirect, origin + target);
  for (let i = 0; i < 2 && job.pending.length; i++) await job.deliver(timeout, daily);
  const r = job.finish();
  noSuccess(r);
  assert.match(r.notes, /超时|网络|未确认/);
});
check("claim callback never arrives; timeout leads only to a read and ignores late completion", async () => {
  const job = await start();
  await job.deliver(available, daily);
  const late = await job.dropCallback(origin + target);
  await job.deliver(claimed, daily);
  late(null, {status: 200, headers: {}}, available.body);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(job.finish().notes, accepted);
});
check("overlapping runs in one device share the in-flight lease", async () => {
  const data = usual();
  const first = await start({data});
  await first.deliver(available, daily);
  assert.equal(first.pending[0].options.url, origin + target);
  const second = await start({data});
  if (second.pending.length) await second.deliver(available, daily); // checking is allowed
  noSuccess(second.finish());
  await first.deliver(normalRedirect, origin + target);
  await first.deliver(claimed, daily);
  assert.match(first.finish().notes, accepted);
  assert.match((await sequence([claimed], [daily], {data})).notes, accepted);
});
(async () => {
  let failed = 0;
  for (const {name, test} of cases) {
    try { await test(); console.log("PASS " + name); }
    catch (error) { failed++; console.error("FAIL " + name + "\n" + error.stack); }
  }
  console.log((cases.length - failed) + " passed; " + failed + " failed (offline only)");
  if (failed) process.exitCode = 1;
})();

/* Simulate the exact upstream script without network or real credentials. */
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const scriptPath = process.argv[2];
assert(scriptPath, "Pass the downloaded upstream v2ex.js path");
const source = fs.readFileSync(scriptPath, "utf8");
const plugin = fs.readFileSync(__dirname + "/V2EX_Daily_Checkin.plugin", "utf8");
const upstream = "https://raw.githubusercontent.com/anyehttp/quantumult-x/main/task/v2ex.js";
assert.equal(plugin.split("script-path=" + upstream).length - 1, 2);
assert.match(plugin, /schedule=input, "5 8 \* \* \*"/);
assert.match(plugin, /hostname=www\.v2ex\.com\s*$/);
const mockCookie = "PB3_SESSION=fake-session; A2=fake-auth; V2EX_REFERRER=fake-context";
async function run(options) {
  const data = Object.assign({}, options.data || {});
  const responses = (options.responses || []).slice();
  const requests = [], notes = [], logs = [];
  let doneCount = 0, resolveDone;
  const complete = new Promise(resolve => {resolveDone = resolve;});
  const context = {
    $loon: {},
    console: {log: (...args) => logs.push(args.join(" ")), error: (...args) => logs.push(args.join(" "))},
    $persistentStore: {read: key => data[key], write: (value, key) => {data[key] = value; return true;}},
    $notification: {post: (...args) => notes.push(args.join(" "))},
    $httpClient: {get: (request, callback) => {
      requests.push(request);
      if (request.url.includes("/miscellaneous/exegesis/")) {
        assert(!request.headers.cookie && !request.headers.Cookie);
        return callback(null, {status: 200, headers: {"Content-Type": "application/json"}}, '{"notice":"mock"}');
      }
      const next = responses.shift();
      assert(next, "Unexpected V2EX request");
      callback(next.error || null, {status: next.status || 200, headers: {"Content-Type": "text/html"}}, next.body || "");
    }},
    $done: () => {doneCount++; resolveDone();}
  };
  if (options.request) context.$request = options.request;
  vm.runInNewContext(source, context);
  await complete;
  assert.equal(doneCount, 1);
  assert(!logs.join(" ").includes("fake-session"));
  assert(!notes.join(" ").includes("fake-session"));
  return {data, requests: requests.filter(r => r.url.startsWith("https://www.v2ex.com/")), notes};
}
(async function () {
  const captured = await run({request: {method: "GET", headers: {Cookie: mockCookie}}});
  assert.equal(captured.data.v2ex_data, mockCookie);
  assert.equal(captured.requests.length, 0);
  const missing = await run({});
  assert.equal(missing.requests.length, 0);
  assert(missing.notes.join(" ").includes("未检测到ck"));
  const claimed = {body: "每日登录奖励已领取"};
  const button = {body: '<input onclick="location.href = \'/mission/daily/redeem?once=12345\';" />'};
  const skipped = await run({data: captured.data, responses: [claimed]});
  assert.equal(skipped.requests.length, 1);
  const success = await run({data: captured.data, responses: [button, claimed]});
  assert.equal(success.requests.length, 2);
  assert(success.notes.join(" ").includes("签到成功"));
  for (const request of success.requests) {
    assert.equal(request.headers.cookie, mockCookie);
    assert.equal(request.headers["user-agent"], "(Mozilla/5.0 (iPhone; CPU iPhone OS 15_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.3 Mobile/15E148 Safari/604.1");
    assert.equal(request.headers.Referer, undefined);
    assert.equal(request["auto-cookie"], undefined);
    assert.equal(request["auto-redirect"], undefined);
  }
  const failed = await run({data: captured.data, responses: [button, {body: "not claimed"}]});
  assert(failed.notes.join(" ").includes("签到失败"));
  const retry = await run({data: failed.data, responses: [button, claimed]});
  assert.equal(retry.requests.length, 2);
  assert(retry.notes.join(" ").includes("签到成功"));
  console.log("reference compatibility: 6 simulated executions passed");
})().catch(error => {console.error(error); process.exitCode = 1;});

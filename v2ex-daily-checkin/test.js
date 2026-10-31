/* Offline Loon regression tests. Optional --reference PATH reproduces upstream bug. */
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const source = fs.readFileSync(__dirname + "/V2EX_Daily_Checkin.js", "utf8");
const cookie = "PB3_SESSION=fake-session; A2=fake-auth; V2EX_REFERRER=fake-context";
const claimed = {body: "<p>每日登录奖励已领取</p>"};
const button = {body: '<input onclick="location.href = \'/mission/daily/redeem?once=12345\';" />'};
const closed = {error: "Socket closed by remote peer"};
const data = {v2ex_data: cookie, v2ex_html: JSON.stringify(claimed.body)};
async function run(options, program = source) {
  const stored = Object.assign({}, options.data || {}), queue = (options.responses || []).slice();
  const requests = [], notes = [], reads = [], logs = [];
  let count = 0, done;
  const complete = new Promise(resolve => {done = resolve;});
  const context = {
    $loon: {},
    console: {log: (...args) => logs.push(args.join(" ")), error: (...args) => logs.push(args.join(" "))},
    $persistentStore: {read: key => {reads.push(key); return stored[key];}, write: (value, key) => {stored[key] = value; return true;}},
    $notification: {post: (...args) => notes.push(args.join(" "))},
    $httpClient: {get: (request, callback) => {
      if (request.url.includes("/miscellaneous/exegesis/")) return callback(null, {status: 200, headers: {"Content-Type": "application/json"}}, '{"notice":"mock"}');
      requests.push(request);
      const next = queue.shift();
      assert(next, "unexpected request");
      callback(next.error || null, {status: next.status || 200, headers: {"Content-Type": "text/html"}}, next.body || "");
    }},
    $done: () => {count++; done();}
  };
  if (options.request) context.$request = options.request;
  vm.runInNewContext(program, context);
  let timer;
  try { await Promise.race([complete, new Promise((_, reject) => {timer = setTimeout(() => reject(Error("did not finish")), 2000);})]); }
  finally {clearTimeout(timer);}
  assert.equal(count, 1);
  assert(!notes.concat(logs).join(" ").includes("fake-session"));
  return {data: stored, requests, notes: notes.join("\n"), reads};
}
let passed = 0;
async function check(name, test) {await test(); passed++; console.log("PASS " + name);}
(async function () {
  if (process.argv[2] === "--reference") {
    const upstream = fs.readFileSync(process.argv[3], "utf8");
    const bug = await run({data, responses: [closed]}, upstream);
    assert.match(bug.notes, /已签到/);
    assert.equal(bug.requests.length, 1);
    console.log("REPRODUCED upstream false positive: socket error + stale HTML => already claimed");
  }
  await check("missing Cookie", async () => {const r = await run({}); assert.match(r.notes, /未检测到 Cookie/); assert.equal(r.requests.length, 0);});
  await check("capture remains upstream compatible", async () => {const r = await run({request: {method: "GET", headers: {Cookie: cookie}}}); assert.equal(r.data.v2ex_data, cookie); assert.equal(r.requests.length, 0);});
  await check("stale claimed cache + repeated socket failure", async () => {
    const r = await run({data, responses: [closed, closed]});
    assert.match(r.notes, /网络连接被远端关闭/); assert(!/签到成功|今日已签到|已签到/.test(r.notes));
    assert.equal(r.requests.length, 2); assert(!r.reads.includes("v2ex_html"));
  });
  await check("read-only retry obtains fresh page", async () => {const r = await run({data, responses: [closed, claimed]}); assert.match(r.notes, /今日已签到/); assert.equal(r.requests.length, 2);});
  await check("fresh claimed page skips redeem", async () => {const r = await run({data, responses: [claimed]}); assert.match(r.notes, /今日已签到/); assert.equal(r.requests.length, 1);});
  await check("claim requires fresh final confirmation", async () => {
    const r = await run({data, responses: [button, {body: "ok"}, claimed]});
    assert.match(r.notes, /签到成功/); assert.equal(r.requests.length, 3);
    for (const request of r.requests) {
      assert.equal(request.headers.cookie, cookie);
      assert.equal(request.headers["user-agent"], "(Mozilla/5.0 (iPhone; CPU iPhone OS 15_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.3 Mobile/15E148 Safari/604.1");
      assert.equal(request.headers.Referer, undefined); assert.equal(request["auto-cookie"], undefined); assert.equal(request["auto-redirect"], undefined);
    }
  });
  await check("claim body alone cannot report success", async () => {const r = await run({data, responses: [button, claimed, button]}); assert.match(r.notes, /复查未确认/);});
  await check("lost submission response but website confirms", async () => {const r = await run({data, responses: [button, closed, claimed]}); assert.match(r.notes, /签到成功/); assert.equal(r.requests.length, 3);});
  await check("lost submission response never blindly resubmits", async () => {const r = await run({data, responses: [button, closed, button]}); assert.match(r.notes, /本次不重复提交/); assert.equal(r.requests.filter(r => r.url.includes("/redeem?")).length, 1);});
  await check("failed verification cannot reuse stale success", async () => {const r = await run({data, responses: [button, {body: "ok"}, closed, closed]}); assert.match(r.notes, /领取结果未确认/); assert.equal(r.requests.length, 4);});
  for (const status of [403, 429]) await check("HTTP " + status + " stops", async () => {const r = await run({data, responses: [{status}]}); assert.match(r.notes, new RegExp(String(status))); assert.equal(r.requests.length, 1);});
  await check("expired session", async () => {const r = await run({data, responses: [{body: "You need to sign in first"}]}); assert.match(r.notes, /登录已失效/);});
  await check("unknown structure stops", async () => {const r = await run({data, responses: [{body: "unknown"}]}); assert.match(r.notes, /未提交领取请求/); assert.equal(r.requests.length, 1);});
  await check("same-day failure can run again", async () => {const first = await run({data, responses: [closed, closed]}); const r = await run({data: first.data, responses: [button, {body: "ok"}, claimed]}); assert.match(r.notes, /签到成功/);});
  await check("cached HTML is never saved", async () => {const r = await run({data: {v2ex_data: cookie}, responses: [claimed]}); assert.equal(r.data.v2ex_html, undefined);});
  const plugin = fs.readFileSync(__dirname + "/V2EX_Daily_Checkin.plugin", "utf8");
  assert.equal(plugin.split("V2EX_Daily_Checkin.js?v=20261031").length - 1, 2);
  console.log(passed + " regression tests passed; plugin references checked");
})().catch(error => {console.error(error); process.exitCode = 1;});

/* Compatibility simulation only: no network and no user credentials. */
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const source = fs.readFileSync(__dirname + "/ChinaMobile_Checkin.js", "utf8");
const plugin = fs.readFileSync(__dirname + "/ChinaMobile_Checkin.plugin", "utf8");
const scriptURL = "https://raw.githubusercontent.com/QinSisuo/proxy-finance-assets/main/china-mobile-checkin/ChinaMobile_Checkin.js?v=1.2.1";
assert.equal(plugin.split("script-path=" + scriptURL).length - 1, 2);
assert.match(plugin, /daily=switch, false, true/);
assert.match(plugin, /schedule=input, "35 8 \* \* \*"/);
assert.match(plugin, /hostname=wx\.10086\.cn\s*$/);
const mockCookie = "QWHD_SESSION_TOKEN=simulation-only";
async function run(options, code = source) {
  const data = Object.assign({}, options.data || {});
  const queue = (options.responses || []).slice();
  const requests = [], notes = [], logs = [];
  let done = 0, resolveDone;
  const completed = new Promise(resolve => {resolveDone = resolve;});
  function request(options, callback) {
    requests.push(options);
    assert.match(options.url, /^https:\/\/wx\.10086\.cn\/qwhdhub\/api\/mark\/mark31\/(domark|taskAward\/[A-Za-z0-9_-]+)$/);
    const result = queue.shift();
    assert(result, "Unexpected request");
    callback(null, {status: 200, headers: {}}, JSON.stringify(result));
  }
  const context = {
    $loon: {},
    console: {log: (...args) => logs.push(args.join(" "))},
    $persistentStore: {read: key => data[key], write: (value, key) => {data[key] = value; return true;}},
    $httpClient: {get: request, post: request},
    $notification: {post: (...args) => notes.push(args.join(" "))},
    $done: () => {done++; resolveDone();}
  };
  if (options.request) context.$request = options.request;
  vm.runInNewContext(code, context);
  await completed;
  assert.equal(done, 1);
  assert(!logs.join(" ").includes("simulation-only"));
  assert(!notes.join(" ").includes("simulation-only"));
  return {data, requests, notes, logs};
}
(async function () {
  const missing = await run({});
  assert.equal(missing.requests.length, 0);
  assert(missing.notes.join(" ").includes("无 Cookie"));
  const captured = await run({request: {headers: {Cookie: mockCookie}}});
  assert.equal(captured.data.CMCC_Cookie, mockCookie);
  assert.equal(captured.requests.length, 0);
  const noPrize = await run({data: captured.data, responses: [{success: true, data: {taskAwardChance: []}}]});
  assert.equal(noPrize.requests.length, 1);
  const prize = await run({data: captured.data, responses: [
    {success: true, data: {taskAwardChance: [{id: "mock-prize"}]}},
    {success: true, data: {prizeName: "模拟流量券（不代表到账）"}}
  ]});
  assert.equal(prize.requests.length, 2);
  assert(prize.notes.join(" ").includes("模拟流量券"));
  const expired = await run({data: captured.data, responses: [{success: false, code: "LOGIN_EXPIRED", msg: "模拟登录失效"}]});
  assert.equal(expired.requests.length, 1);
  assert(expired.notes.join(" ").includes("模拟登录失效"));
  const failedPrize = await run({data: captured.data, responses: [
    {success: true, data: {taskAwardChance: [{id: "mock-prize"}]}}, {success: false}
  ]});
  assert(failedPrize.notes.join(" ").includes("领奖失败"));
  const duplicate = await run({data: captured.data, responses: [{success: false, msg: "今日已签到过，无法再次签到"}]});
  assert.equal(duplicate.requests.length, 1);
  assert(duplicate.notes.join(" ").includes("今日已签到"));
  assert(!duplicate.notes.join(" ").includes("签到失败"));
  assert(duplicate.logs.some(line => /^Duplicate\s*:\s*1$/.test(line)));
  assert(duplicate.logs.some(line => /^Failed\s*:\s*0$/.test(line)));
  assert(!duplicate.logs.some(line => /^Success\s*:\s*1$/.test(line)));
  const vague = await run({data: captured.data, responses: [{success: false, msg: "未知签到状态"}]});
  assert(vague.notes.join(" ").includes("签到失败"));
  assert.equal(vague.requests.length, 1);
  // Optionally compare actual request options against the downloaded upstream.
  if (process.argv[2]) {
    const original = fs.readFileSync(process.argv[2], "utf8");
    const baseline = await run({data: captured.data, responses: [
      {success: true, data: {taskAwardChance: [{id: "mock-prize"}]}},
      {success: true, data: {prizeName: "模拟流量券（不代表到账）"}}
    ]}, original);
    assert.equal(JSON.stringify(prize.requests), JSON.stringify(baseline.requests));
    console.log("Request options match upstream for sign-in and reward collection");
  }
  console.log("CMCC: static checks and 8 simulated executions passed; duplicate screenshot reproduced");
})().catch(error => {console.error(error); process.exitCode = 1;});

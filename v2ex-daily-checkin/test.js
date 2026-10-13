/* Local simulation only. No network and no account credentials. */
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const source = fs.readFileSync(__dirname + "/V2EX_Daily_Checkin.js", "utf8");
function run(options) {
  const data = Object.assign({}, options.data || {});
  const queue = (options.responses || []).slice();
  const requests = [], notes = [];
  let done = 0;
  const context = {
    $httpClient: {get: (request, callback) => {
      requests.push(request);
      const next = queue.shift();
      assert(next, "unexpected request");
      callback(next.error || null, next.status == null ? null : {status: next.status}, next.body || "");
    }},
    $persistentStore: {read: key => data[key], write: (value, key) => {data[key] = value; return true;}},
    $notification: {post: (_title, _subtitle, body) => notes.push(body)},
    $done: () => done++
  };
  if (options.request) context.$request = options.request;
  vm.runInNewContext(source, context);
  assert.equal(done, 1);
  return {requests, notes, data};
}
const key = "v2ex_daily_cookie_v1";
const cookie = {[key]: "PB3_SESSION=one; A2=two"};
const home = {status: 200, body: "V2EX home"};
const claimed = {status: 200, body: "<p>每日登录奖励已领取</p>"};
const unclaimed = {status: 200, body: '<input onclick="location.href = \'/mission/daily/redeem?once=12345\';" />'};
const clickAgain = {status: 200, body: '请重新点击一次以领取每日登录奖励 ' + unclaimed.body};
const rejected = {status: 200, body: '你的浏览器有一些奇奇怪怪的设置，请用一个干净安装的浏览器重试一下吧'};
assert.match(run({}).notes[0], /没有登录状态/);
assert.match(run({data: cookie, responses: [home, {status: 200, body: "You need to sign in first"}]}).notes[0], /登录已失效/);
assert.equal(run({data: cookie, responses: [home, claimed]}).requests.length, 2);
const success = run({data: cookie, responses: [home, unclaimed, {status: 302}, claimed]});
assert.equal(success.requests.length, 4);
assert.equal(success.requests[1].headers.Referer, 'https://www.v2ex.com/');
assert.equal(success.requests[2].headers.Referer, 'https://www.v2ex.com/mission/daily');
assert.match(success.notes[0], /复查确认/);
const twoClicks = run({data: cookie, responses: [home, unclaimed, {status: 302}, clickAgain, {status: 302}, claimed]});
assert.equal(twoClicks.requests.length, 6);
assert.match(twoClicks.notes[0], /复查确认/);
assert.match(run({data: cookie, responses: [home, unclaimed, {status: 302}, rejected]}).notes[0], /拒绝/);
assert.equal(run({data: cookie, responses: [home, unclaimed, {error: "timeout"}]}).requests.length, 3);
for (const status of [403, 429]) assert.match(run({data: cookie, responses: [{status}]}).notes[0], new RegExp(String(status)));
assert.match(run({data: cookie, responses: [{error: "network"}]}).notes[0], /网络错误或超时/);
assert.equal(run({data: cookie, responses: [home, {status: 200, body: "unknown"}]}).requests.length, 2);
const captured = run({request: {method: "GET", url: "https://www.v2ex.com/mission/daily", headers: {Cookie: "PB3_SESSION=one; A2=two; tracker=three"}}});
assert.equal(captured.data[key], "PB3_SESSION=one; A2=two");
assert(!captured.notes.join(" ").includes("one"));
const repeat = run({data: success.data});
assert.equal(repeat.requests.length, 0);
console.log("simulation: 13 scenarios passed");

/* Local simulation only. No network and no account credentials. */
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const source = fs.readFileSync(__dirname + "/V2EX_Daily_Checkin.js", "utf8");
function run(options) {
  const data = Object.assign({}, options.data || {});
  const queue = (options.responses || []).slice();
  const urls = [], notes = [];
  let done = 0;
  const context = {
    $httpClient: {get: (request, callback) => {
      urls.push(request.url);
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
  return {urls, notes, data};
}
const key = "v2ex_daily_cookie_v1";
const cookie = {[key]: "PB3_SESSION=one; A2=two"};
const claimed = "<p>每日登录奖励已领取</p>";
const unclaimed = '<input onclick="location.href = \'/mission/daily/redeem?once=12345\';" />';
assert.match(run({}).notes[0], /没有登录状态/);
assert.match(run({data: cookie, responses: [{status: 200, body: "You need to sign in first"}]}).notes[0], /登录已失效/);
assert.equal(run({data: cookie, responses: [{status: 200, body: claimed}]}).urls.length, 1);
let success = run({data: cookie, responses: [{status: 200, body: unclaimed}, {status: 200, body: "ok"}, {status: 200, body: claimed}]});
assert.equal(success.urls.length, 3);
assert.match(success.notes[0], /复查确认/);
assert.equal(run({data: cookie, responses: [{status: 200, body: unclaimed}, {error: "timeout"}]}).urls.length, 2);
for (const status of [403, 429]) assert.match(run({data: cookie, responses: [{status}]}).notes[0], new RegExp(String(status)));
assert.match(run({data: cookie, responses: [{error: "timeout"}]}).notes[0], /网络错误或超时/);
assert.match(run({data: cookie, responses: [{error: "network"}]}).notes[0], /网络错误或超时/);
assert.equal(run({data: cookie, responses: [{status: 200, body: "unknown"}]}).urls.length, 1);
const captured = run({request: {method: "GET", url: "https://www.v2ex.com/mission/daily", headers: {Cookie: "PB3_SESSION=one; A2=two; tracker=three"}}});
assert.equal(captured.data[key], "PB3_SESSION=one; A2=two");
assert(!captured.notes.join(" ").includes("one"));
const repeat = run({data: success.data, responses: [{status: 200, body: unclaimed}]});
assert.equal(repeat.urls.length, 0);
console.log("simulation: 11 scenarios passed");

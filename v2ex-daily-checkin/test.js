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
      callback(next.error || null, next.status == null ? null : {status: next.status, headers: next.headers || {}}, next.body || "");
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
const uaKey = "v2ex_daily_user_agent_v1";
const safariUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const cookie = {[key]: "PB3_SESSION=one; A2=two", [uaKey]: safariUA};
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
const timedOut = run({data: cookie, responses: [home, unclaimed, {error: "timeout"}]});
assert.equal(timedOut.requests.length, 3);
// A failed attempt must not block a second run on the same day.
const afterFailure = run({data: timedOut.data, responses: [home, unclaimed, {status: 302}, claimed]});
assert.equal(afterFailure.requests.length, 4);
assert.match(afterFailure.notes[0], /复查确认/);
// If the timed-out request actually succeeded, the next live check skips redeem.
const recovered = run({data: timedOut.data, responses: [home, claimed]});
assert.equal(recovered.requests.length, 2);
assert.match(recovered.notes[0], /网站确认/);
// An ambiguous live page is not evidence that it is safe to submit again.
const unknown = run({data: timedOut.data, responses: [home, {status: 200, body: "unknown"}]});
assert.equal(unknown.requests.length, 2);
assert.match(unknown.notes[0], /没有发送领取请求/);
for (const status of [403, 429]) assert.match(run({data: cookie, responses: [{status}]}).notes[0], new RegExp(String(status)));
assert.match(run({data: cookie, responses: [{error: "network"}]}).notes[0], /网络错误或超时/);
assert.equal(run({data: cookie, responses: [home, {status: 200, body: "unknown"}]}).requests.length, 2);
const captured = run({request: {method: "GET", url: "https://www.v2ex.com/mission/daily", headers: {Cookie: "PB3_SESSION=one; A2=two; tracker=three", "User-Agent": safariUA, "Accept-Language": "zh-CN"}}});
assert.equal(captured.data[key], "PB3_SESSION=one; A2=two");
assert.equal(captured.data[uaKey], safariUA);
assert.equal(captured.data.v2ex_daily_language_v1, "zh-CN");
assert(!captured.notes.join(" ").includes("one"));
const repeat = run({data: success.data, responses: [home, claimed]});
assert.equal(repeat.requests.length, 2);
assert.match(repeat.notes[0], /网站确认/);
// A previous account/day's cached success must not override the live page.
const staleSuccess = run({data: success.data, responses: [home, unclaimed, {status: 302}, claimed]});
assert.equal(staleSuccess.requests.length, 4);
assert.match(staleSuccess.notes[0], /复查确认/);
// Old authorizations need actual browser context; never invent a Safari UA.
assert.match(run({data: {[key]: "PB3_SESSION=one; A2=two"}}).notes[0], /旧授权/);
const missingUA = run({request: {method: "GET", url: "https://www.v2ex.com/mission/daily", headers: {Cookie: "PB3_SESSION=one"}}});
assert.match(missingUA.notes[0], /缺少 Safari/);
assert.equal(missingUA.data[key], undefined);
// Preserve the user's captured browser headers on every request.
const browserContext = run({data: captured.data, responses: [home, claimed]});
for (const request of browserContext.requests) {
  assert.equal(request.headers["User-Agent"], safariUA);
  assert.equal(request.headers["Accept-Language"], "zh-CN");
  assert.equal(request["auto-cookie"], false);
}
// Server session rotations must reach the next request and persistent storage.
const rotated = run({data: cookie, responses: [
  {status: 200, body: home.body, headers: {"Set-Cookie": ['PB3_SESSION="home-session"; Path=/; HttpOnly', 'tracking=ignored; Path=/']}},
  {status: 200, body: unclaimed.body, headers: {"set-cookie": 'PB3_SESSION="daily-session"; Expires=Fri, 16 Oct 2026 17:00:00 GMT; Path=/, V2EX_LANG=zhcn; Path=/'}},
  {status: 302}, claimed
]});
assert.equal(rotated.requests[1].headers.Cookie, 'PB3_SESSION="home-session"; A2=two');
assert.equal(rotated.requests[2].headers.Cookie, 'PB3_SESSION="daily-session"; A2=two');
assert.equal(rotated.data[key], 'PB3_SESSION="daily-session"; A2=two');
assert(!rotated.notes.join(" ").includes("daily-session"));
// Honor an authentication cookie deleted by the server.
const deleted = run({data: cookie, responses: [
  {status: 200, body: home.body, headers: {"set-cookie": 'A2=two; Max-Age=0; Path=/'}},
  {status: 200, body: "You need to sign in first"}
]});
assert.equal(deleted.requests[1].headers.Cookie, "PB3_SESSION=one");
assert.match(deleted.notes[0], /登录已失效/);
console.log("simulation: 22 scenarios passed");

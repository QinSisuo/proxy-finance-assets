const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const checker = require('../scripts/ai-service-check.js');
const source = fs.readFileSync(require.resolve('../scripts/ai-service-check.js'), 'utf8');
const probe = { name: '网页入口', url: 'https://claude.ai/' };

test('challenge and unknown 403 never become region restriction or success', () => {
  assert.equal(checker.classify('Claude', probe, {status:403, headers:{'CF-Mitigated':'challenge'}, body:'<title>Claude</title>'}).kind, 'challenge');
  assert.equal(checker.classify('ChatGPT', probe, {status:403, body:'{"cf_details":"Request is not allowed.","type":"dc"}'}).kind, 'denied');
  assert.equal(checker.classify('Claude', probe, {status:403}).kind, 'denied');
});
test('Claude region redirects require an exact official host and path', () => {
  assert.equal(checker.classify('Claude', probe, {status:302, headers:{Location:'https://claude.com/app-unavailable-in-region'}}).kind, 'region');
  assert.equal(checker.classify('Claude', probe, {status:302, headers:{Location:'https://claude.com.evil.test/app-unavailable-in-region'}}).kind, 'redirect');
  assert.equal(checker.classify('Claude', probe, {status:200, body:'<title>Claude</title> a preloaded /app-unavailable-in-region string'}).kind, 'page');
});
test('Gemini status 200, country marker and old feature flag do not prove availability', () => {
  const r = checker.classify('Gemini', probe, {status:200, body:'<title>Google Gemini</title>,2,1,200,"CHN" 45631641,null,false'});
  assert.equal(r.kind, 'page');
  assert.match(r.detail, /CHN/);
  assert.match(r.detail, /仍需验证/);
  assert.equal(checker.classify('Gemini', probe, {status:200, body:'<html>unrelated</html>'}).kind, 'unknown');
  assert.equal(checker.classify('Gemini', probe, {status:200, body:'<title>Gemini</title><h1>Gemini isn’t available in your country yet</h1>'}).kind, 'region');
  assert.equal(checker.classify('Gemini', probe, {status:200, body:'<title>Gemini</title><script>"Gemini isn’t available in your country yet"</script>'}).kind, 'page');
  for (const hidden of ['<script>var t="<h1>Gemini is not available in your country</h1>";</script>', '<!-- <h1>Gemini is not available in your country</h1> -->', '<template><h1>Gemini is not available in your country</h1></template>']) {
    assert.equal(checker.classify('Gemini', probe, {status:200, body:'<title>Gemini</title>'+hidden}).kind, 'page');
  }
  const ambiguous = checker.classify('Gemini', probe, {status:200, body:'<title>Gemini</title>,2,1,200,"USA" ,2,1,200,"CHN"'});
  assert.match(ambiguous.detail, /地区未知/);
});
test('timeout, DNS, TLS, authentication and rate limits stay distinct', () => {
  assert.equal(checker.classify('Gemini', probe, {error:'timeout'}).kind, 'timeout');
  assert.match(checker.classify('Gemini', probe, {error:'DNS resolve failed'}).label, /解析/);
  assert.match(checker.classify('Gemini', probe, {error:'SSL certificate invalid'}).label, /证书/);
  assert.equal(checker.classify('Gemini', probe, {status:401}).kind, 'auth');
  assert.equal(checker.classify('Gemini', probe, {status:429}).kind, 'rate');
  assert.equal(checker.classify('Gemini', probe, {status:302,headers:{location:'https://accounts.google.com/ServiceLogin'}}).kind, 'auth');
});
test('node context takes precedence; missing context pins each service group separately', () => {
  const selected = {ChatGPT:'A', Claude:'B', Gemini:'C', nested:'Gemini'};
  const config = {getSelectedPolicy:n=>selected[n] || ''};
  assert.equal(checker.selectedNode({nodeInfo:{name:'chosen'}},'Gemini',config), 'chosen');
  assert.equal(checker.selectedNode({},'Gemini',config), 'C');
  assert.equal(checker.selectedNode({policyGroup:'nested'},'Claude',config), 'C');
  assert.throws(()=>checker.selectedNode({node:'DIRECT'},'Claude',config));
  assert.throws(()=>checker.selectedNode({},'Missing',config));
  assert.throws(()=>checker.selectedNode({},'Claude',null));
  assert.throws(()=>checker.selectedNode({node:'loop'},'Claude',{getSelectedPolicy:n=>n==='loop'?'loop2':'loop'}));
});
test('display escapes node names and evidence', () => {
  const html = checker.render([{service:'Gemini',probe:'x',kind:'unknown',label:'?',detail:'<script>',node:'<img src=x>'}]);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img src=x&gt;'));
});

async function runLoon(environment, responder, selected={ChatGPT:'A',Claude:'B',Gemini:'C'}, extra={}) {
  const calls=[], results=[];
  const context={
    $environment:environment, $argument:'all', $config:{getSelectedPolicy:n=>selected[n] || ''},
    $httpClient:{get(options, callback){calls.push(options);const r=responder(options,calls.length);callback(r.error || null,{status:r.status,headers:r.headers || {}},r.body || '');}},
    $done:r=>results.push(r), console:{log(){}}, setTimeout(){},
    ...extra
  };
  vm.runInNewContext(source,context);
  for(let i=0;i<20;i++) await Promise.resolve();
  return {calls,results};
}
test('all requests and same-host redirects retain the clicked node; no cookies or insecure TLS', async()=>{
  const {calls,results}=await runLoon({params:{node:'clicked'}},o=>o.url==='https://claude.ai/'?{status:302,headers:{location:'/login'}}:{status:403,headers:{'cf-mitigated':'challenge'}});
  assert.equal(calls.length,5);
  assert.ok(calls.every(o=>o.node==='clicked' && o.insecure===false && o['auto-cookie']===false && o['auto-redirect']===false));
  assert.ok(calls.every(o=>!o.body && !o.headers.Cookie && !o.headers.Authorization));
  assert.equal(results.length,1);
  assert.match(results[0].content,/遇到验证挑战/);
});
test('manual execution uses each service group; external redirect is never fetched', async()=>{
  const {calls,results}=await runLoon({params:{}},()=>({status:302,headers:{location:'https://unrelated.example/'}}));
  assert.deepEqual(calls.map(o=>o.node),['A','A','B','C']);
  assert.equal(calls.length,4);
  assert.equal(results.length,1);
});
test('null environment and a CommonJS shim cannot silently skip Loon execution', async()=>{
  const {calls,results}=await runLoon(null,()=>({status:403}),undefined,{module:{exports:{}}});
  assert.deepEqual(calls.map(o=>o.node),['A','A','B','C']);
  assert.equal(results.length,1);
});
test('implicit defaults may use only verified groups and are labelled as groups', async()=>{
  const config = {getSelectedPolicy:()=>'',getConfig:()=>JSON.stringify({all_policy_groups:['ChatGPT','Claude','Gemini']})};
  assert.equal(checker.selectedNode({},'Gemini',config),'Gemini');
  assert.throws(()=>checker.selectedNode({},'Missing',config));
  const {calls,results}=await runLoon(null,()=>({status:403}),undefined,{$config:config});
  assert.deepEqual(calls.map(o=>o.node),['ChatGPT','ChatGPT','Claude','Gemini']);
  assert.match(results[0].content,/策略组 Gemini（当前选择由 Loon 解析）/);
  assert.match(results[0].content,/HTTP 403/);
});

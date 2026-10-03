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
  for(let i=0;i<80;i++) await Promise.resolve();
  return {calls,results};
}
test('all requests and same-host redirects retain the clicked node; no cookies or insecure TLS', async()=>{
  const {calls,results}=await runLoon({params:{node:'clicked'}},o=>o.url==='https://claude.ai/'?{status:302,headers:{location:'/login'}}:{status:403,headers:{'cf-mitigated':'challenge'}});
  assert.equal(calls.length,7);
  assert.ok(calls.every(o=>o.node==='clicked' && o.insecure===false && o['auto-cookie']===false && o['auto-redirect']===false));
  assert.ok(calls.every(o=>!o.body && !o.headers.Cookie && !o.headers.Authorization));
  assert.equal(results.length,1);
  assert.match(results[0].content,/遇到验证挑战/);
});
test('manual execution uses each service group; external redirect is never fetched', async()=>{
  const {calls,results}=await runLoon({params:{}},()=>({status:302,headers:{location:'https://unrelated.example/'}}));
  assert.deepEqual(calls.map(o=>o.node),['A','A','A','B','B','C']);
  assert.equal(calls.length,6);
  assert.equal(results.length,1);
});
test('null environment and a CommonJS shim cannot silently skip Loon execution', async()=>{
  const {calls,results}=await runLoon(null,()=>({status:403}),undefined,{module:{exports:{}}});
  assert.deepEqual(calls.map(o=>o.node),['A','A','A','B','B','C']);
  assert.equal(results.length,1);
});
test('implicit defaults may use only verified groups and are labelled as groups', async()=>{
  const config = {getSelectedPolicy:()=>'',getConfig:()=>JSON.stringify({all_policy_groups:['ChatGPT','Claude','Gemini']})};
  assert.equal(checker.selectedNode({},'Gemini',config),'Gemini');
  assert.throws(()=>checker.selectedNode({},'Missing',config));
  const {calls,results}=await runLoon(null,()=>({status:403}),undefined,{$config:config});
  assert.deepEqual(calls.map(o=>o.node),['ChatGPT','ChatGPT','ChatGPT','Claude','Claude','Gemini']);
  assert.match(results[0].content,/策略组 Gemini（当前选择由 Loon 解析）/);
  assert.match(results[0].content,/HTTP 403/);
});

test('fixed nodes compare all services on each node without changing policies', async()=>{
  const nodes=['US 106 & test','US 101'];
  const {calls,results}=await runLoon(null,()=>({status:200,body:'<title>Gemini</title>'}),undefined,{
    $argument:'service=all&nodes='+encodeURIComponent(JSON.stringify(nodes))
  });
  assert.deepEqual(calls.map(o=>o.node),[...Array(6).fill(nodes[0]),...Array(6).fill(nodes[1])]);
  assert.ok(calls.every(o=>o.timeout===12000));
  assert.equal(results.length,1);
  assert.match(results[0].htmlMessage,/固定节点对比/);
  assert.match(results[0].htmlMessage,/US 106 &amp; test/);
});

test('a comparison cannot claim a fixed node when only a group is resolved', async()=>{
  const {calls,results}=await runLoon(null,()=>({status:200}),undefined,{
    $argument:'service=all&node=ChatGPT',
    $config:{getSelectedPolicy:()=>'',getConfig:()=>JSON.stringify({all_policy_groups:['ChatGPT']})}
  });
  assert.equal(calls.length,0);
  assert.match(results[0].content,/未解析到具体节点/);
});

test('one transient retry records the first failure and retains the same node', async()=>{
  const {calls,results}=await runLoon({params:{node:'fixed'}},(_,n)=>n===1?{error:'connection reset'}:{status:200,body:'<title>Claude</title>'},undefined,{
    $argument:'service=Gemini&timeout=10'
  });
  assert.equal(calls.length,2);
  assert.ok(calls.every(o=>o.node==='fixed' && o.timeout===10000));
  assert.match(results[0].content,/重试后收到响应/);
  assert.match(results[0].content,/请求1=连接失败/);
});

test('denials, limits, TLS and DNS errors are not retried; retries can be disabled', async()=>{
  for (const r of [{status:403},{status:429},{error:'DNS resolve failed'},{error:'SSL certificate invalid'}]) {
    const {calls}=await runLoon({params:{node:'fixed'}},()=>r,undefined,{$argument:'service=Gemini'});
    assert.equal(calls.length,1);
  }
  const {calls}=await runLoon({params:{node:'fixed'}},()=>({error:'timeout'}),undefined,{$argument:'service=Gemini&retry=0'});
  assert.equal(calls.length,1);
});

test('retry and redirects share a 28-second budget, and late callbacks cannot finish twice', async()=>{
  let now=0, timers=[], done=[], calls=[];
  class FakeDate extends Date { static now(){return now;} }
  const context={Date:FakeDate,$argument:'service=Gemini&node=fixed',
    $httpClient:{get(o,cb){calls.push(o);if(calls.length===1){now=12000;cb('timeout');}else{now=24000;cb(null,{status:302,headers:{location:'login'}},'');}}},
    $done:r=>done.push(r),console:{log(){}},setTimeout(fn){timers.push(fn);}
  };
  vm.runInNewContext(source,context);
  for(let i=0;i<40;i++)await Promise.resolve();
  assert.deepEqual(calls.map(o=>o.timeout),[12000,12000,4000]);
  assert.equal(done.length,1);
  timers.forEach(fn=>fn());
  for(let i=0;i<10;i++)await Promise.resolve();
  assert.equal(done.length,1);
});

test('history is bounded, stores only summaries and never issues HTTP on viewing', async()=>{
  let saved='[]';
  const store={read:()=>saved,write:(value,key)=>{assert.equal(key,'ai-service-check.history.v2');saved=value;return true;}};
  for(let i=0;i<12;i++) checker.saveReport({time:String(i),rows:[]},store);
  assert.equal(checker.readHistory(store).length,10);
  assert.equal(checker.readHistory(store)[0].time,'2');
  const {calls,results}=await runLoon(null,()=>{throw new Error('must not request');},undefined,{
    $argument:'service=history',$persistentStore:store
  });
  assert.equal(calls.length,0);
  assert.match(results[0].content,/10 次/);
  await runLoon({params:{node:'fixed'}},()=>({status:403,body:'private-response-body'}),undefined,{
    $argument:'service=Claude',$persistentStore:store
  });
  assert.ok(!saved.includes('private-response-body'));
  assert.match(saved,/fixed/);
});

test('relative redirects resolve on the same host; HTTP and other schemes stay unfetched',()=>{
  assert.equal(checker.resolveLocation('https://claude.ai/a/b','../login?x=1'),'https://claude.ai/login?x=1');
  assert.equal(checker.resolveLocation('https://claude.ai/app?x=1','?x=2'),'https://claude.ai/app?x=2');
  assert.equal(checker.resolveLocation('https://claude.ai/','http://claude.ai/login'),'');
  assert.equal(checker.resolveLocation('https://claude.ai/','javascript:alert(1)'),'');
});

test('invalid arguments are rejected before requests',()=>{
  for(const argument of ['timeout=0','timeout=abc','retry=2','service=Unknown','nodes=%5B%22%22%5D','nodes=not-json']) {
    assert.throws(()=>checker.parseOptions(argument));
  }
  assert.deepEqual(checker.parseOptions({service:'Claude',timeout:15,retry:0}).nodes,[]);
});

test('browser home and history return local HTML without outbound probes',async()=>{
  for (const path of ['/','/history']) {
    const {calls,results}=await runLoon(null,()=>{throw new Error('must not request');},undefined,{
      $argument:'service=all&node=fixed',$request:{url:'http://loon-ai.test'+path,method:'GET'}
    });
    assert.equal(calls.length,0);
    assert.equal(results.length,1);
    assert.equal(results[0].response.status,200);
    assert.match(results[0].response.body,/同节点对比/);
    assert.equal(results[0].response.headers['Cache-Control'],'no-store');
  }
});

function memoryStore() {
  const data={};
  return {read:key=>data[key],write:(value,key)=>{data[key]=value;return true;}};
}
test('browser comparison queues configured nodes; worker runs them and status shows results',async()=>{
  const store=memoryStore();
  const {calls,results}=await runLoon(null,()=>({status:403}),undefined,{
    $argument:'service=all&node=fixed',
    $request:{url:'http://loon-ai.test/compare?node=other',method:'GET'},$persistentStore:store
  });
  assert.equal(calls.length,0);
  assert.equal(results[0].response.status,202);
  assert.match(results[0].response.body,/诊断已排队/);
  const worker=await runLoon(null,()=>({status:403}),undefined,{$argument:'service=worker',$persistentStore:store});
  assert.equal(worker.calls.length,6);
  assert.ok(worker.calls.every(o=>o.node==='fixed'));
  const status=await runLoon(null,()=>{throw new Error('must not request');},undefined,{
    $request:{url:'http://loon-ai.test/status'},$persistentStore:store
  });
  assert.equal(status.calls.length,0);
  assert.match(status.results[0].response.body,/AI 诊断完成/);
  assert.match(status.results[0].response.body,/访问被拒绝/);
});

test('other hosts, unknown pages and unsupported methods never trigger probes',async()=>{
  for (const [url,method,status] of [
    ['http://loon-ai.test.evil.test/compare','GET',undefined],
    ['https://loon-ai.test/compare','GET',undefined],
    ['http://loon-ai.test/unknown','GET',404],
    ['http://loon-ai.test/compare','POST',405]
  ]) {
    const {calls,results}=await runLoon(null,()=>{throw new Error('must not request');},undefined,{
      $request:{url,method}
    });
    assert.equal(calls.length,0);
    assert.equal(results.length,1);
    assert.equal(results[0].response?.status,status);
  }
});

test('structured Apple URL errors retain reasons and distinguish decoding from connectivity',async()=>{
  const code=-1016;
  const r=checker.classify('Claude',probe,{error:{domain:'NSURLErrorDomain',code,message:'无法解码响应'}});
  assert.equal(r.kind,'decode');
  const {calls,results}=await runLoon({params:{node:'fixed'}},()=>({error:'Error Domain=NSURLErrorDomain Code=-1016 "cannot decode content" UserInfo={private}'}),undefined,{$argument:'service=Gemini'});
  assert.equal(calls.length,1);
  assert.match(results[0].content,/响应解析失败/);
  assert.ok(!results[0].content.includes('private'));
  const retry=await runLoon({params:{node:'fixed'}},()=>({error:{domain:'NSURLErrorDomain',code:-1005,message:'连接中断'}}),undefined,{$argument:'service=Gemini'});
  assert.equal(retry.calls.length,2);
  assert.match(retry.results[0].content,/连接中断/);
  assert.equal(checker.classify('Claude',probe,{error:{message:'unrecognized failure',code:-1016,domain:'Other'}}).kind,'unknown');
  assert.match(checker.classify('Claude',probe,{error:'Error Domain=LNMacScriptXPC Code=5 "LNGCDAsyncSocketTLSError error 167772294"'}).label,/TLS/);
});

test('exact IP entry renders the homepage without DNS or service requests',async()=>{
  const {calls,results}=await runLoon(null,()=>{throw new Error('must not request');},undefined,{
    $argument:'node=fixed',$request:{url:'http://198.19.255.254/',method:'GET'}
  });
  assert.equal(calls.length,0);
  assert.equal(results[0].response.status,200);
});

test('idle and expired workers never request services; missing storage rejects queuing',async()=>{
  const store=memoryStore();
  const idle=await runLoon(null,()=>{throw new Error('must not request');},undefined,{$argument:'service=worker',$persistentStore:store});
  assert.equal(idle.calls.length,0);
  store.write(JSON.stringify({id:'old',time:'2000-01-01T00:00:00Z',state:'pending',options:{service:'all',node:'fixed'}}),'ai-service-check.job.v1');
  const expired=await runLoon(null,()=>{throw new Error('must not request');},undefined,{$argument:'service=worker',$persistentStore:store});
  assert.equal(expired.calls.length,0);
  assert.equal(JSON.parse(store.read('ai-service-check.job.v1')).state,'failed');
  const missing=await runLoon(null,()=>{throw new Error('must not request');},undefined,{
    $argument:'node=fixed',$request:{url:'http://198.19.255.254/compare'}
  });
  assert.equal(missing.calls.length,0);
  assert.equal(missing.results[0].response.status,503);
});

test('repeated clicks preserve the active job and do not add requests',async()=>{
  const store=memoryStore();
  const extra={$argument:'node=fixed',$request:{url:'http://198.19.255.254/compare'},$persistentStore:store};
  await runLoon(null,()=>{throw new Error('must not request');},undefined,extra);
  const first=store.read('ai-service-check.job.v1');
  await runLoon(null,()=>{throw new Error('must not request');},undefined,{...extra,$argument:'node=other'});
  assert.equal(store.read('ai-service-check.job.v1'),first);
});

test('OpenAI auxiliary pass requires the observed JSON schema, never an absent error word',()=>{
  const p={name:'地区辅助接口',url:'https://api.openai.com/compliance/cookie_requirements',check:'openai-compliance'};
  for(const value of [true,false]) {
    const r=checker.classify('ChatGPT',p,{status:200,headers:{'Content-Type':'application/json; charset=utf-8'},body:JSON.stringify({cookie_consent_required:value})});
    assert.equal(r.kind,'partial');
    assert.match(r.detail,/服务可用性仍待确认/);
  }
  for(const [status,type,body] of [
    [200,'application/json','{}'],[200,'application/json','{"cookie_consent_required":"false"}'],
    [200,'text/html','{"cookie_consent_required":false}'],[200,'application/jsonp','{"cookie_consent_required":false}'],
    [204,'application/json',''],[200,'application/json','{"cookie_consent_required":false,"error":{"type":"unexpected"}}']
  ]) assert.equal(checker.classify('ChatGPT',p,{status,headers:{'Content-Type':type},body}).kind,'unknown');
  assert.equal(checker.classify('ChatGPT',p,{status:403,body:'{"error":{"code":"unsupported_country_region_territory"}}'}).kind,'region');
});

test('Claude trace validates host and format, but cannot claim service availability',()=>{
  const p={name:'出口地区辅助',url:'https://claude.ai/cdn-cgi/trace',check:'claude-trace'};
  const valid={status:200,headers:{'Content-Type':'text/plain; charset=utf-8'},body:'h=claude.ai\nloc=US\n'};
  const r=checker.classify('Claude',p,valid);
  assert.equal(r.kind,'region-info');
  assert.match(r.detail,/US/);
  assert.match(r.detail,/未证明 Claude 可用/);
  for(const body of ['h=example.test\nloc=US\n','h=claude.ai\nloc=US\nloc=CN\n','h=claude.ai\nloc=unknown\n']) {
    assert.equal(checker.classify('Claude',p,{...valid,body}).kind,'unknown');
  }
});

test('current Gemini supported wording is detected only in matching service headings',()=>{
  const body='<title>Google Gemini</title><h1>Gemini isn’t currently supported in your country. Stay tuned!</h1>';
  assert.equal(checker.classify('Gemini',probe,{status:200,body}).kind,'region');
  assert.equal(checker.classify('Claude',probe,{status:200,body}).kind,'unknown');
  assert.equal(checker.classify('Gemini',probe,{status:200,body:'<title>Gemini</title><script>'+body+'</script>'}).kind,'page');
});

test('overview never promotes auxiliary passes, auth responses or country fields to AI availability',()=>{
  const base={node:'test',service:'ChatGPT'};
  const rows=[{...base,probe:'网页入口',kind:'page'},{...base,probe:'地区辅助接口',kind:'partial'},
    {...base,probe:'移动辅助入口',kind:'region',detail:'unsupported_country'}];
  const r=checker.summaries(rows)[0];
  assert.equal(r.state,'unknown');
  assert.match(r.detail,/辅助接口预检通过/);
  for(const kind of ['auth','challenge','network','timeout','region-info']) {
    assert.equal(checker.summaries([{...base,probe:'网页入口',kind}])[0].state,'unknown');
  }
  assert.equal(checker.summaries([{...base,probe:'网页入口',kind:'region',detail:'official restriction'}])[0].state,'restricted');
  assert.equal(checker.summaries([{...base,probe:'网页入口',kind:'denied'}])[0].state,'denied');
});

function candidateConfig() {
  const children={ChatGPT:['US','shared','DIRECT'],Claude:['US'],Gemini:['JP','REJECT'],US:['candidate & one','shared'],JP:['another','ChatGPT']};
  return {getConfig:()=>JSON.stringify({all_policy_groups:Object.keys(children)}),
    getSelectedPolicy:n=>({ChatGPT:'US',Claude:'US',Gemini:'JP',US:'candidate & one',JP:'another'})[n] || '',
    getSubPolicies:(name,callback)=>callback(JSON.stringify(children[name] || [])),
    setSelectPolicy(){throw new Error('must not switch policies');}};
}

test('candidate selector enumerates nested AI groups once, excludes builtins and escapes names',async()=>{
  const config=candidateConfig();
  const choices=await checker.nodeChoices({nodes:[]},config);
  assert.deepEqual(new Set(choices.nodes),new Set(['candidate & one','shared','another']));
  assert.equal(choices.complete,true);
  const home=await runLoon(null,()=>{throw new Error('no service request on home');},undefined,{
    $config:config,$request:{url:'http://198.19.255.254/',method:'GET'}
  });
  assert.equal(home.calls.length,0);
  assert.match(home.results[0].response.body,/candidate &amp; one/);
  assert.match(home.results[0].response.body,/form action="\/check"/);
  assert.ok(!home.results[0].response.body.includes('<option value="DIRECT"'));
  assert.match(home.results[0].response.headers['Content-Security-Policy'],/form-action 'self'/);
});

test('browser service/node choice queues exactly that node, and worker retains it without policy changes',async()=>{
  const store=memoryStore(), config=candidateConfig();
  const queued=await runLoon(null,()=>{throw new Error('enqueue is local');},undefined,{
    $config:config,$persistentStore:store,
    $request:{url:'http://198.19.255.254/check?node=candidate%20%26%20one&service=Gemini',method:'GET'}
  });
  assert.equal(queued.calls.length,0);
  assert.equal(queued.results[0].response.status,202);
  const job=JSON.parse(store.read('ai-service-check.job.v1'));
  assert.deepEqual(job.options.nodes,['candidate & one']);
  assert.equal(job.options.service,'Gemini');
  const worker=await runLoon(null,()=>({status:200,body:'<title>Google Gemini</title>'}),undefined,{
    $config:config,$persistentStore:store,$argument:'service=worker'
  });
  assert.equal(worker.calls.length,1);
  assert.equal(worker.calls[0].node,'candidate & one');
  assert.equal(JSON.parse(store.read('ai-service-check.job.v1')).report.summaries[0].state,'unknown');
});

test('unlisted nodes, inherited service names and malformed/duplicate query fields do not enqueue',async()=>{
  for(const query of ['node=not-listed&service=all','node=shared&service=constructor',
    'node=shared&service=Gemini&service=Claude','node=shared&service=%ZZ','node=shared&service=all&nodes=x']) {
    const store=memoryStore();
    const checked=await runLoon(null,()=>{throw new Error('must not request');},undefined,{
      $config:candidateConfig(),$persistentStore:store,
      $request:{url:'http://198.19.255.254/check?'+query,method:'GET'}
    });
    assert.equal(checked.calls.length,0);
    assert.equal(checked.results[0].response.status,400);
    assert.equal(store.read('ai-service-check.job.v1'),undefined);
  }
  assert.throws(()=>checker.parseOptions('service=constructor'));
});

test('malformed candidate lists fall back to known selections and do not claim complete enumeration',async()=>{
  const config=candidateConfig();
  config.getSubPolicies=(name,callback)=>callback('{bad json');
  const choices=await checker.nodeChoices({nodes:[]},config);
  assert.equal(choices.complete,false);
  assert.deepEqual(new Set(choices.nodes),new Set(['candidate & one','another']));
});

test('actual Mac Loon name/type objects are accepted as candidates; unknown types stay unlisted',async()=>{
  const config=candidateConfig();
  config.getSubPolicies=(name,callback)=>callback(JSON.stringify([
    {type:'node',name:'Mac candidate'}, {type:'node',name:'DIRECT'},
    {type:'new-unknown-type',name:'unverified'}, {type:'group',name:'US'}
  ]));
  const choices=await checker.nodeChoices({nodes:[]},config);
  assert.ok(choices.nodes.includes('Mac candidate'));
  assert.ok(!choices.nodes.includes('unverified'));
  assert.ok(!choices.nodes.includes('DIRECT'));
  assert.equal(choices.complete,false);
  config.getSubPolicies=(name,callback)=>callback(JSON.stringify([{type:'node',name:'Mac candidate'}]));
  assert.equal((await checker.nodeChoices({nodes:[]},config)).complete,true);
});

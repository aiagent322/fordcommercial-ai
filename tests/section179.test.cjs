const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../tools/section-179-calculator.html'),'utf8');
const context=vm.createContext({});
vm.runInContext(html.slice(html.indexOf('function estimateSection179('),html.indexOf('function c179(')),context);
const base={eligible:true,cost:72000,biz:100,fed:24,state:0,spending:72000,other:0,income:72000};
const estimate=extra=>context.estimateSection179({...base,...extra});
test('zero state and federal rates stay zero',()=>{
 let r=estimate({state:0});assert.equal(r.state,0);assert.equal(r.federal,17280);
 r=estimate({fed:0,state:0});assert.equal(r.savings,0);assert.equal(r.net,72000);
});
test('50% and lower business use do not produce a Section 179 deduction',()=>{
 for(const biz of [0,25,50]) assert.equal(estimate({biz}).deduction,0);
 assert.equal(estimate({biz:51}).deduction,36720);
});
test('a vehicle needs an explicit eligibility assumption',()=>{
 assert.throws(()=>estimate({eligible:false}),/eligibility/);
});
test('income zero and a limited remaining income cap are honored',()=>{
 assert.equal(estimate({income:0}).deduction,0);
 assert.equal(estimate({income:12000}).deduction,12000);
});
test('2026 general limit and phaseout boundaries are honored',()=>{
 const r=estimate({cost:3000000,spending:3000000,income:3000000});assert.equal(r.deduction,2560000);
 assert.equal(estimate({spending:4090000}).deduction,72000);
 assert.equal(estimate({spending:6600000}).deduction,50000);
 assert.equal(estimate({spending:6650000}).deduction,0);
 assert.equal(estimate({spending:7000000}).deduction,0);
});
test('other deductions consume the shared dollar allowance',()=>{
 assert.equal(estimate({other:2550000}).deduction,10000);
 assert.equal(estimate({other:2560000}).deduction,0);
});
test('partial business use reduces the eligible cost',()=>{
 const r=estimate({biz:80});assert.equal(r.deduction,57600);assert.equal(r.federal,13824);
});
test('empty, invalid, negative and out-of-range numbers cannot create an estimate',()=>{
 for(const bad of [{cost:-1},{cost:NaN},{income:Infinity},{fed:51},{biz:101},{state:-1},{state:21},{other:'1000'},{spending:0}]) assert.throws(()=>estimate(bad));
});
test('zero cost is not silently replaced with a default purchase',()=>{
 const r=estimate({cost:0,spending:0,income:0});assert.equal(r.deduction,0);assert.equal(r.net,0);
});
test('UI clears an old estimate after invalid input',()=>{
 const nodes={};
 for(const [key,value] of Object.entries(base)) nodes[key]={value:String(value),checked:value};
 for(const id of ['calc-status','net','r1','r2','r3','r4','r5','r6']) nodes[id]={textContent:'old'};
 const ctx=vm.createContext({document:{getElementById:id=>nodes[id]}});
 const code=html.slice(html.indexOf('function fmt('),html.indexOf('</script>',html.indexOf('function fmt(')));
 vm.runInContext(code,ctx);assert.equal(nodes.r2.textContent,'$72,000');
 nodes.cost.value='';ctx.c179();assert.equal(nodes.r2.textContent,'—');assert.equal(nodes.net.textContent,'—');
 nodes.cost.value='72000';nodes.eligible.checked=false;ctx.c179();assert.equal(nodes.r2.textContent,'—');
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../tools/payload-calculator.html'),'utf8');
const ctx=vm.createContext({});
vm.runInContext(html.slice(html.indexOf('function calculatePayload('),html.indexOf('function calc(')),ctx);
const base={cargo:2500,crew:400,body:1500,tongue:600,buf:20,capacity:null};
const calc=input=>ctx.calculatePayload({...base,...input});
test('all loads including trailer pin weight count toward the planning requirement',()=>{
 const result=calc({});assert.equal(result.raw,5000);assert.equal(result.margin,1000);assert.equal(result.target,6000);
});
test('missing vehicle capacity never produces a truck recommendation or approval',()=>{
 const result=calc({capacity:null});assert.equal(result.status,'unverified');assert.equal(result.remaining,null);assert.equal(result.model,undefined);
});
test('zero planning margin remains zero',()=>{
 const result=calc({buf:0});assert.equal(result.margin,0);assert.equal(result.target,result.raw);
});
test('capacity exactly equal to actual load leaves no allowance',()=>{
 const result=calc({capacity:5000,buf:0});assert.equal(result.status,'at-limit');assert.equal(result.remaining,0);
});
test('actual overload is distinct from an optional planning-margin shortfall',()=>{
 assert.equal(calc({capacity:4900}).status,'exceeded');
 assert.equal(calc({capacity:5500}).status,'margin-exceeded');
 assert.equal(calc({capacity:6000}).status,'within-entered-limit');
});
test('zero capacity is honored rather than treated as blank',()=>{
 assert.equal(calc({capacity:0}).status,'exceeded');assert.equal(calc({capacity:0}).remaining,-5000);
});
test('negative, empty, infinite and out-of-range values are rejected',()=>{
 for(const invalid of [{cargo:-1},{crew:NaN},{body:Infinity},{tongue:-1},{buf:-1},{buf:101},{capacity:NaN},{capacity:-1},{cargo:1000001},{capacity:'6000'}]) assert.throws(()=>calc(invalid));
});
test('large requirements never select F-650 or another model automatically',()=>{
 const result=calc({cargo:50000});assert.equal(result.status,'unverified');assert.equal(result.model,undefined);
 assert.ok(!html.includes('const MODELS='));
});
test('zero weights do not silently become default body or occupant weights',()=>{
 const result=calc({cargo:0,crew:0,body:0,tongue:0,buf:0});assert.equal(result.raw,0);assert.equal(result.target,0);
});
test('invalid input clears the previous breakdown and result',()=>{
 const nodes={};for(const [key,value] of Object.entries(base)) nodes[key]={value:value===null?'':String(value)};
 for(const id of ['rp','rm','rs','rbars']) nodes[id]={style:{},children:[],replaceChildren(){this.children=[]},appendChild(node){this.children.push(node)}};
 const c=vm.createContext({document:{getElementById:id=>nodes[id],createElement:tag=>({tag,style:{},children:[],appendChild(node){this.children.push(node)}})}});
 const start=html.indexOf('function fmt(');vm.runInContext(html.slice(start,html.indexOf('</script>',start)),c);
 assert.equal(nodes.rbars.children.length,6);nodes.cargo.value='-1';c.calc();
 assert.equal(nodes.rbars.children.length,0);assert.equal(nodes.rm.textContent,'Check your inputs');
});

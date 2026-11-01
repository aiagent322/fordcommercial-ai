const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.slice(html.indexOf('        function truckElement('),html.indexOf('        // ── mmRestart'));
function setup() {
  const made=[];
  function element(tag) {
    const node = {tag,children:[],style:{},textContent:'',appendChild(child){this.children.push(child);}};
    Object.defineProperty(node,'innerHTML',{set(){throw Error('HTML parsing is forbidden for recommendation content');}});
    made.push(node); return node;
  }
  const ctx=vm.createContext({document:{createElement:element}, MM_INVENTORY_URLS:{'F-350':'https://commercial-trucks.peoriaford.com/Pickup/F-350'}});
  vm.runInContext(source,ctx);
  return {ctx,made,area:element('section')};
}
const malicious='<img src=x onerror="alert(1)"><script>alert(2)</script>';
const truck={model:'F-350 Super Duty',config:malicious,upfit:malicious,description:malicious,price_range:malicious,score:88};
for (const alternatives of [false,true]) {
 test((alternatives?'alternative':'primary')+' cards treat all returned content as text',()=>{
   const {ctx,made,area}=setup(); ctx.renderTruckCards([truck],{},area,alternatives);
   assert.equal(made.filter(n=>n.textContent===malicious).length,4);
   assert.equal(made.filter(n=>n.tag==='img'||n.tag==='script').length,0);
   assert.equal(area.children.length,1);
   assert.equal(made.find(n=>n.tag==='a').href,'https://commercial-trucks.peoriaford.com/Pickup/F-350');
 });
}
test('scores are finite numeric widths even when malformed',()=>{
 for(const score of [NaN,Infinity,-10,400,'1; background:url(x)']) {
   const {ctx,made,area}=setup();ctx.renderTruckCards([{...truck,score}],{},area,false);
   const width=made.find(n=>n.className?.startsWith('mm-card-bar ')).style.width;
   assert.match(width,/^(?:100|[0-9]{1,2})%$/);
 }
});
test('inventory counts cannot inject HTML and links use trusted URLs',()=>{
 const {ctx,made,area}=setup();ctx.renderTruckCards([truck],{'F-350':malicious},area,false);
 assert.equal(made.find(n=>n.tag==='a').textContent,'Check Inventory →');
 assert.equal(made.find(n=>n.tag==='a').rel,'noopener noreferrer');
});
test('pricing is labeled as an AI estimate, not a dealer quote',()=>{
 const {ctx,made,area}=setup();ctx.renderTruckCards([truck],{},area,false);
 assert.ok(made.some(n=>n.textContent==='AI estimate · confirm with dealer'));
 assert.ok(made.some(n=>n.textContent==='AI ranking'));
});
test('invalid recommendation scores and oversized/object text are rejected',()=>{
 const ctx=vm.createContext({});
 vm.runInContext(html.slice(html.indexOf('        function getApprovedModels(a)'),html.indexOf('        function showMatchmakerError(')),ctx);
 const answers={body:'stock_pickup',fuel:'no_preference',crew:'2',towing:'none'};
 const approved=ctx.getApprovedModels(answers);
 for(const bad of [{...truck,score:'88'},{...truck,score:Infinity},{...truck,score:101},{...truck,config:{}},{...truck,description:'x'.repeat(1201)},{...truck,upfit:{}}]) {
  assert.throws(()=>ctx.validateTruckRecommendations([bad,truck,truck],answers,approved));
 }
});

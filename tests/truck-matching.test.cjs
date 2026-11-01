const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const source = html.slice(html.indexOf('        function getApprovedModels(a)'), html.indexOf('        function showMatchmakerError('));
const context = vm.createContext({}); vm.runInContext(source, context);
const base = {body:'stock_pickup', towing:'none', crew:'2', fuel:'no_preference'};
const candidates = a => context.getApprovedModels({...base, ...a});
test('van and heavy towing cannot bypass towing checks', () => {
  for (const towing of ['under_10k','10k_18k','18k_26k','26k_35k','over_35k']) {
    assert.equal(candidates({body:'van_shelving',towing}).models.length, 0);
  }
});
test('no-towing Transit candidates require compatible fuel and seating', () => {
  assert.ok(candidates({body:'van_shelving',fuel:'gas'}).models.every(m=>m.startsWith('Ford Transit')));
  assert.equal(candidates({body:'van_shelving',fuel:'diesel'}).models.length, 0);
  assert.equal(candidates({body:'van_shelving',crew:'4-5'}).models.length, 0);
});
test('dump and crane bodies cannot produce pickup recommendations', () => {
  for (const body of ['dump_body','crane_mechanics']) {
    assert.ok(candidates({body}).models.every(m=>m.includes('Chassis Cab') || m==='F-650/F-750'));
    assert.equal(candidates({body,towing:'26k_35k'}).models.length,0);
  }
});
test('stock pickup selection excludes all chassis cabs and vans', () => {
  assert.deepEqual(Array.from(candidates({}).models), ['F-250 Super Duty','F-350 Super Duty','F-450 Super Duty']);
});
test('gas preference and high towing cannot be solved by ignoring fuel', () => {
  assert.ok(!candidates({fuel:'gas'}).models.includes('F-450 Super Duty'));
  assert.equal(candidates({fuel:'gas',towing:'26k_35k'}).models.length,0);
});
test('open-ended towing and unknown inputs require configuration review', () => {
  assert.equal(candidates({towing:'over_35k'}).models.length,0);
  assert.equal(candidates({body:'unknown'}).models.length,0);
  assert.equal(candidates({fuel:'unknown'}).models.length,0);
  assert.equal(candidates({crew:'unknown'}).models.length,0);
  assert.ok(candidates({body:'not_sure'}).models.length>0);
});
test('all actual body/towing/fuel/crew choices return a well-formed outcome', () => {
  for (const body of ['stock_pickup','service_body','flatbed','dump_body','crane_mechanics','van_shelving','utility_body','not_sure'])
  for (const towing of ['none','under_10k','10k_18k','18k_26k','26k_35k','over_35k'])
  for (const fuel of ['gas','diesel','no_preference'])
  for (const crew of ['1','2','3','4-5']) {
    const result = candidates({body,towing,fuel,crew});
    assert.ok(Array.isArray(result.models));
    assert.ok(result.models.length ? result.constraint : result.reason);
  }
});
const truck = {model:'F-350 Super Duty',config:'Crew Cab, 6.7L diesel',description:'Research candidate; final capacity requires verification.',score:88};
test('returned AI models are validated against the exact candidate list', () => {
  assert.throws(()=>context.validateTruckRecommendations([{...truck,model:'F-250 Super Duty'},truck,truck], {...base,towing:'26k_35k'}, candidates({towing:'26k_35k'})));
  assert.throws(()=>context.validateTruckRecommendations([truck], base,candidates({})));
});
test('AI cannot ignore requested crew cab or fuel preference', () => {
  const answers = {...base,crew:'4-5',fuel:'diesel'};
  assert.equal(context.validateTruckRecommendations([truck,truck,truck], answers,candidates(answers)).length,3);
  for (const config of ['Regular Cab, 6.7L diesel','Crew Cab, 7.3L gas']) {
    assert.throws(()=>context.validateTruckRecommendations([{...truck,config},truck,truck], answers,candidates(answers)));
  }
});
test('incompatible requirements stop before the AI request', async () => {
  let requests=0;
  const nodes = {'mm-loading':{style:{}},'mm-form-card':{style:{}}};
  const ctx = vm.createContext({
    mmState:{answers:{...base,body:'van_shelving',towing:'over_35k'}},
    document:{getElementById:id=>nodes[id] || null},
    showMatchmakerError:message=>{ctx.message=message;},fetch:()=>{requests++;},
  });
  vm.runInContext(source,ctx);
  vm.runInContext(html.slice(html.indexOf('        async function mmRunAI()'),html.indexOf('        function truckElement(')),ctx);
  await ctx.mmRunAI(); assert.equal(requests,0);
  assert.equal(nodes['mm-form-card'].style.display,'block'); assert.ok(ctx.message);
});

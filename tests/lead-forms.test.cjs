const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const script = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .find(match => match[2].includes('function initLeadForms()'))[2];
function setup(options = {}) {
  const elements = {}, submissions = [];
  function element(id, value = '') {
    const attrs = {}, classes = new Set();
    return elements[id] = { id, value, dataset: {}, style: {}, listeners: {},
      addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); },
      setAttribute(name, val) { attrs[name] = val; },
      removeAttribute(name) { delete attrs[name]; },
      focus() { this.focused = true; }, reset() { this.resetCalled = true; },
      querySelectorAll() { return []; },
      querySelector() { return elements[id + '-button'] || null; },
      appendChild(child) { elements[child.id] = child; },
      classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) }
    };
  }
  for (const prefix of ['quote', 'mm']) {
    const formId = prefix === 'mm' ? 'mm-lead-form' : 'quote-form';
    element(formId); element(formId + '-button').textContent = 'Submit Quote Request';
    element(prefix === 'mm' ? 'mm-lead-success' : 'quote-success');
    for (const [key, value] of Object.entries({name:'Test Buyer', company:'Test Company', email:'buyer@example.invalid', phone:'6025550100', state:'AZ', timeline:'researching', truck:'f350'})) {
      element(`${prefix}-${key}`, value); element(`${prefix}-${key}-error`);
    }
  }
  element('quote-message', 'Work truck'); element('mm-notes', 'Two vehicles');
  const document = { readyState: 'complete', getElementById: id => elements[id] || null,
    querySelectorAll: () => [], querySelector: () => null, createElement: () => element('new-element') };
  const context = { document, window: {}, console, setTimeout: options.setTimeout || setTimeout, clearTimeout, setInterval, clearInterval, AbortController, fetch: options.fetch };
  vm.createContext(context); vm.runInContext(script, context);
  if (!options.realSubmit) context.submitLead = (payload, type) => submissions.push({payload, type});
  function submit(id) { let prevented = false; elements[id].listeners.submit.forEach(fn => fn({preventDefault() { prevented = true; }})); assert.ok(prevented); }
  return { context, elements, submissions, submit };
}
test('startup binds each form once, including repeated initialization', () => {
  const {context, elements} = setup(); context.initLeadForms(); context.initLeadForms();
  for (const id of ['quote-form', 'mm-lead-form']) assert.equal(elements[id].listeners.submit.length, 1);
});
test('both forms submit exactly one correctly typed payload', () => {
  const {elements, submissions, submit} = setup();
  submit('quote-form'); submit('mm-lead-form');
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].type, 'quote'); assert.equal(submissions[0].payload.message, 'Work truck');
  assert.equal(submissions[1].type, 'matchmaker'); assert.equal(submissions[1].payload.notes, 'Two vehicles');
  assert.equal(submissions[1].payload.formType, 'matchmaker');
});
test('invalid email, phone and required values do not submit; corrected form can retry', () => {
  for (const prefix of ['quote', 'mm']) {
    const {elements, submissions, submit} = setup(); const id = prefix === 'mm' ? 'mm-lead-form' : 'quote-form';
    for (const [field, bad, good] of [['email','invalid','buyer@example.invalid'],['phone','123','6025550100'],['company','','Test Company']]) {
      elements[`${prefix}-${field}`].value = bad; submit(id); assert.equal(submissions.length, 0);
      assert.equal(elements[`${prefix}-${field}`].focused, true);
      elements[`${prefix}-${field}`].value = good;
    }
    submit(id); assert.equal(submissions.length, 1);
  }
});
test('another-request control restores the quote form without adding a handler', () => {
  const {context, elements} = setup(); context.resetQuoteForm();
  assert.equal(elements['quote-form'].resetCalled, true);
  assert.equal(elements['quote-success'].style.display, 'none');
  assert.equal(elements['quote-name'].focused, true);
  assert.equal(elements['quote-form'].listeners.submit.length, 1);
});

for (const type of ['quote', 'matchmaker']) {
  test(type + ': acknowledgement hides form and shows external confirmation', async () => {
    const {context, elements} = setup({realSubmit: true, fetch: async () => ({ok:true, json: async () => ({success:true})})});
    assert.equal(await context.submitLead({name:'Test'}, type), true);
    const formId = type === 'quote' ? 'quote-form' : 'mm-lead-form';
    const successId = type === 'quote' ? 'quote-success' : 'mm-lead-success';
    assert.equal(elements[formId].style.display, 'none');
    assert.equal(elements[successId].style.display, 'block');
    assert.equal(elements[successId].focused, true);
    assert.equal(elements[formId + '-button'].disabled, false);
  });
}
for (const [name, fetch] of [
  ['network rejection', async () => { throw Error('offline'); }],
  ['HTTP 500', async () => ({ok:false})],
  ['application rejection', async () => ({ok:true, json:async () => ({success:false})})],
  ['unacknowledged response', async () => ({ok:true, json:async () => ({})})],
  ['malformed response', async () => ({ok:true, json:async () => {throw Error('invalid JSON');}})],
]) {
  test(name + ': preserves values and allows an explicit retry', async () => {
    const {context, elements} = setup({realSubmit:true, fetch});
    assert.equal(await context.submitLead({name:'Test'}, 'quote'), false);
    assert.notEqual(elements['quote-form'].style.display, 'none');
    assert.equal(elements['quote-name'].value, 'Test Buyer');
    assert.equal(elements['quote-success'].style.display, 'none');
    assert.equal(elements['quote-submit-error'].hidden, false);
    assert.equal(elements['quote-form-button'].disabled, false);
    context.fetch = async () => ({ok:true, json:async () => ({success:true})});
    assert.equal(await context.submitLead({name:'Test'}, 'quote'), true);
  });
}
test('double submit sends one request while pending', async () => {
  let calls = 0, finish;
  const {context} = setup({realSubmit:true, fetch:() => {calls++;return new Promise(resolve => finish = resolve);}});
  const first = context.submitLead({}, 'quote');
  await context.submitLead({}, 'quote'); assert.equal(calls, 1);
  finish({ok:true, json:async () => ({success:true})}); await first;
});
test('timeout aborts the request and restores the form', async () => {
  let abort;
  const {context, elements} = setup({realSubmit:true, setTimeout:fn => {abort = fn;return 0;},
    fetch:(_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('aborted'))))});
  const pending = context.submitLead({}, 'quote'); abort();
  assert.equal(await pending, false); assert.equal(elements['quote-form-button'].disabled, false);
  assert.equal(elements['quote-submit-error'].hidden, false);
});
test('matchmaker confirmation is outside the form it replaces', () => {
  assert.ok(html.indexOf('</form>', html.indexOf('id="mm-lead-form"')) < html.indexOf('id="mm-lead-success"'));
});

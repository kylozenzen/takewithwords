// Buffer Ideas bridge checks. Runs in jsdom with mocked Buffer responses, so no browser is needed.
// Setup: npm i -D jsdom@24   Run from the repo root: node tests/ideas-bridge.cjs
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const ROOT = process.argv[2] || process.cwd();

function boot({ scope = 'posts:write posts:read ideas:read ideas:write account:read offline_access', state, handler, token = true }) {
  let html = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
  html = html.replace(/<script src="https:\/\/cdnjs[^>]*><\/script>/g, '');
  const pre = ['js/buffer-api.js', 'js/content-items.js', 'js/buffer-ideas.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const calls = [];
  const dom = new JSDOM(html, {
    url: 'http://127.0.0.1:8765/app/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(win) {
      if (token) win.localStorage.setItem('twu_buffer_access_token', 'mock-token');
      if (scope !== null) win.localStorage.setItem('twu_buffer_token_scope', scope);
      win.localStorage.setItem('doctors-orders-app-v1', JSON.stringify(state));
      win.BufferConnection = { init() {}, getValidAccessToken: async () => 'mock-token' };
      win.BufferOAuth = {}; win.TWW_BUFFER = { prefix: 'twu' };
      win.scrollTo = () => {}; win.HTMLElement.prototype.scrollIntoView = () => {};
      win.matchMedia = win.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }));
      win.fetch = async (url, opts) => {
        const body = JSON.parse(opts.body); calls.push(body);
        const out = await handler(body.query, body.variables || {});
        return { ok: out.status ? out.status < 400 : true, status: out.status || 200, json: async () => out.json };
      };
      pre.forEach(code => win.eval(code));
    }
  });
  const errors = [];
  dom.window.addEventListener('error', e => errors.push(e.message));
  return { dom, win: dom.window, doc: dom.window.document, calls, errors };
}
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
async function until(fn, label) { for (let i = 0; i < 100; i++) { if (fn()) return; await tick(20); } throw new Error('timed out: ' + label); }
const click = (doc, sel) => { const el = doc.querySelector(sel); assert.ok(el, 'missing ' + sel); el.click(); };
const baseState = (extra) => Object.assign({ view: 'today', onboarded: true, drafts: [], buffer: { connected: true, selected: { channel1: true }, channels: [{ id: 'channel1', name: 'Ben', service: 'linkedin', limit: 3000, av: 'B', avBg: '#fff' }] } }, extra || {});

const IDEAS_P1 = [
  { id: 'i1', groupId: 'g1', createdAt: 1, updatedAt: 2, content: { title: 'What I learned shipping Uplink', text: 'The OAuth part took a week.\nThe UI took a day.' } },
  { id: 'i2', groupId: 'g2', createdAt: 1, updatedAt: 2, content: { title: '', text: 'Hot take: posting every day is overrated\nPost when you have something to say.' } }
];
const IDEAS_P2 = [{ id: 'i3', groupId: null, createdAt: 1, updatedAt: 2, content: { title: 'Unsorted thought', text: '' } }];

(async () => {
  // 1. Happy path: load, group, search, write from idea, save back as a new idea.
  {
    let created = [];
    const t = boot({
      state: baseState(),
      handler: async (q, v) => {
        if (q.includes('ideas(input')) {
          assert.equal(v.input.organizationId, 'org1');
          return { json: { data: { ideas: v.after ? { edges: IDEAS_P2.map(n => ({ cursor: 'c3', node: n })), pageInfo: { hasNextPage: false, endCursor: 'c3' } } : { edges: IDEAS_P1.map((n, i) => ({ cursor: 'c' + i, node: n })), pageInfo: { hasNextPage: true, endCursor: 'c2' } } } } };
        }
        if (q.includes('ideaGroups(')) return { json: { data: { ideaGroups: [{ id: 'g1', name: 'This week', isLocked: false }, { id: 'g2', name: 'Someday', isLocked: false }] } } };
        if (q.includes('createIdea(')) { created.push(v.input); return { json: { data: { createIdea: { __typename: 'Idea', id: 'new' + created.length, content: v.input.content } } } }; }
        if (q.includes('createPost') || q.includes('ContentItem')) throw new Error('unexpected post write');
        return { json: { data: { account: { organizations: [{ id: 'org1', name: 'Ben org' }] } } } };
      }
    });
    const { doc, win, calls } = t;
    await tick();
    assert.ok(doc.querySelector('.nav button[data-view="ideas"]'), 'nav has Buffer Ideas');
    assert.ok(!calls.some(c => /ideas\(|ideaGroups/.test(c.query)), 'Ideas are not read before the page opens'); calls.length = 0;
    click(doc, '.nav button[data-view="ideas"]');
    await until(() => doc.querySelectorAll('[data-idea]').length === 3, 'ideas listed');
    const groups = [...doc.querySelectorAll('.idea-group > h2')].map(h => h.textContent);
    assert.deepEqual(groups, ['This week · 1', 'Someday · 1', 'Unsorted · 1']);
    assert.match(doc.querySelector('#ideasCount').textContent, /3 ideas in Ben org/);
    assert.equal(doc.querySelector('[data-idea="i2"] b').textContent, 'Hot take: posting every day is overrated', 'untitled idea uses its first line');
    const search = doc.querySelector('#ideaSearch'); search.value = 'oauth'; search.dispatchEvent(new win.Event('input', { bubbles: true }));
    assert.equal(doc.querySelectorAll('[data-idea]').length, 1, 'search filters');
    search.value = ''; search.dispatchEvent(new win.Event('input', { bubbles: true }));
    click(doc, '[data-act="idea-write"][data-id="i1"]');
    await tick();
    assert.equal(doc.querySelector('#titleInput').value, 'What I learned shipping Uplink', 'title carried over');
    assert.equal(doc.querySelector('#bodyInput').value, '', 'body left for the writer');
    assert.match(doc.querySelector('.prompt-strip').textContent, /Buffer idea/);
    assert.match(doc.querySelector('.idea-note').textContent, /OAuth part took a week/);
    assert.match(doc.querySelector('#ideaSyncStatus').textContent, /adds a new one/);
    const body = doc.querySelector('#bodyInput'); body.value = 'Shipping Uplink taught me the boring part is the hard part.'; body.dispatchEvent(new win.Event('input', { bubbles: true }));
    await tick(400);
    click(doc, '[data-act="save-idea"]');
    await until(() => /Saved as a new Buffer Idea/.test(doc.querySelector('#ideaSyncStatus').textContent), 'idea saved');
    assert.equal(created.length, 1);
    assert.deepEqual(created[0], { organizationId: 'org1', content: { text: 'Shipping Uplink taught me the boring part is the hard part.', title: 'What I learned shipping Uplink' } });
    click(doc, '[data-act="save-idea"]');
    await tick(50);
    assert.equal(created.length, 1, 'repeat save of the same text is blocked');
    assert.match(doc.querySelector('#ideaSyncStatus').textContent, /Already on your Buffer Ideas board/);
    const saved = JSON.parse(win.localStorage.getItem('doctors-orders-app-v1'));
    assert.equal(saved.drafts[0].fromIdea.id, 'i1'); assert.equal(saved.drafts[0].savedIdea.id, 'new1');
    // Back on the Ideas page, the started idea links to its draft and the new idea is listed.
    click(doc, '.nav button[data-view="ideas"]');
    await tick();
    assert.ok(doc.querySelector('[data-idea="i1"] [data-open]'), 'started idea offers Open draft');
    assert.ok(doc.querySelector('[data-idea="new1"]'), 'new idea appears without a reload');
    assert.ok(!calls.some(c => /createPost|ContentItem/.test(c.query)), 'no posts or content items written');
    assert.deepEqual(t.errors, []);
    console.log('PASS 1: list + groups + pagination, search, write from idea, save back once, no posts written');
  }
  // 2. Old token without the ideas scope: ask to reconnect, no API call.
  {
    const t = boot({ scope: 'posts:write posts:read account:read offline_access', state: baseState({ view: 'ideas' }), handler: async () => { throw new Error('should not call'); } });
    await until(() => t.doc.querySelector('#ideasError'), 'scope error');
    assert.match(t.doc.querySelector('#ideasError').textContent, /Reconnect once/);
    assert.ok(t.doc.querySelector('[data-act="ideas-reconnect"]'));
    assert.equal(t.calls.length, 0);
    console.log('PASS 2: missing ideas scope shows Reconnect without calling Buffer');
  }
  // 3. Buffer refuses (403) -> friendly reconnect message.
  {
    const t = boot({ scope: null, state: baseState({ view: 'ideas' }), handler: async (q) => q.includes('ideas(input') ? { status: 403, json: { message: 'Forbidden' } } : q.includes('ideaGroups') ? { json: { data: { ideaGroups: [] } } } : { json: { data: { account: { organizations: [{ id: 'org1', name: 'Ben org' }] } } } } });
    await until(() => t.doc.querySelector('#ideasError'), 'forbidden error');
    assert.match(t.doc.querySelector('#ideasError').textContent, /Reconnect Buffer to allow it/);
    assert.ok(t.doc.querySelector('[data-act="ideas-reconnect"]'));
    console.log('PASS 3: a 403 from Buffer becomes a reconnect prompt');
  }
  // 4. Not connected: page explains, nothing is called.
  {
    const t = boot({ token: false, scope: null, state: baseState({ view: 'ideas' }), handler: async () => { throw new Error('no'); } });
    await tick();
    assert.match(t.doc.querySelector('.ideas-page').textContent, /Connect Buffer to see your Ideas/);
    assert.ok(!t.calls.some(c => /ideas\(|ideaGroups/.test(c.query)));
    console.log('PASS 4: signed-out Ideas page asks to connect and reads nothing');
  }
  // 5. Empty board.
  {
    const t = boot({ state: baseState({ view: 'ideas' }), handler: async (q) => q.includes('ideas(input') ? { json: { data: { ideas: { edges: [], pageInfo: { hasNextPage: false } } } } } : q.includes('ideaGroups') ? { json: { data: { ideaGroups: [] } } } : { json: { data: { account: { organizations: [{ id: 'org1', name: 'Ben org' }] } } } } });
    await until(() => /Ideas board is empty/.test(t.doc.querySelector('.ideas-page').textContent), 'empty state');
    console.log('PASS 5: empty board state');
  }
})().catch(e => { console.error(e); process.exit(1); });

(function (global) {
  'use strict';
  var PROXY = '/.netlify/functions/buffer-proxy';
  var LIMITS = { linkedin: 3000, mastodon: 500, threads: 500, bluesky: 300, twitter: 280, x: 280, facebook: 63206, instagram: 2200, pinterest: 500, tiktok: 2200, youtube: 5000, googlebusiness: 1500, startpage: 1500 };
  function limitFor(service) { var s = String(service || '').toLowerCase(); for (var k in LIMITS) { if (s.indexOf(k) !== -1) return LIMITS[k]; } return 280; }
  function bgFor(service) { var s = String(service || '').toLowerCase(); if (s.indexOf('linkedin') !== -1 || s.indexOf('face') !== -1) return '#C9DAF0'; if (s.indexOf('blue') !== -1 || s.indexOf('twit') !== -1 || s === 'x') return '#BFD8F5'; return '#E2E2E2'; }
  async function token() {
    if (!global.BufferConnection) throw new Error('Buffer sign-in is not loaded.');
    var t = await global.BufferConnection.getValidAccessToken();
    if (!t) throw new Error('Not connected to Buffer.');
    return t;
  }
  async function call(query, variables) {
    var tk = await token();
    var res = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tk, query: query, variables: variables || {} }) });
    var data = await res.json().catch(function () { return null; });
    if (!res.ok || !data) { var m = (data && (data.message || data.error)) || ('Buffer request failed (' + res.status + ').'); var e = new Error(m); e.status = res.status; throw e; }
    if (data.errors && data.errors.length && !data.data) throw new Error(data.errors[0].message || 'Buffer error.');
    return data.data;
  }
  async function fetchChannels() {
    var acc = await call('query { account { organizations { id name } } }');
    var org = acc && acc.account && acc.account.organizations && acc.account.organizations[0];
    if (!org) return [];
    var d = await call('query Channels($organizationId: OrganizationId!){ channels(input:{organizationId:$organizationId}){ id displayName name service } }', { organizationId: org.id });
    var list = (d && d.channels) || [];
    return list.map(function (c) { var name = c.displayName || c.name || c.service || 'Channel'; return { id: c.id, name: name, service: c.service, limit: limitFor(c.service), av: (name[0] || '?').toUpperCase(), avBg: bgFor(c.service), orgId: org.id }; });
  }
  var MUT = 'mutation CreatePost($input: CreatePostInput!){ createPost(input: $input){ __typename ... on PostActionSuccess{ post{ id dueAt text channelId } } ... on MutationError{ message } } }';
  async function createPost(input) {
    var d = await call(MUT, { input: input });
    var r = d && d.createPost;
    if (!r) throw new Error('Empty response from Buffer.');
    if (r.__typename === 'PostActionSuccess') return r.post;
    throw new Error(r.message || ('Buffer rejected the post (' + r.__typename + ').'));
  }
  global.BufferAPI = { call: call, fetchChannels: fetchChannels, createPost: createPost, limitFor: limitFor };
})(typeof window !== 'undefined' ? window : globalThis);

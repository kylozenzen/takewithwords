(function (global) {
  'use strict';
  // Buffer Ideas bridge. Reads the Ideas board and saves new ideas.
  // Needs the ideas:read and ideas:write scopes. Buffer's API has no idea
  // update or delete, so every save creates a new idea.
  var LIST = 'query Ideas($input: IdeasInput!, $first: Int, $after: String){ ideas(input: $input, first: $first, after: $after){ edges{ node{ id groupId createdAt updatedAt content{ title text } } } pageInfo{ hasNextPage endCursor } } }';
  var GROUPS = 'query IdeaGroups($input: IdeaGroupsInput!){ ideaGroups(input: $input){ id name isLocked } }';
  var CREATE = 'mutation CreateIdea($input: CreateIdeaInput!){ createIdea(input: $input){ __typename ... on Idea{ id content{ title text } } ... on MutationError{ message } } }';

  function scopeProblem(err) {
    var m = String(err && err.message || '');
    return (err && (err.status === 401 || err.status === 403)) || /scope|forbidden|not authori[sz]ed|permission|insufficient/i.test(m);
  }
  function friendly(err) {
    if (scopeProblem(err)) {
      var e = new Error('Buffer needs your OK to share Ideas with Take With Words. Reconnect Buffer to allow it.');
      e.needsReconnect = true; return e;
    }
    return err;
  }
  async function organization() {
    var data = await global.BufferAPI.call('query { account { organizations { id name } } }');
    var orgs = data && data.account && data.account.organizations || [];
    if (!orgs.length) throw new Error('No Buffer organization is available.');
    return orgs[0];
  }
  async function groups(orgId) {
    try {
      var d = await global.BufferAPI.call(GROUPS, { input: { organizationId: orgId } });
      return (d && d.ideaGroups) || [];
    } catch (err) {
      // Groups only label the list. Ideas still load without them.
      if (scopeProblem(err)) throw friendly(err);
      return [];
    }
  }
  async function list(orgId, opts) {
    opts = opts || {};
    var max = opts.max || 150, out = [], after = null;
    try {
      for (var page = 0; page < 5 && out.length < max; page++) {
        var d = await global.BufferAPI.call(LIST, { input: { organizationId: orgId }, first: 50, after: after });
        var conn = d && d.ideas; if (!conn) break;
        (conn.edges || []).forEach(function (e) {
          var n = e && e.node; if (!n) return;
          var c = n.content || {};
          out.push({ id: n.id, groupId: n.groupId || null, title: c.title || '', text: c.text || '', updatedAt: n.updatedAt || n.createdAt || 0 });
        });
        if (!conn.pageInfo || !conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
        after = conn.pageInfo.endCursor;
      }
    } catch (err) { throw friendly(err); }
    return out.slice(0, max);
  }
  async function load() {
    var org = await organization();
    var both = await Promise.all([list(org.id), groups(org.id)]);
    return { orgId: org.id, orgName: org.name, ideas: both[0], groups: both[1], at: Date.now() };
  }
  async function create(orgId, title, text) {
    var input = { organizationId: orgId, content: { text: text } };
    if (title) input.content.title = title;
    var d;
    try { d = await global.BufferAPI.call(CREATE, { input: input }); } catch (err) { throw friendly(err); }
    var r = d && d.createIdea;
    if (!r) throw new Error('Empty response from Buffer.');
    if (r.id) return r;
    throw friendly(new Error(r.message || 'Buffer could not save this idea.'));
  }
  global.TWWIdeas = { load: load, list: list, groups: groups, create: create, organization: organization, scopeProblem: scopeProblem };
})(typeof window !== 'undefined' ? window : globalThis);

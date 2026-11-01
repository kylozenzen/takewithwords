(function (global) {
  'use strict';
  // Experimental Buffer schema stays isolated from private writing state.
  async function mutation(name, input) {
    var data = await global.BufferAPI.call(global.TWWContentItemOperations[name], { input: input });
    var result = data && data[name];
    if (!result || !result.contentItem) throw new Error(result && (result.message || (result.errors || []).map(function (e) { return e.message; }).join(' ')) || 'Buffer could not save this content.');
    return result.contentItem;
  }
  async function read(id) {
    var data = await global.BufferAPI.call(global.TWWContentItemOperations.read, { id: id });
    if (!data || !data.contentItem) throw new Error('This content item is no longer available in Buffer.');
    return data.contentItem;
  }
  async function organization() {
    var data = await global.BufferAPI.call(global.TWWContentItemOperations.organization);
    var orgs = data && data.account && data.account.organizations || [];
    if (!orgs.length) throw new Error('No Buffer organization is available.');
    return orgs[0].id;
  }
  global.TWWContentItems = {
    read: read, organization: organization,
    create: function (input) { return mutation('createContentItemDraft', input); },
    update: function (input) { return mutation('updateContentItemDraft', input); },
    promote: function (input) { return mutation('promoteContentItemDraftToPosts', input); }
  };
})(window);


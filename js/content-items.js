(function (global) {
  'use strict';
  // Experimental Buffer schema stays isolated from private writing state.
  var BODY = 'id title body{__typename ... on DraftContent{text aiAssisted assets{__typename}} ... on PostContent{posts{id status dueAt channel{id name}}}}';
  async function mutation(name, type, input) {
    var success = name.charAt(0).toUpperCase() + name.slice(1) + 'Success';
    var failure = name.charAt(0).toUpperCase() + name.slice(1) + 'Failure';
    var data = await global.BufferAPI.call('mutation WriteContent($input:' + type + '!){' + name + '(input:$input){__typename ... on ' + success + '{contentItem{' + BODY + '}} ... on ' + failure + '{message errors{message}}}}', { input: input });
    var result = data && data[name];
    if (!result || !result.contentItem) throw new Error(result && (result.message || (result.errors || []).map(function (e) { return e.message; }).join(' ')) || 'Buffer could not save this content.');
    return result.contentItem;
  }
  async function read(id) {
    var data = await global.BufferAPI.call('query ReadContent($id:ContentItemId!){contentItem(input:{id:$id}){' + BODY + '}}', { id: id });
    if (!data || !data.contentItem) throw new Error('This content item is no longer available in Buffer.');
    return data.contentItem;
  }
  async function organization() {
    var data = await global.BufferAPI.call('query {account{organizations{id name}}}');
    var orgs = data && data.account && data.account.organizations || [];
    if (!orgs.length) throw new Error('No Buffer organization is available.');
    return orgs[0].id;
  }
  global.TWWContentItems = {
    read: read, organization: organization,
    create: function (input) { return mutation('createContentItemDraft', 'CreateContentItemDraftInput', input); },
    update: function (input) { return mutation('updateContentItemDraft', 'UpdateContentItemDraftInput', input); },
    promote: function (input) { return mutation('promoteContentItemDraftToPosts', 'PromoteContentItemDraftToPostsInput', input); }
  };
})(window);

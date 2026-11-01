(function (root, factory) {
  'use strict';
  // The browser and proxy share exact documents; user values travel as variables.
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TWWContentItemOperations = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  return Object.freeze({
  "read": "query ReadContent($id:ContentItemId!){contentItem(input:{id:$id}){id title body{__typename ... on DraftContent{text aiAssisted assets{__typename}} ... on PostContent{posts{id status dueAt channel{id name}}}}}}",
  "organization": "query {account{organizations{id name}}}",
  "createContentItemDraft": "mutation WriteContent($input:CreateContentItemDraftInput!){createContentItemDraft(input:$input){__typename ... on CreateContentItemDraftSuccess{contentItem{id title body{__typename ... on DraftContent{text aiAssisted assets{__typename}} ... on PostContent{posts{id status dueAt channel{id name}}}}}} ... on CreateContentItemDraftFailure{message errors{message}}}}",
  "updateContentItemDraft": "mutation WriteContent($input:UpdateContentItemDraftInput!){updateContentItemDraft(input:$input){__typename ... on UpdateContentItemDraftSuccess{contentItem{id title body{__typename ... on DraftContent{text aiAssisted assets{__typename}} ... on PostContent{posts{id status dueAt channel{id name}}}}}} ... on UpdateContentItemDraftFailure{message errors{message}}}}",
  "promoteContentItemDraftToPosts": "mutation WriteContent($input:PromoteContentItemDraftToPostsInput!){promoteContentItemDraftToPosts(input:$input){__typename ... on PromoteContentItemDraftToPostsSuccess{contentItem{id title body{__typename ... on DraftContent{text aiAssisted assets{__typename}} ... on PostContent{posts{id status dueAt channel{id name}}}}}} ... on PromoteContentItemDraftToPostsFailure{message errors{message}}}}"
});
});

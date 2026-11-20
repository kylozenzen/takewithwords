# Take With Words for Buffer: roadmap

Take With Words grows from a standalone writing app into the writing room for Buffer. You plan in Buffer, you write here in your own words, and the finished writing goes back to Buffer.

## What "Buffer extension" can mean today

Checked against developers.buffer.com on Nov 20, 2026:

- Buffer has no app marketplace or plugin slot inside its own app. Third-party tools are OAuth apps that call the public GraphQL API (OAuth 2.0 with PKCE, which Take With Words already uses).
- Buffer's Integrations page lists tools like Zapier, Notion, n8n and AI assistants. There is no self-serve listing for indie apps. After Buffer Commit, the contest gallery opens Dec 7.
- Available to OAuth apps: posts, channels, Content Items (experimental), Ideas (read and create, no edit or delete), tags (experimental), snippets and notes scopes.
- Not available to OAuth apps: post metrics. Buffer serves those only with a personal API key, so analytics are out of scope.

So "extension" here means a companion app that plugs into a person's Buffer workflow through OAuth, plus, later, a browser extension that opens Take With Words beside Buffer.

## The larger tool

1. **Ideas bridge (milestone 1, built on `feat/buffer-ideas-bridge`).** A Buffer Ideas page lists your Ideas board by column. "Write this one" starts a draft from an idea. "Save as Buffer Idea" parks writing back on the board. Nothing is posted.
2. **Drafts loop (milestone 2).** List channel-less Content Item drafts so writing started in Buffer can be finished here, and show Buffer tags as topics on drafts. Uses the `contentItems` query and `tagsV2`, both marked experimental by Buffer.
3. **Browser side panel (milestone 3).** A Chrome extension that opens Take With Words in a side panel next to buffer.com, with quick capture into a Buffer Idea. Needs a second redirect URI (the extension's chromiumapp.org address) registered on the Buffer app.
4. **Later.** Snippets for lines you reuse, and the Substack accessory idea.

## Milestone 1 notes

- Scope change: sign-in now asks for `ideas:read ideas:write`. People who signed in before see a one-time "Reconnect Buffer" prompt on the Ideas page. Their drafts are not touched.
- Buffer's API can't edit or delete ideas, so saving writing that started from an idea creates a new idea. A repeat save of the same text is blocked.
- Ideas are read when the Ideas page opens and held in memory for that visit. Drafts keep a copy of the idea they started from.
- Checks: `node tests/ideas-bridge.cjs` (jsdom, mocked Buffer). Before release, sign in on a test Buffer account and confirm the `ideas` query shape and `createIdea` response live, because Buffer's guide and reference disagree on the `createIdea` return type.

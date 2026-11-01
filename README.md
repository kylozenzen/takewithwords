# Take With Words

AI-free writing with three starting points: Just write, Work through an idea, and Find a spark.

Guided development asks about the thought, tension, supporting example, audience, and angle. Answers are saved with the draft and remain separate from the finished writing. Second Opinions has a dedicated page for saving, editing, searching, and removing creators, including profile links and notes. Existing drafts, references, and earlier guided starts remain available.

## Buffer handoff

Writing stays on this device until an explicit Buffer action. **Save writing to Buffer** creates a channel-less Content Item; **Post with Buffer** creates the selected channel posts together from that source. Original writing and development notes remain on the device. After promotion, edit the channel posts in Buffer. A repeated send is blocked rather than creating duplicates.

The adapter in `js/content-items.js` targets Buffer's experimental Content Items API. Exact GraphQL documents live in `js/content-item-operations.js`, shared by the browser and the proxy allowlist. The proxy only forwards approved operations and retains the per-instance 120 requests per token per minute limit, origin checks, request size limit, and timeout. Existing OAuth configuration and `posts:read` / `posts:write` permissions are required. Remote text changes and attachments block overwriting a linked draft. This is a read-before-write check, not a server-side compare-and-swap guarantee. A failed initial creation with an ambiguous network response should be checked in Buffer before retrying.

## Local checks

Serve the repository root with `python3 -m http.server 8765`. Install Playwright as a development dependency and its Chromium browser, then run `node tests/writing-flow.cjs`, `node tests/content-handoff.cjs`, and `node tests/proxy-operations.cjs`. Set `CHROMIUM_PATH` if using an existing browser binary. The handoff test sends the real browser queries through the actual proxy handler with mocked upstream Buffer responses. Proxy tests also check blocked arbitrary queries, invalid origins, missing tokens, and rate limiting. These checks never create real posts. Both `/app.html` and `/app/` serve identical app source.

Before release, verify OAuth and a real channel-less draft/save-to-channel-drafts round trip on a test Buffer account. Do not infer live API success from the mocked checks.


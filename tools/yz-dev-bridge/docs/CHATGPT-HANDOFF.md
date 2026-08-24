# ChatGPT Handoff

## NORMAL USE

1. Start YZ Dev Bridge.
2. Open http://127.0.0.1:8787/
3. Click **Create ChatGPT Handoff**.
4. Click **Copy Handoff Link**.
5. Paste the link into ChatGPT.
6. Ask ChatGPT to send the current Cursor prompt through YZ Dev Bridge.

That is enough for normal use.

Large prompts use CHUNKS automatically (create → append → status → commit) and produce **exactly one** TASK.

---

## What this replaces

You no longer need to manually set temporary environment variables or redeploy Firebase for each ChatGPT conversation.

The Control Center creates a short-lived one-time handoff URL. ChatGPT opens it once and receives a temporary session capability.

## Security model (summary)

| Secret | Browser? | ChatGPT? | Firestore? |
|--------|----------|----------|------------|
| Permanent ChatGPT key | Never | Never via handoff | Never |
| Bearer API token | Never | Never | Never |
| One-time handoff code | Only inside the URL you copy | Once via bootstrap URL | Hash only |
| Temporary session key | Never | Once in bootstrap JSON | Hash only |

- Handoff codes: ~10 minutes, single-use
- Sessions: 1 hour / 24 hours / 7 days (dashboard choice), revocable
- Auth order for `/chatgpt/*`: permanent key → env temporary session → Firestore session

## Rollback

1. Keep using permanent `YZ_BRIDGE_CHATGPT_KEY` (unchanged).
2. Optional: revoke all sessions from the Control Center.
3. Redeploy previous `yzBridgeApi` if needed; local dashboard handoff card becomes unavailable if admin routes are absent.

## Future

Custom MCP / OAuth for ChatGPT is a possible later enhancement. This handoff works with the existing Firebase HTTPS API today.

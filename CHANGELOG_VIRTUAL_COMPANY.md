# Virtual Company revision

## Removed
- Queue-oriented waiting/received UI
- QueueItem / queueOverrides / deriveQueue
- Per-message target selection
- SmartPasteBox automatic next-agent flow
- Automatic notion of "next" Agent

## Added
- Fixed company Role catalog with Skills and role prompts
- Default specialists: Emma, Mike, Bob, Ava, Tom
- Add custom Role capability
- Add Agent from a fixed Role
- Per-room Agent membership
- Shared User + Agent timeline
- Manual Agent selection for every turn
- Per-Agent context cursor per room
- Delta-only Copy New Context
- Selected Agent's own messages excluded from re-copy
- Shared no-unsolicited-questions Agent policy
- v2 -> v3 persistence migration
- Vite local API default changed to port 8001

## Exact delta example covered by test
If Mike is synced through message 4 in:
1 User / 2 Emma / 3 Bob / 4 Mike / 5 Emma / 6 Bob,
Mike's next copied context is exactly messages 5 and 6.

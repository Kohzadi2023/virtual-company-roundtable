# Productization Decision Baseline v2

| | |
| --- | --- |
| **Status** | **DRAFT — not ratified.** Nothing in this document is a company decision until the owner approves it in writing. |
| **Date** | 2026-10-04 |
| **Replaces** | The proposal "Model A (BYOK Tauri Desktop) Paid Pilot Authorization and Critical-Path Execution Baseline" produced by the in-app AI meeting of 2026-10-04 |
| **Owner** | The product owner (a person). The AI specialists in that meeting gave advice; they did not decide. |

## 1. Why this document exists

The AI meeting produced a single, confident-sounding proposal in which facts, estimates and invented numbers are mixed. Left alone, a proposal like that slowly turns into "what the company decided". This baseline separates the four kinds of statement so each can be handled correctly:

| Label | Meaning | How it may be used |
| --- | --- | --- |
| **FACT** | Checked against the code, a test run, or an official source on the date shown. | May be relied on until its date goes stale. |
| **ASSUMPTION** | A planning number or belief with no evidence yet. | Never quoted to a customer, lawyer or investor as true. Has a validation step. |
| **DECISION** | Something the owner has actually decided, in their own words. | Binding until the owner changes it. |
| **OPEN** | A question only the owner (or counsel) can answer. | Blocks the item that depends on it. |

## 2. Decisions

| # | Decision | Status |
| --- | --- | --- |
| D1 | Build the **Executive Decision Brief** export in the current app. | **Decided and shipped** (owner request 2026-10-04; PR #105, v2.8.38). |
| D2 | **Proposed, not yet ratified:** *Conditional-Go for validation of Model A (BYOK), with a desktop/Tauri build as the initial pilot delivery candidate. This approval does not ratify any provisional price, cost estimate, conversion assumption, development timeline, legal conclusion, or the long-term rejection of the SaaS and enterprise models.* | **Awaiting owner approval.** Approving it commits the team to run the validation in section 6 and nothing else. |

Not decided: a paid pilot, pricing, a Rust/SQLite rewrite, dropping the web version, Models B and C (they are **deferred**, not rejected), a legal entity, signing certificates.

## 3. Facts

### 3.1 From the code (checked 2026-10-04)

| Fact | Evidence |
| --- | --- |
| The optional backend stores **one shared snapshot** in a single-row table; there are no users, tenants or sessions. | `backend/app.py`: `workspace_snapshot ... CHECK (id = 1)`; no user/tenant concept. |
| Backend access control is **one optional shared secret** (`APP_API_KEY`); if the variable is unset, the endpoints are open. The comparison is a plain `!=`. | `backend/app.py`, `require_api_key`. (The meeting wrongly called the backend simply "unauthenticated".) |
| The user's **Gemini key is stored in the browser's `localStorage`**, in plain text, not in an OS keyring. | `frontend/src/lib/llm/credentials.ts`. |
| The Tauri CSP already limits `connect-src` to self, the local backend and `generativelanguage.googleapis.com`. | `frontend/src-tauri/tauri.conf.json`. |
| `keyring-rs` is **not** a dependency today. | `frontend/src-tauri/Cargo.toml`. |
| The app's price table uses **Gemini 3.x** models; `gemini-3.8-flash` is the default and its promotional price ends 2027-01-01. | `frontend/src/lib/llm/pricing.ts`. |
| Workspace state persists in IndexedDB; per-meeting and monthly spend limits exist and are enforced in the client. | `frontend/src/lib/snapshotDb.ts`, `frontend/src/lib/llm/budget.ts`. |
| The suite has **375 automated tests**, all passing, and CI runs on every change. | Test run on `main` at v2.8.38. |

### 3.2 From official sources (retrieved 2026-10-04; re-check before quoting)

| Fact | Source |
| --- | --- |
| Apple Developer Program: **US$99 per membership year**. Organizations need a **D-U-N-S Number**, which is **free**; allow **up to 5 business days** for D&B to issue it and **up to 2 business days** more for Apple to receive it. Apple's own review time is not stated on these pages. | [Apple enrolment](https://developer.apple.com/programs/enroll/), [Apple D-U-N-S help](https://developer.apple.com/help/account/membership/D-U-N-S) |
| Azure Artifact Signing (formerly Trusted Signing): **Basic US$9.99/month** per account (5,000 signatures/month), Premium US$99.99/month. | [Microsoft Learn, SKUs](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-change-sku) |
| Artifact Signing is available to **organizations in the USA, Canada, the EU and the UK** (individuals: USA and Canada only). Identity validation: "a few business days". | [Microsoft Learn, code-signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options) |
| **A signature does not remove SmartScreen warnings.** Reputation builds over time; initial warnings are expected, with Artifact Signing, OV and (since 2024) EV certificates alike. OV certificates cost about US$150–300/year and need a hardware-backed key. | Same page. |
| Current Gemini API prices per 1M tokens (paid tier): **3.8 Flash** input $0.75 / output $3.75 through 2026-12-31, then $1.50 / $7.50 (cached input $0.075, then $0.15); **3.5 Flash** $1.50 / $9.00; **3.5 Flash-Lite** $0.30 / $2.50. Gemini 1.5 is not on the page. | [Google AI pricing](https://ai.google.dev/gemini-api/docs/pricing) |

## 4. Corrections to the meeting record

| Meeting claim | Correction |
| --- | --- |
| "8/8 agree" and "8 votes" | **9 advisory votes**, all agree (the facilitator did not vote). The meeting's own table lists nine names. |
| "Verified Fact: US$450–600 upfront and an irreducible 7–14 business days for signing" | Not a fact. Apple $99/year plus Azure $9.99/month (about **US$219/year**) are sourced; the total elapsed time has **no official figure** (D-U-N-S up to 7 business days, then Apple's review, then Microsoft's "few business days"). Treat 7–14 days as an **assumption**; the only way to learn it is to start. |
| "Gate: install with zero SmartScreen warnings" | Cannot be guaranteed for a new publisher even when signed. Re-word the gate (section 6) and tell pilot users what they will see. |
| "Backend is unauthenticated" | One optional shared API key; no per-user identity. Still unfit for multi-user use. |
| Costs estimated on "Gemini 1.5 Pro/Flash" | Obsolete. Every cost band the meeting quoted ($0.25–0.55, $0.95–1.75, $2.50 stop) was computed on the wrong models and is unusable. |
| "Models B and C permanently disqualified" | **Deferred** until validation evidence exists. |
| "Rust rewrite in 2–3 weeks" (and Round-1 "2–4 weeks") | Unvalidated estimate. The change touches key storage, persistence and the LLM client. |
| "~40% of consultants have no Google billing project" | Invented by an AI persona; no source. |
| "We are not a data processor / indemnity is enforceable / $49 liability cap holds" | Legal conclusions from an AI persona. They are hypotheses for counsel, not findings. Payment and support tooling (checkout, crash reports, diagnostics) can still make the company a controller of some data. |
| "Unanimous specialist agreement" as evidence | All nine voters are AI personas from one model family. Agreement among them is **not independent validation**. |

## 5. Assumptions register

| ID | Assumption (from the AI meeting) | Type | Validate by | Blocks |
| --- | --- | --- | --- | --- |
| A1 | Quick Review costs ~$0.25–0.55 and Full Board ~$0.95–1.75 per run | Cost | Gate 1 benchmark (section 6) | Any price, any cost promise to users |
| A2 | $49 evaluation fee, credited toward $99/year | Pricing hypothesis | Customer conversations; written commitments | Stripe, PPEA |
| A3 | 60 contacts → 20 calls → 12 qualified → 10 paid → 3 convert | Sales hypothesis | Real outreach results | Pilot size |
| A4 | Solo diligence advisors / fractional CTOs are the buyer | Market | Customer conversations | Positioning |
| A5 | Users will create their own Gemini key within minutes | Adoption | Observe 5 users do it | BYOK as the model |
| A6 | 2–4 weeks to pilot-ready; ~240–280 person-hours | Engineering | Break the work into tickets and re-estimate | Any date |
| A7 | 4-hour support response and 24-hour hotfix | Operations | Decide what the owner can really staff | Any SLA text |
| A8 | Desktop-only is required | Tactical | Compare with a web pilot; the web version is **kept** until decided | Dropping web |
| A9 | Corporate entity exists or can be created quickly | Corporate | Owner (OPEN-1) | Signing, Stripe, contract |

## 6. Validation plan (Stage 0)

Stage 0 needs no corporate entity, certificates or binaries. It costs the Gemini bill and the owner's time.

**Gate 1 — cost measured.** Fund a Gemini key. Run 5 standard meetings (the preset the product will really ship, the real model, the real thinking level, one English and one Persian brief). Record input, output, thinking and cached tokens and the invoice; reconcile the in-app ledger against it. Output: a cost table that replaces A1.

**Gate 2 — demand.** Show the sample Executive Decision Brief to 10–15 target buyers. Pass if at least 3 give a written commitment (letter of intent or pre-payment) after seeing it. Interest without a commitment does not count.

**Gate 3 — legal.** A licensed lawyer reviews the pilot agreement, the liability and indemnity terms, the disclaimer wording in the brief (`BRIEF_DISCLAIMER` is placeholder text), and the "not a data processor" position.

**Gate 4 — entity and signing started.** The legal entity exists and the Apple and Microsoft enrolments are submitted, so the real elapsed time becomes known (replaces the 7–14 days assumption). The Windows release gate becomes: *signed with the company identity; first-run warnings documented in the onboarding guide* — not "no warnings".

Only after all four gates does Stage 1 (hardening: OS keyring for the key, then, if justified, SQLite persistence and a Rust gateway) get estimated and scheduled.

## 7. Open questions for the owner

1. **OPEN-1:** Does a company exist, in which country? (Artifact Signing eligibility, Stripe, taxes and the contract all depend on it.)
2. **OPEN-2:** Windows only, or macOS as well, for the first pilot? (Apple costs and notarization only matter for macOS.)
3. **OPEN-3:** Is the web version kept as a pilot channel alongside desktop? (Browser key storage is weaker; desktop keyring work addresses that.)
4. **OPEN-4:** Who can really handle pilot support, and during which hours?
5. **OPEN-5:** Approve, amend or reject D2.

## 8. Next actions (owner: a person, not an AI persona)

1. Fund the Gemini account; then run Gate 1 with the app's usage-by-meeting table (the assistant can prepare the table).
2. List 10–15 candidates from your own network for Gate 2.
3. Decide D2 and answer OPEN-1 to OPEN-4.

---

*Sources were read on 2026-10-04 and summarised by a tool; prices and policies change. Re-open the linked pages before quoting any number outside this team.*

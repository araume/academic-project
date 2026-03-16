# Algorithm Explanation

This document explains two backend algorithms in simple terms:

1. Task-intent detection pipeline (Personal page AI assistant)
2. Feed ranking pipeline (Home page feed ordering)

---

## 1) Task-Intent Detection Pipeline

### What problem it solves
When a user chats with the Personal page AI, the system must decide:
- Is this message asking to create tasks?
- If yes, what exact tasks should be drafted?
- How do we avoid adding wrong tasks automatically?

### Easy-to-understand flow
Think of this as a 5-step filter:

1. Quick pattern check (regex first)
- The system looks for obvious task patterns like:
  - `tasks: ...`
  - `todo: ...`
  - `create task: ...`
- If it can cleanly parse tasks from text, it uses those immediately.

2. AI intent classification
- If regex is not enough, it asks the AI model:
  - "Is this a task-order request or not?"
  - If yes, return tasks in strict JSON format.

3. AI fallback extraction
- If the classifier says "not clearly a task order" (or returns no tasks), it runs a second AI pass:
  - "Try extracting actionable tasks anyway from the conversation and context."

4. Task normalization and validation
- Any generated tasks are cleaned and standardized:
  - keeps only valid task objects
  - enforces allowed priorities: `low`, `normal`, `urgent`
  - validates due date format: `YYYY-MM-DD`
  - normalizes tags
  - limits result count to 10 tasks

5. Proposal-first confirmation (safety step)
- Tasks are not inserted directly into `personal_tasks`.
- They are stored first as a pending proposal in `ai_task_proposals`.
- User must explicitly press confirm:
  - Confirm -> tasks are created in `personal_tasks`
  - Reject -> proposal is discarded

### Why this design works
- Fast for obvious requests (regex path)
- Flexible for natural language (AI path)
- Safer because it always asks confirmation before writing tasks

---

## 2) Feed Ranking Pipeline

### What problem it solves
The Home feed should not be random or purely chronological.  
It should show posts that are both fresh and relevant to the user.

### Easy-to-understand flow
Think of each post getting a score card:

1. Start with visible posts only
- Applies access/visibility rules first.
- Excludes blocked or hidden authors.
- Applies optional course filter if selected.

2. Compute base signals per post
- Post age in hours (`_hoursSincePost`)
- Engagement raw score:
  - `likes * 2 + comments * 3`
- Relationship/context boosts:
  - follow boost if uploader is followed
  - course boost if post course matches user course
- Freshness bucket boost:
  - <= 1 hour: +3.2
  - <= 6 hours: +2.2
  - <= 24 hours: +1.2
  - <= 72 hours: +0.55

3. Smooth the signals
- Engagement is log-scaled (`ln(1 + engagementRaw)`) so viral posts do not dominate too hard.
- Recency score decays with age (`1 / (hours + 2)^0.75`).
- Extra recency exposure boost gives newer posts temporary visibility.

4. Build final feed score
- Final score combines weighted parts:
  - `2.1 * engagementScore`
  - `13.5 * recencyScore`
  - `followBoost`
  - `courseBoost`
  - `freshBoost`
  - `recencyExposureBoost`

5. Sort and paginate
- Sort by highest `_feedScore`, then newer timestamp, then `_id`.
- Apply `skip` and `limit` for pagination.

### Why this design works
- Keeps feed fresh (strong recency influence)
- Still rewards quality interactions (likes/comments)
- Personalizes using follows and course match
- Prevents older high-like posts from permanently burying new content

---

## Simple summary
- Task-intent pipeline: detect request -> extract tasks -> validate -> ask user confirmation -> then save.
- Feed ranking pipeline: compute per-post quality + freshness + personalization score -> sort descending.

---

## MCP Side of Task Intent (How it actually works)

### Short answer
For task creation, the system uses an **MCP-like workflow pattern**, not an external MCP tool call.

### What “MCP side” means in this codebase
When tasks are detected, the backend stores them as a structured proposal with:
- `intentType: "mcp_task_order"`
- `status: "pending"`
- source conversation/message metadata

Then the UI shows action buttons:
- `Confirm tasks`
- `Reject tasks`

This behaves like a tool-command handshake: draft first, explicit user approval second.

### Step-by-step MCP-style lifecycle
1. Draft creation
- The backend creates a proposal in `ai_task_proposals` instead of writing directly to `personal_tasks`.
- Assistant replies with a preview: "I prepared an MCP task order draft..."

2. Pending state
- Proposal remains in `pending` until user decides.
- Frontend stores `proposalId` and reveals confirm/reject controls.

3. Confirm path
- `POST /api/personal/task-proposals/:id/confirm`
- Backend re-normalizes tasks, inserts them into `personal_tasks`, and marks proposal `accepted`.

4. Reject path
- `POST /api/personal/task-proposals/:id/reject`
- Backend marks proposal `rejected`; no tasks are inserted.

### Important distinction
- **Task intent flow:** MCP-style confirmation model (`mcp_task_order` label + proposal state machine).
- **Actual external MCP tool usage:** separate logic for Google Cloud queries/actions, triggered by cloud-related prompts when `GCLOUD_MCP_SERVER_URL` is configured.

### When your deployed gcloud-mcp-remote is actually used
- If `GCLOUD_MCP_SERVER_URL` is set, the chat request includes an MCP tool definition (`type: "mcp"`, `server_label: "gcloud"`).
- A keyword gate checks whether the user message is cloud-related (for example: gcloud, Cloud Run, buckets, projects, BigQuery).
- If cloud-related, `tool_choice` becomes `required` (the model must use MCP).
- If not cloud-related, `tool_choice` is `auto` (the model may answer without MCP).
- If MCP fails (endpoint/tool issue), the backend retries without MCP so chat still works.

### Why this can feel confusing
- In task-intent requests, the system usually exits early once a task proposal is created.
- That means the external gcloud MCP tool path is often skipped for those messages, even though MCP is configured and working for cloud-operation prompts.

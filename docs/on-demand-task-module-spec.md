# On-Demand Task Module — Build-Ready Product and Engineering Specification

**Product:** SBR ERP / Farm Connect  
**Module route:** `/on-demand-task`  
**Document status:** Implementation specification  
**Target:** Responsive web administration plus mobile-friendly field execution  
**Primary principle:** The task engine is generic. Cultivation, maintenance, logistics, inspection, office, documentation, and procurement behavior is supplied by templates, links, checklists, evidence rules, and custom fields—not hard-coded into the base task.

---

## 1. Purpose and outcomes

The On-Demand Task module is the ERP's universal work orchestration layer. It must allow an authorized user to create, assign, execute, monitor, verify, and close any ad-hoc or recurring task attached to a land parcel, plot, project site, office, department, warehouse, asset, vendor, customer, document, ERP transaction, map coordinate, or no physical location.

The module must answer five questions without opening another screen:

1. What has to be done, where, and by when?
2. Who requested, owns, executes, approves, and verifies it?
3. What steps, resources, evidence, and dependencies are required?
4. What is blocking it and who must act next?
5. Is the work genuinely complete, verified, and auditable?

### 1.1 In scope

- Blank tasks and template-based tasks.
- Individual, team, department-queue, and vendor execution.
- Locationless, single-location, and multi-location tasks.
- Sequential or parallel checklist items and task dependencies.
- Optional pre-execution approval and post-execution verification.
- Progress, comments, mentions, evidence, measurements, resource requests, issues, holds, extensions, rework, and cancellation.
- One-time and recurring tasks.
- Responsive list, board, calendar, dashboard, create, detail, inbox, and template screens.
- Full audit history, permissions, notifications, escalation, and reporting.
- Integration links to existing ERP records without copying their source data.

### 1.2 Out of scope for Phase 1

- A general-purpose BPMN/workflow designer.
- Payroll calculation, stock valuation, purchase approval, vehicle dispatch, or vendor billing. The task links to those modules and reflects their state.
- Live route optimization or continuous GPS tracking.
- Free-form user-authored executable rules.
- Deleting issued tasks or audit events.

### 1.3 Success measures

- At least 90% of ordinary ad-hoc work can be created without a new developer-defined task type.
- A standard task can be created in under two minutes.
- An assignee can identify the next action from the task header and action bar.
- Every closed task has a traceable requester, owner, execution history, and closure actor.
- No task reaches `CLOSED` while a mandatory checklist, evidence rule, unresolved blocker, required verification, or active child task remains incomplete.

---

## 2. Domain language and separation of concepts

| Term | Meaning |
|---|---|
| Task | The accountable unit of work with one lifecycle and one owner. |
| Task type | The behavioral intent: Action, Inspection, Follow-up, Information, Corrective, Approval, or Other. |
| Category | Reporting taxonomy such as Cultivation, Maintenance, Logistics, Office Administration, Safety, IT, or Procurement Follow-up. |
| Template | A reusable snapshot used to prefill task fields, checklist, evidence, custom fields, and default roles. |
| Checklist item | A step or acceptance condition inside a task; it does not have a separate task ID. |
| Child task | Independently accountable work with its own owner, dates, and lifecycle, linked to a parent. |
| Related entity | A typed reference to an ERP record, such as land, plot, asset, PR, vehicle, vendor, or document. |
| Location | Where work occurs. This may reference an ERP entity and/or contain an address and GPS point. |
| Owner | The single person internally accountable for completion. Always required after assignment. |
| Executor | Person, team, department queue, or vendor performing the work. |
| Internal coordinator | Required internal employee when the executor is a vendor. |
| Approver | Person who authorizes task activation when pre-approval is required. |
| Verifier | Person who accepts quality/quantity after submission. |
| Observer | Read-only follower who receives selected notifications. |
| Issue | A tracked execution problem with its own resolution status. |
| Hold | A task state that pauses active execution; it requires a reason and next-review date. |
| Evidence rule | A completion requirement such as photo, document, GPS, measurement, signature, or acknowledgement. |
| Progress update | An immutable chronological work update; corrections are added as new events. |

Do not use `Overdue` as a lifecycle status. It is a computed condition: an active task is overdue when `due_at < now` and its status is not terminal. This avoids contradictory states such as “On Hold and Overdue.”

---

## 3. Roles and responsibility model

Each task has one requester and creator, one accountable owner after assignment, and any number of other participants.

| Task role | Required | Cardinality | Rules |
|---|---:|---:|---|
| Requester | Yes | 1 | Business person asking for the work; defaults to creator. |
| Creator | Yes | 1 | Immutable audit identity. May create on behalf of requester if permitted. |
| Owner | After approval/assignment | 1 | Internal user only. Cannot be an inactive user. |
| Executor | Before assignment | 1 target | Employee, team, department queue, or vendor. |
| Internal coordinator | Vendor tasks only | 1 | Becomes owner unless another internal owner is selected. |
| Collaborator | No | Many | Can update assigned checklist items and add work updates. |
| Approver | Conditional | One or more ordered stages | Cannot approve a task they created where segregation rules forbid self-approval. |
| Verifier | Conditional | 1 or more | Must be different from executor when the template requires independent verification. |
| Observer | No | Many | Read and notify only. |

Use RACI-like labels in the UI only where useful; show plain labels such as “Owner” and “Verifier” to field users.

---

## 4. Task types, categories, and templates

### 4.1 Task types

The built-in type enum is stable and controls defaults, not hard-coded screens:

- `ACTION`: perform work.
- `INSPECTION`: observe, measure, and report.
- `FOLLOW_UP`: pursue an outcome with a party or department.
- `INFORMATION`: collect or submit information.
- `CORRECTIVE`: rectify a known defect or non-conformance.
- `APPROVAL`: obtain or record a decision; do not replace core ERP approval flows.
- `OTHER`: exceptional use; require a category and clear description.

### 4.2 Categories

Categories are tenant-admin data, support parent/child nesting, and may be archived but not deleted when referenced. Seed:

Cultivation, Maintenance, Inspection, Survey, Material Movement, Logistics, Procurement Follow-up, Documentation, Compliance, Office Administration, Finance, HR, IT Support, Safety, Quality, Vendor Coordination, Emergency, and Other.

Category must not determine which columns exist in the task table. Category-specific data uses custom-field definitions attached to templates.

### 4.3 Templates

A template may define:

- name, category, type, description and expected-outcome prompts;
- default priority, duration, due-date rule, location/entity types;
- checklist items, dependencies between checklist items, and item assignee roles;
- custom fields with conditions;
- evidence rules and verification rules;
- default owner/executor resolution rules;
- approval stages and escalation policy;
- suggested resources and linked module types;
- recurrence eligibility.

Task creation copies a versioned template snapshot into the task. Editing a template never changes already-created tasks. Store `template_id`, `template_version`, and `template_snapshot`.

Example templates:

| Template | Key configuration |
|---|---|
| Land inspection | Land/plot required; geo before/after photos; crop, water, fencing custom fields; verifier required. |
| Fertilizer application | Land/plots, area and unit; inventory request; labour and material usage; photo and quantity evidence. |
| Borewell repair | Land + asset; vendor allowed; diagnosis checklist; parts link; service report; independent verification. |
| Material delivery | Source/destination; vehicle; dispatch, gate entry, quantity, shortage and challan evidence. |
| Office document submission | Department or no location; document attachment; authority, reference number and acknowledgement. |
| Procurement follow-up | Purchase request/PO/vendor links; next follow-up date; response and commitment date. |

---

## 5. Lifecycle and state machine

### 5.1 Persisted statuses

```text
DRAFT
PENDING_APPROVAL
CHANGES_REQUESTED
APPROVED
ASSIGNED
ACCEPTED
IN_PROGRESS
ON_HOLD
SUBMITTED
UNDER_VERIFICATION
REWORK_REQUIRED
VERIFIED
CLOSED
CANCELLED
REJECTED
```

`APPROVED` may be transitory: once all approvals finish, the service immediately assigns the task if a valid owner/executor exists; otherwise it remains `APPROVED` and appears in “Needs assignment.” `UNDER_VERIFICATION` may similarly be entered immediately after `SUBMITTED` when a verifier exists.

### 5.2 Happy paths

Without pre-approval, with verification:

```text
DRAFT → ASSIGNED → ACCEPTED → IN_PROGRESS → SUBMITTED
      → UNDER_VERIFICATION → VERIFIED → CLOSED
```

With pre-approval:

```text
DRAFT → PENDING_APPROVAL → APPROVED → ASSIGNED → ACCEPTED
      → IN_PROGRESS → SUBMITTED → UNDER_VERIFICATION → VERIFIED → CLOSED
```

Without verification, a valid `SUBMITTED` task may transition directly to `CLOSED` by policy or to `VERIFIED` then `CLOSED` when an explicit closure actor is required.

### 5.3 Transition contract

| From | Action | To | Actor | Mandatory input / guard |
|---|---|---|---|---|
| DRAFT | Save draft | DRAFT | Creator/editor | Title may be incomplete; autosave allowed. |
| DRAFT / CHANGES_REQUESTED | Submit | PENDING_APPROVAL or ASSIGNED | Creator/editor | All activation validations pass. |
| PENDING_APPROVAL | Approve stage | PENDING_APPROVAL or APPROVED | Current approver | Comment required if configured. |
| PENDING_APPROVAL | Request changes | CHANGES_REQUESTED | Current approver | Reason required. |
| PENDING_APPROVAL | Reject | REJECTED | Current approver | Reason required; terminal. |
| APPROVED | Assign | ASSIGNED | Dispatcher/manager | Owner and executor valid. |
| ASSIGNED | Accept | ACCEPTED | Owner or employee executor | Optional note. |
| ASSIGNED | Decline | APPROVED or ASSIGNED | Intended assignee | Reason required; clears/preserves assignment per policy and alerts dispatcher. |
| ACCEPTED | Start | IN_PROGRESS | Owner/executor | Actual start recorded once. |
| IN_PROGRESS | Put on hold | ON_HOLD | Owner/executor/manager | Hold reason, details, review date. |
| ON_HOLD | Resume | IN_PROGRESS | Owner/manager | Resume note; unresolved blocking issue may prevent resume. |
| IN_PROGRESS / REWORK_REQUIRED | Submit completion | SUBMITTED | Owner/executor | Completion note; all completion guards pass. |
| SUBMITTED | Begin verification | UNDER_VERIFICATION | System/verifier | Verifier exists and is active. |
| UNDER_VERIFICATION | Request rework | REWORK_REQUIRED | Verifier | Deficiencies, required corrections, and rework due date. |
| UNDER_VERIFICATION | Verify | VERIFIED | Verifier | Verification checklist/evidence pass. |
| VERIFIED | Close | CLOSED | Closer/system | No unresolved guard; closure note if configured. |
| Any non-terminal | Cancel | CANCELLED | Authorized manager/admin | Reason required; resource reservations released. |

### 5.4 Transition implementation rules

- Only the server changes status. Never accept a client-provided arbitrary next status.
- Every transition is atomic, permission-checked, guard-checked, and logged.
- Require `If-Match`/version on mutations. Return `409 TASK_VERSION_CONFLICT` on stale updates.
- Repeating an operation with the same idempotency key returns the first result and does not duplicate events or notifications.
- A `REWORK_REQUIRED` task retains prior submissions and verification outcomes. Increment `submission_round`.
- Terminal tasks are immutable except for authorized administrative correction, which creates a visible audit event. Reopening is excluded from Phase 1; use a linked corrective task.
- Cancellation does not delete stock issues, purchase requests, vehicle bookings, or other linked records. Attempt release/cancel through their owning services and show any cleanup failures.

### 5.5 Derived conditions

- `is_overdue`: due date crossed and non-terminal.
- `is_due_soon`: within configurable reminder threshold.
- `is_blocked`: unresolved blocking issue, incomplete hard dependency, or integration block.
- `progress_percent`: weighted checklist completion when checklist weights exist; otherwise explicit progress. It is never inferred from lifecycle status.
- `next_actor`: computed from status, pending approval/verification stages, and assignment.

---

## 6. End-to-end user workflows

### 6.1 Create a blank or template task

1. User selects **New task**.
2. Choice screen offers recent/favorite templates, search templates, and **Blank task**.
3. The create experience uses six compact sections with a persistent summary:
   - Basics
   - Context
   - People
   - Plan
   - Completion controls
   - Review
4. User can save a draft at any point. Autosave after idle changes and before navigation.
5. Review page displays missing fields, approval route, recipients, linked resources, and generated recurrence preview.
6. Primary action is context-specific: **Send for approval** or **Assign task**.
7. On success, navigate to the task detail page and show the task number.

Do not require users to understand every advanced field. Basic creation requires title, type, category, one owner/executor, and due date. All other sections are progressive disclosure.

### 6.2 Department queue assignment

1. Creator assigns task to a department queue and selects an accountable dispatch owner or department manager.
2. Task becomes `ASSIGNED` to the queue and appears in the department inbox.
3. An authorized dispatcher selects **Assign to person** or a permitted employee selects **Pick up**.
4. The system records the queue assignment and person assignment separately.
5. SLA remains based on original assignment unless the dispatcher changes it with a reason.

### 6.3 Vendor execution

1. Select vendor executor and required internal coordinator.
2. Optional vendor contact receives a secure notification or the internal coordinator records vendor updates.
3. Owner remains an internal employee.
4. Resource/payment/work-order links remain references; the task cannot authorize expenditure by itself.
5. Vendor evidence is attributed to the vendor contact or the internal employee who uploaded it on the vendor's behalf.

### 6.4 Execute a task

1. Assignee opens **My tasks**, sees priority, due state, location, and required actions.
2. Accept or decline. Decline requires reason.
3. Start task; if location proof is required, request device location at this point, with an explicit permission prompt.
4. Complete checklist items, add progress notes, upload evidence, record quantities/resources, and raise issues as work proceeds.
5. The sticky action bar shows the exact unmet completion requirements.
6. Submit completion. Client performs convenience validation; server is authoritative.

### 6.5 Hold and issue resolution

1. Executor selects **Put on hold** or **Raise issue**.
2. Hold requires reason, detail, and review date; issue requires type, owner, severity, and whether it blocks work.
3. Blocking issue sets `is_blocked`; putting the task on hold is a separate explicit action.
4. Issue owner resolves with resolution note and optional evidence.
5. Reporter or owner may confirm resolution if configured.
6. Task resumes only through the `Resume` transition.

### 6.6 Due-date extension

1. Owner requests a new due date before or after the deadline and provides reason/impact.
2. If policy allows self-extension, apply and audit; otherwise create an approval request.
3. Original due date remains in due-date history.
4. Reminder/escalation timers recompute only after approval.
5. Rejecting an extension does not change task lifecycle.

### 6.7 Verify, rework, and close

1. Submission freezes the submitted completion snapshot but not comments.
2. Verifier reviews expected outcome, checklist, measurements, evidence, resource usage, issues, and prior rework rounds side-by-side.
3. **Request rework** requires one or more deficiency items, instructions, and a due date.
4. Executor addresses each deficiency and resubmits.
5. **Verify** records verification result and optional quantity/quality score.
6. Close is automatic or explicit according to template policy. Closed tasks show a completion summary and remain read-only.

### 6.8 Recurring tasks

- A recurrence rule is a generator, not a single repeating task.
- Generate each task instance with a stable `series_id` and its own number, lifecycle, evidence, and audit trail.
- Support daily, weekly, monthly, quarterly, selected weekdays/dates, end date, max occurrences, and timezone.
- Default generation horizon: configurable, e.g. seven days before occurrence.
- Editing a series offers “future unstarted instances” or “series rule only.” Never mutate completed or active instances silently.
- If an assignee is inactive at generation, create the instance in `APPROVED`/needs-assignment and alert the series owner.
- DST and timezone computation occurs on the server using the series timezone.

---

## 7. Information architecture and routes

| Route | Screen | Purpose |
|---|---|---|
| `/on-demand-task` | Task workspace | Default saved view, KPIs, filters, table/board. |
| `/on-demand-task/new` | Create task | Blank/template creation. |
| `/on-demand-task/:taskId` | Task detail | Read, act, execute, verify, audit. |
| `/on-demand-task/:taskId/edit` | Edit task | Draft editing or controlled active-task edit. |
| `/on-demand-task/inbox` | My inbox | Approvals, verifications, assignments, issues. |
| `/on-demand-task/calendar` | Calendar | Start/due dates and recurrence instances. |
| `/on-demand-task/templates` | Templates | Browse/manage templates. |
| `/on-demand-task/settings` | Module settings | Categories, rules, evidence types, SLA/escalation. |

Use URL query parameters for shareable workspace state: `view`, `status`, `owner`, `executor`, `category`, `locationType`, `locationId`, `priority`, `due`, `q`, `sort`, and pagination cursor. A task detail should be directly linkable.

---

## 8. UI and UX specification

### 8.1 Workspace / dashboard

Desktop layout:

- Page header: title, global search, **New task**, overflow actions.
- “My work” counters: Assigned to me, Pending my approval, Pending my verification, Overdue, Blocked, Rework.
- Saved-view chips: My active tasks, Created by me, Department queue, All active, Recently closed.
- Filter bar: search, status, priority, category, location, owner/executor, date, blocked/overdue, more filters; active filters appear as removable chips.
- View switch: table, board, calendar. Table is default for management; board groups by lifecycle; calendar uses planned start/due dates.
- Bulk action bar appears only after selection and only shows actions valid for all selected tasks. No bulk verification or closure in Phase 1.

Table columns:

`Task ID`, `Title`, `Status`, `Priority`, `Context`, `Owner / Executor`, `Start`, `Due`, `Progress`, `Next actor`, `Flags`, and row actions. Allow column choice and saved view preferences. Keep task ID/title sticky on wide tables.

Row behavior:

- Single click opens task detail.
- Status and priority use text plus color; never color alone.
- Overdue shows elapsed delay, e.g. “2d overdue.”
- Blocked icon includes blocker summary in tooltip.
- Empty states reflect filters and permissions, with **Clear filters** or **Create task**.
- Loading uses skeleton rows; failures preserve filters and offer retry.

### 8.2 Create/edit task

Prefer a full page, not the current large modal. A full page supports drafts, deep links, browser navigation, mobile, and long configurations.

#### Section A — Basics

| Field | Control | Required / behavior |
|---|---|---|
| Template | Searchable selector | Optional; locks snapshot version when selected. |
| Title | Text, 3–160 chars | Required for activation. Use outcome-oriented placeholder. |
| Description | Rich text / plain markdown subset | Required by template or for `OTHER`. Sanitize server-side. |
| Expected outcome | Multiline text | Required where verification is enabled. |
| Task type | Select | Required. |
| Category / subcategory | Cascading search select | Required. |
| Priority | Low, Normal, High, Critical | Default Normal. Critical requires reason. |
| Tags | Token input | Optional; controlled or free-form by setting. |

#### Section B — Context and location

Location mode: `No fixed location`, `ERP location/entity`, or `Custom location`.

- ERP entity picker first selects entity type then searches records.
- Support primary location plus related entities. Example: primary Land Parcel, related Borewell Asset, Vendor, and Purchase Request.
- Land hierarchy: cluster/zone → land/farm → plot(s), depending on existing master availability.
- Site hierarchy: project → site → area.
- Office: branch → department/area.
- Custom: label, address, latitude, longitude, radius, and map pin.
- Never store entity display name as the only reference. Store type, ID, and a display snapshot.
- Validate access to referenced entities at create and read time.

#### Section C — People

- Requester; editable only with “create on behalf” permission.
- Assignment mode: Employee, Team, Department queue, Vendor.
- Owner: required internal user.
- Executor target; searchable, filtered to active and accessible records.
- Internal coordinator appears and is required for vendor mode.
- Collaborators, observers, verifier(s).
- Approval policy preview shows resolved stages before submission.
- Warn, do not always block, when the owner is overloaded; show active task count and overdue count.

#### Section D — Plan and schedule

- Planned start and due datetime; “all day” option.
- Estimated effort value and unit; optional estimated cost for reporting only unless a budget link is selected.
- Recurrence switch and rule builder.
- Checklist builder with drag reorder, title, description, mandatory flag, assignee role/person, due offset, weight, evidence rules, dependency items, and parallel/sequential marker.
- Task dependencies: search existing tasks, choose `Finish-to-start` in Phase 1, show dependency status.
- Resource requirements grouped as labour, inventory/material, equipment/asset, vehicle/logistics, and other.
- Resource rows are requests until confirmed by the owning ERP module. Show `Requested`, `Reserved`, `Issued`, `Consumed`, `Returned`, or `Rejected` from integration state.

#### Section E — Completion controls

- Evidence rules: type, minimum count, timing (`before`, `during`, `after`, `completion`), checklist association, geo requirement, allowed file types, and verifier visibility.
- Verification: none, manager, named user, role, entity manager, or ordered multi-stage.
- Completion fields: quantity, unit, measurement tolerance, completion note, customer/landowner acknowledgement.
- Closure: automatic after verification or manual by specified role.
- Escalation policy preview.

#### Section F — Review

Summarize all selections in plain language. Show warnings separately from blocking errors. Provide **Back**, **Save draft**, and one primary activation action. After a failed submit, jump to the first invalid section and show a top error summary with anchor links.

### 8.3 Task detail page

Header:

- Breadcrumb and task number.
- Title, status, priority, overdue/blocked flags.
- Context link and map button where relevant.
- Owner/executor avatars and due date.
- Progress bar with source label (“6 of 8 required items”).
- Watch/unwatch, copy link, print/export, overflow menu.

Desktop body uses a wide main column and right summary rail. Mobile collapses the rail into “Task info.”

Tabs:

1. **Overview** — description, expected outcome, current blockers, checklist, latest updates.
2. **Updates** — chronological notes, progress, mentions, system events summarized separately.
3. **Evidence** — grouped by rule, submission round, and checklist item.
4. **Resources** — requirements and linked inventory/vehicle/labour/equipment states.
5. **Issues** — open/resolved issues with owner and SLA.
6. **Approvals** — approval, extension, and verification decisions.
7. **Related** — entities, dependencies, parent/child tasks, ERP transactions.
8. **Activity** — immutable audit timeline with filters and before/after field changes.

The sticky action bar is server-driven via an `allowed_actions` response. It may show Accept, Decline, Start, Update, Hold, Resume, Raise issue, Request extension, Submit, Request rework, Verify, Close, Reassign, Edit, or Cancel. Never infer authorization only in the client.

### 8.4 My inbox

One queue with filters for `Assignment`, `Approval`, `Verification`, `Issue`, `Extension`, and `Rework`. Each card identifies why it needs the current user, its SLA, context, requester, and primary action. Opening a card marks it seen, not completed.

### 8.5 Mobile field UX

- Bottom navigation: My tasks, Inbox, Create (if permitted), Profile.
- Large 44px minimum targets and sticky bottom primary action.
- Condense task card to title, context, due state, status, and next action.
- Camera capture should allow photo annotation and retain capture time; GPS only with explicit permission.
- Queue uploads during weak connectivity and show per-file retry state. Phase 1 may support upload retry without full offline editing.
- Never silently claim an upload succeeded. Completion remains blocked until mandatory evidence reaches `READY` server state.
- Warn before leaving unsaved forms; drafts autosave locally and server-side when online.

### 8.6 Accessibility and interaction

- WCAG 2.1 AA contrast, keyboard navigation, visible focus, semantic labels, and screen-reader status announcements.
- Status is always text plus color/icon.
- Dialogs trap focus and return it to their trigger.
- Destructive actions use a confirmation dialog naming the task and consequence.
- Dates display in the user's locale/timezone and reveal the stored timezone where ambiguity matters.
- Use sentence case; avoid internal enum labels.

---

## 9. Data model

Use UUIDs as database primary keys and a separate human-readable number such as `ODT-2026-000125`. All mutable tables have `created_at`, `created_by`, `updated_at`, and an integer `version` where concurrent edits matter. Timestamps are UTC; preserve the originating timezone for schedules/recurrence.

### 9.1 Core tables

#### `od_tasks`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | Internal ID. |
| tenant_id | uuid/index | Required for every query. |
| task_number | varchar unique per tenant | Human-readable immutable ID. |
| title | varchar(160) | Required after draft. |
| description | text | Sanitized. |
| expected_outcome | text | Completion target. |
| task_type | enum | Stable type enum. |
| category_id | uuid FK | Required after draft. |
| template_id / template_version | uuid/int nullable | Creation source. |
| template_snapshot | jsonb nullable | Immutable configuration snapshot. |
| priority | enum | LOW/NORMAL/HIGH/CRITICAL. |
| critical_reason | text nullable | Required for critical. |
| status | enum/index | Lifecycle status. |
| requester_id / creator_id / owner_id | uuid | Internal identities. |
| executor_type | enum | USER/TEAM/DEPARTMENT/VENDOR. |
| executor_id | uuid | Typed target. |
| internal_coordinator_id | uuid nullable | Required for vendor. |
| planned_start_at / due_at | timestamptz | Due after start. |
| schedule_timezone | varchar | IANA timezone. |
| actual_start_at / submitted_at / verified_at / closed_at / cancelled_at | timestamptz nullable | Set by transitions. |
| estimated_effort_minutes | int nullable | Non-negative. |
| explicit_progress_percent | numeric(5,2) | Used when checklist weights absent. |
| approval_required / verification_required | boolean | Snapshot flags. |
| closure_mode | enum | AUTO/MANUAL. |
| submission_round | int | Starts at 0. |
| parent_task_id | uuid nullable | Child-task relation. |
| series_id | uuid nullable | Recurrence relation. |
| source_module / source_entity_type / source_entity_id | varchar nullable | Task generated by another module. |
| version | int | Optimistic concurrency. |
| archived_at | timestamptz nullable | UI archive only. |

Indexes: `(tenant_id,status,due_at)`, `(tenant_id,owner_id,status)`, `(tenant_id,executor_type,executor_id,status)`, `(tenant_id,category_id,created_at)`, `(tenant_id,parent_task_id)`, and full-text index on task number/title/description.

#### Supporting core tables

- `od_task_participants(task_id, role, subject_type, subject_id, notification_level)` with uniqueness by role/subject.
- `od_task_locations(id, task_id, is_primary, location_type, entity_type, entity_id, display_snapshot, address, latitude, longitude, radius_meters)`.
- `od_task_entity_links(id, task_id, entity_type, entity_id, relation_type, display_snapshot, source_module)`.
- `od_task_tags(task_id, tag_id)` and `od_tags`.
- `od_task_checklist_items(id, task_id, position, title, description, is_required, status, assignee_type/id, due_at, weight, depends_on_item_id, completed_at/by, version)`.
- `od_task_custom_field_values(task_id, field_definition_id, value_json, definition_snapshot)`.
- `od_task_dependencies(task_id, depends_on_task_id, dependency_type, is_hard)`; reject cycles.
- `od_task_comments(id, task_id, author_id, body, parent_comment_id, created_at, edited_at, deleted_at)`; soft-delete content while preserving audit.
- `od_task_updates(id, task_id, author_id, progress_percent, note, work_started_at, work_ended_at, created_at)`.

### 9.2 Workflow tables

- `od_approval_instances(id, task_id, approval_type, stage_no, approver_type/id, status, requested_at, decided_at, decision_by, comment, version)` where `approval_type` includes ACTIVATION and EXTENSION.
- `od_verification_instances(id, task_id, submission_round, stage_no, verifier_type/id, status, decision, comment, decided_at)`.
- `od_rework_items(id, task_id, submission_round, title, instruction, status, due_at, raised_by, resolved_at/by)`.
- `od_task_holds(id, task_id, reason_code, details, held_at/by, review_at, resumed_at/by, resume_note)`.
- `od_task_issues(id, task_id, type, severity, is_blocking, title, details, owner_id, status, due_at, resolution, resolved_at/by, confirmed_at/by)`.
- `od_due_date_changes(id, task_id, old_due_at, requested_due_at, approved_due_at, reason, impact, status, requested_by, decided_by, decided_at)`.
- `od_status_history(id, task_id, from_status, to_status, action, actor_id, reason, metadata_json, occurred_at)`.

### 9.3 Evidence and files

- `od_evidence_rules(id, task_id, checklist_item_id nullable, type, timing, min_count, is_required, geo_required, allowed_mime_types, max_size_bytes, config_json)`.
- `od_evidence(id, task_id, rule_id, checklist_item_id, submission_round, file_id nullable, evidence_type, note, captured_at, uploaded_by, latitude, longitude, accuracy_meters, metadata_json, processing_status)`.
- Use a shared secure file service table/object store; store opaque file IDs, checksums, MIME type, size, malware-scan state, and access policy. Do not expose storage paths.
- Evidence cannot satisfy a rule until upload completes and scan state is `READY`.

### 9.4 Resources and recurrence

- `od_resource_requirements(id, task_id, resource_type, resource_entity_type/id, description, requested_qty, unit, integration_module, integration_reference_id, status, fulfilled_qty, metadata_json)`.
- `od_resource_usage(id, task_id, requirement_id nullable, quantity, unit, usage_type, recorded_by, recorded_at, source_reference_id)`.
- `od_recurrence_series(id, tenant_id, template_snapshot, rrule_json, timezone, generation_lead_minutes, starts_at, ends_at, max_occurrences, owner_id, status, last_generated_at, next_occurrence_at, version)`.
- `od_notification_deliveries` stores event, recipient, channel, state, dedupe key, attempts, and timestamps.
- `od_audit_events` is append-only and contains actor, action, object, request ID, IP/device context where lawful, before/after diff with sensitive-field redaction, and timestamp.

### 9.5 Category/custom-field metadata

- `od_categories(id, tenant_id, parent_id, code, name, active, sort_order)`.
- `od_templates` and `od_template_versions`; published versions immutable.
- `od_custom_field_definitions(id, template_version_id, key, label, data_type, required, config_json, visibility_condition_json, validation_json, position)`.
- Supported Phase 1 field types: short text, long text, integer, decimal, boolean, date, datetime, single select, multi-select, measurement (value/unit), user, vendor, ERP entity, and URL.

Avoid an unrestricted “everything in JSON” task record. JSON is acceptable for immutable snapshots and type-specific metadata; fields used in permissions, joins, transitions, filters, reporting, or integrity checks must be normalized.

---

## 10. Permissions and security

### 10.1 Permission keys

Use module-scoped permissions rather than page-only access:

- `task.view_own`, `task.view_department`, `task.view_all`
- `task.create`, `task.create_on_behalf`
- `task.edit_draft`, `task.edit_active`, `task.change_due_date`
- `task.assign`, `task.reassign`, `task.pick_department_queue`
- `task.execute`, `task.collaborate`
- `task.approve`, `task.verify`, `task.close`, `task.cancel`
- `task.manage_templates`, `task.manage_categories`, `task.manage_settings`
- `task.export`, `task.view_audit`, `task.admin_correct`

Existing `module_access: on-demand-task` controls navigation only; API authorization must enforce the granular permission plus row scope and task role.

### 10.2 Role baseline

| Action | Admin | Manager/dispatcher | Creator/requester | Owner/executor | Approver | Verifier | Observer |
|---|---:|---:|---:|---:|---:|---:|---:|
| Create | ✓ | ✓ | If granted | — | — | — | — |
| View | ✓ | Scope | Own/created | Assigned | Assigned stage | Assigned stage | Explicit |
| Edit draft | ✓ | Scope | Created | If shared | — | — | — |
| Assign/reassign | ✓ | Scope | If granted | No | No | No | No |
| Execute/update | ✓* | Oversight* | Comment | ✓ | Comment | Comment | No |
| Approve | If assigned/policy | If assigned | No self-approval by policy | No | ✓ | No | No |
| Verify/rework | If assigned/policy | If assigned | No | No | No | ✓ | No |
| Close/cancel | ✓ | Scope/policy | No | No | No | Policy | No |
| Audit/export | ✓ | Scope/grant | Limited | Limited | Limited | Limited | No |

`*` Administrative override actions must require reason and create a prominent audit event.

### 10.3 Field and row security

- Tenant scope is mandatory on every read/write query.
- Department managers see configured departments and descendant units only.
- Entity access rules apply to land/site/vendor/document links; having task access must not automatically reveal a restricted linked record.
- Vendor contacts see only explicitly shared tasks and fields; hide internal comments, cost, audit context, and unrelated participants.
- Separate internal comments from vendor-visible updates if vendor portal support is enabled.
- Mask sensitive employee/vendor contact details unless the viewer already has master-data access.
- File download uses short-lived authorized URLs.
- Sanitize rich text, validate MIME by content, virus scan uploads, rate limit mutation and upload endpoints, and log exports.

### 10.4 Segregation of duties

Template/policy options:

- requester/creator cannot approve;
- executor/owner cannot verify;
- verifier cannot be reassigned by the executor;
- critical cancellation requires manager or admin;
- cost/resource-bearing task may require approval before assignment.

Check segregation again at action time; participant changes after submission must not bypass policy.

---

## 11. API contract

Base: `/api/v1/on-demand-tasks`. JSON uses `snake_case`, ISO-8601 datetimes with offsets, UUID IDs, and stable error codes. List endpoints are cursor-paginated. All responses include `request_id`; mutable resources include `version`/`etag`.

### 11.1 Read endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/tasks` | Filtered task list; returns compact task summaries and facets. |
| GET | `/tasks/{id}` | Full task detail, permissions, guards, allowed actions. |
| GET | `/tasks/{id}/activity` | Cursor-paginated audit/activity timeline. |
| GET | `/tasks/{id}/evidence` | Evidence grouped by rule and submission round. |
| GET | `/inbox` | Current user's actionable items. |
| GET | `/dashboard` | Permission-scoped KPI counts and trends. |
| GET | `/templates` | Active templates user may use. |
| GET | `/metadata` | Types, categories, priorities, reason codes, settings. |
| GET | `/entity-search` | Authorized cross-module entity lookup by type/query. |

Task list filters: `q`, `status[]`, `priority[]`, `category_id[]`, `task_type[]`, `owner_id`, `executor_type`, `executor_id`, `requester_id`, `location_type`, `entity_type`, `entity_id`, `due_from`, `due_to`, `created_from`, `created_to`, `is_overdue`, `is_blocked`, `next_actor_me`, `series_id`, `sort`, `cursor`, `limit` (max 100).

### 11.2 Create/update endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/tasks` | Create draft or activate using `intent: save_draft|submit`. Idempotency key required. |
| PATCH | `/tasks/{id}` | Edit permitted fields; `If-Match` required. |
| POST | `/tasks/{id}/clone` | New draft from authorized snapshot; never copies activity/evidence decisions. |
| POST | `/tasks/{id}/participants` | Add/change roles with policy validation. |
| POST | `/tasks/{id}/comments` | Comment and mentions. |
| POST | `/tasks/{id}/updates` | Progress/work update. |
| POST | `/tasks/{id}/checklist/{itemId}/complete` | Complete/uncomplete with version and evidence guards. |
| POST | `/tasks/{id}/issues` | Raise issue. |
| POST | `/tasks/{id}/issues/{issueId}/resolve` | Resolve with note/evidence. |
| POST | `/tasks/{id}/extension-requests` | Request due-date change. |
| POST | `/tasks/{id}/evidence/uploads` | Initialize upload and return upload token/URL. |
| POST | `/tasks/{id}/evidence` | Finalize uploaded file metadata against an evidence rule. |
| DELETE | `/tasks/{id}/evidence/{evidenceId}` | Only before submission and if actor owns upload/has override; audit it. |

### 11.3 Transition endpoint

Use one command endpoint with action-specific payload schemas:

`POST /tasks/{id}/actions`

```json
{
  "action": "SUBMIT_COMPLETION",
  "version": 12,
  "idempotency_key": "01J...",
  "payload": {
    "completion_note": "Fencing repaired and inspected.",
    "completed_quantity": 120,
    "unit": "metre"
  }
}
```

Allowed action values: `SUBMIT_FOR_APPROVAL`, `APPROVE`, `REQUEST_CHANGES`, `REJECT`, `ASSIGN`, `REASSIGN`, `ACCEPT`, `DECLINE`, `START`, `HOLD`, `RESUME`, `SUBMIT_COMPLETION`, `BEGIN_VERIFICATION`, `REQUEST_REWORK`, `VERIFY`, `CLOSE`, `CANCEL`.

The task detail response includes:

```json
{
  "data": { "id": "...", "task_number": "ODT-2026-000125", "status": "IN_PROGRESS", "version": 12 },
  "computed": {
    "is_overdue": false,
    "is_blocked": true,
    "progress_percent": 62.5,
    "next_actor": { "type": "USER", "id": "...", "label": "Rahul Sharma" }
  },
  "allowed_actions": [
    { "action": "HOLD", "requires": ["reason_code", "details", "review_at"] },
    { "action": "SUBMIT_COMPLETION", "enabled": false, "blocking_reasons": ["EVIDENCE_AFTER_PHOTO_MISSING", "CHECKLIST_REQUIRED_INCOMPLETE"] }
  ]
}
```

### 11.4 Templates/settings endpoints

- `POST /templates`, `POST /templates/{id}/versions`, `POST /templates/{id}/versions/{version}/publish`, `POST /templates/{id}/archive`.
- `GET/POST/PATCH /categories` with archive operation.
- `GET/PATCH /settings` for reason codes, escalation defaults, file limits, closure default, and numbering.
- Published template versions cannot be edited; create a new version.

### 11.5 Error model

```json
{
  "error": {
    "code": "TASK_TRANSITION_BLOCKED",
    "message": "This task cannot be submitted yet.",
    "field_errors": {
      "evidence_rules.after_photo": ["At least 2 photos are required."]
    },
    "blocking_reasons": [
      { "code": "CHECKLIST_REQUIRED_INCOMPLETE", "item_id": "...", "label": "Upload delivery challan" }
    ],
    "request_id": "req_..."
  }
}
```

Use: `400 INVALID_REQUEST`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 TASK_NOT_FOUND` (also for hidden records), `409 TASK_VERSION_CONFLICT` / `INVALID_STATE_TRANSITION`, `422 VALIDATION_FAILED` / `TASK_TRANSITION_BLOCKED`, `429 RATE_LIMITED`, and `503 INTEGRATION_UNAVAILABLE`.

### 11.6 Events and integrations

Publish transactional-outbox events after commit:

- `task.created`, `task.submitted_for_approval`, `task.approved`, `task.assigned`, `task.accepted`, `task.started`, `task.held`, `task.resumed`, `task.issue_raised`, `task.overdue`, `task.completion_submitted`, `task.rework_requested`, `task.verified`, `task.closed`, `task.cancelled`, `task.resource_changed`.

Consumers must be idempotent. The owning module remains source of truth for inventory, purchase, vehicle, work order, and document status. Task service stores reference ID plus last-known display/status snapshot and refresh timestamp.

---

## 12. Validation rules

### 12.1 Draft vs activation

Draft save requires only a valid creator and tenant; validate formats for any fields provided. Activation requires:

- title, type, active category, requester;
- valid owner and executor (or an approved department queue rule);
- due datetime and valid timezone;
- due after planned start; neither violates template date bounds;
- vendor tasks have an internal coordinator;
- all required template custom fields and location/entity types;
- at least one valid approver/verifier where required;
- no segregation-of-duty conflict;
- no dependency cycle or self-dependency;
- resource quantities positive and units compatible;
- recurrence rule produces at least one bounded occurrence;
- all referenced users/entities are active and accessible.

### 12.2 Field rules

- Trim input; reject whitespace-only titles/descriptions.
- Title 3–160 characters; description/outcome max configurable, default 10,000.
- Priority `CRITICAL` requires a reason of at least 10 characters.
- Progress is 0–100; cannot decrease without reason and override permission. Checklist-derived progress is read-only.
- Quantities are greater than zero, use decimal precision defined by unit, and are stored as decimal—not float.
- Latitude −90..90, longitude −180..180, radius > 0.
- Checklist maximum Phase 1: 200 items; title max 200; dependencies must be acyclic.
- Participant duplicates are collapsed; one person may have multiple distinct task roles only when policy allows.
- A due date in the past may be allowed only with explicit permission/reason; never silently normalize it.

### 12.3 Completion guards

Submitting completion fails if any apply:

- required checklist item incomplete;
- incomplete hard child task or dependency;
- unresolved blocking issue;
- task is on hold;
- required evidence count/type/geo/processing state not satisfied;
- required completion measurement absent or outside tolerance without exception approval;
- required resource usage/return acknowledgement absent;
- current actor lacks execution role;
- task version is stale.

Verification fails if required verifier checklist/evidence/decision fields are missing. Closure fails if verification is pending, rework is open, a blocking integration cleanup is pending, or the actor lacks permission.

### 12.4 Files

- Configurable defaults: images 15 MB, video 100 MB, documents 25 MB; overall task quota configurable.
- Allow-list MIME types and verify by file signature.
- Strip executable content and dangerous metadata as appropriate; scan malware.
- Store original checksum to detect accidental duplicate upload and provide user choice.
- Preserve original capture metadata separately; do not trust client EXIF/GPS as proof without marking its trust level.

---

## 13. Notifications, reminders, and escalation

Notification channels: in-app mandatory; push/email/SMS/WhatsApp only if configured and consented. Users may tune informational channels but not mandatory approval, critical, or security alerts.

Default triggers:

| Event | Recipient |
|---|---|
| Assigned/reassigned | Owner, executor, coordinator |
| Approval requested/changed | Current approver, requester on decision |
| Due soon | Owner/executor |
| Overdue | Owner/executor; then escalation chain |
| Hold/blocking issue | Owner, issue owner, manager by severity |
| Mention/comment | Mentioned users / subscribed participants |
| Completion submitted | Verifier |
| Rework requested | Owner/executor/requester |
| Verified/closed/cancelled | Requester, owner, selected observers |

Default escalation policy can be overridden by template:

- reminder one day before due and on due date;
- overdue immediately to owner/executor;
- +1 day to reporting manager;
- +3 days to department head;
- +5 days to configured management recipient;
- critical tasks use shorter configurable durations.

Dedupe notifications by `(event_id, recipient_id, channel)`. Use an outbox and retries with dead-letter visibility. Quiet hours delay ordinary reminders but not critical alerts. Escalation pauses only if the hold reason policy says so; show the pause rule on the task.

---

## 14. Edge cases and required behavior

| Case | Required behavior |
|---|---|
| User opens stale task and another actor changes it | Reject mutation with 409, show what changed, refresh without discarding the user's typed note. |
| Assignee becomes inactive | Keep historical identity; active task appears in needs-reassignment queue; block accept/start by inactive account. |
| Vendor is archived | Existing task remains visible; block new assignment; alert owner to reassign active unaccepted work. |
| Linked land/site/entity is archived | Preserve display snapshot and link state; prevent silent loss; allow authorized task completion where policy permits. |
| Linked record access is revoked | Show “Restricted record,” not sensitive cached data; task remains accessible according to its own scope. |
| Dependency is cancelled | Mark dependency exception and require manager decision to replace, waive, or cancel dependent task. |
| Dependency cycle attempted | Reject atomically with cycle path. |
| Due date changes while approval pending | Recalculate approval only if policy fields changed; otherwise audit the edit and notify approver. |
| Duplicate submit/click or network retry | Idempotency key returns same result, no duplicate event/evidence/notification. |
| Mandatory upload is still processing | Keep submit disabled/server-blocked and show processing status with retry. |
| Upload succeeds but finalize call fails | Reconcile orphan upload via token; do not require re-upload if checksum matches. |
| GPS denied or inaccurate | Explain requirement; allow exception request only if template policy permits, with reason and approver. |
| Task is overdue while on hold | Show both On Hold and overdue duration; escalation follows configured hold policy. |
| Rework requested multiple times | Keep every submission/evidence/decision round; current round is prominent. |
| Owner is also verifier after reassignment | Re-evaluate segregation; require new verifier before submission. |
| Resource reservation fails | Task may save draft; activation or start is blocked only when resource is marked hard-required. |
| Cancellation after stock issue/vehicle booking | Initiate owning-module release, show pending cleanup, and retain references. |
| Recurrence falls on invalid local time/DST | Server applies documented timezone policy and stores resolved timestamp. |
| Series template/assignee changes | Apply only to future unstarted instances after explicit user selection. |
| Child task closes after parent submitted | Re-evaluate parent guard; do not auto-submit unless policy explicitly permits. |
| User lacks permission for one linked entity in multi-location task | Return only permitted display data or deny task per configured row-security rule; never partially leak. |
| Task number generation races | Database-backed sequence/unique constraint; retry generation server-side. |
| Search/filter has no result | Preserve filters, show clear-filters action; do not show generic creation prompt to users without create permission. |
| Very large task history | Cursor pagination and virtualized timeline; initial detail returns recent summary only. |
| Legacy malformed task | Render in compatibility mode, label missing data, permit controlled migration—not client-side guessing. |

---

## 15. Reporting and audit

Operational metrics:

- active, due soon, overdue, blocked, on hold, rework, and unassigned counts;
- created vs closed over time;
- median acceptance, start, execution, verification, and total cycle time;
- SLA completion rate, overdue aging buckets, reopen/corrective rate;
- workload by employee/team/department/vendor;
- category, task type, site/land, requester, and template performance;
- rework rate and verification turnaround;
- resource request/fulfillment delays.

Reports must distinguish active duration from hold duration and show both. Permissions apply to aggregates; suppress/drill-down protect small restricted groups. Export is asynchronous for large datasets, permission-checked, time-limited, and audited.

Audit requirements:

- Append-only actor/action/time/object trail.
- Before/after diffs for meaningful edits, with sensitive-value redaction.
- Capture delegated/admin override and reason.
- Retain task status, approval, verification, rework, due-date, participant, evidence, resource-link, export, and permission-sensitive view events according to retention policy.
- UI “Activity” is human-readable; privileged “Audit” exposes request IDs and precise diffs.

---

## 16. Current-system integration and migration plan

The existing `src/pages/OnDemandTask.tsx` is a 2,000+ line page combining task creation, step rendering, task listing, on-field scheduling, inventory allocation, and API calls. It currently integrates with:

- `/admin_all_task/get_all_ondemand_tasks`
- `/admin_ops_requests/create_on_demand_tasks`
- inventory item, vehicle, farm/farmer, staff, cultivation activity, vendor scope, plot, and calendar endpoints;
- a separate on-demand allocation schema flow.

### 16.1 Preserve

- Existing staff/designation lookup and module access navigation.
- Farm/land, plot, cultivation calendar, vendor scope, inventory item, and vehicle selectors.
- Plot scheduling logic as a cultivation template helper, not core task logic.
- Configurable inspection fields, migrated to template custom fields/evidence rules.
- Inventory allocation as a linked resource workflow.

### 16.2 Change

- Split task lifecycle from allocation. Keep “Allocation” as a resource sub-workflow or separate route, not a peer meaning of task.
- Replace the large create modal with route-based create/edit pages.
- Replace `steps_dict` as the canonical model. Migrate meaningful items into checklist items, custom fields, resource requirements, and entity links.
- Replace client-built status payloads with the server transition command.
- Remove mock fallback records in production paths; display an actionable integration error instead.
- Move API calls to a typed task service and React Query hooks; keep presentation components free of direct `fetch`.
- Centralize Zod request/response schemas and enum mapping.
- Add a task detail route; the current summary cards are insufficient for execution, verification, and audit.

### 16.3 Suggested frontend structure

```text
src/features/on-demand-tasks/
  api/taskApi.ts
  api/taskSchemas.ts
  hooks/useTasks.ts
  hooks/useTask.ts
  hooks/useTaskActions.ts
  pages/TaskWorkspacePage.tsx
  pages/TaskCreatePage.tsx
  pages/TaskDetailPage.tsx
  pages/TaskInboxPage.tsx
  pages/TaskTemplatesPage.tsx
  components/TaskTable.tsx
  components/TaskFilters.tsx
  components/TaskHeader.tsx
  components/TaskActionBar.tsx
  components/TaskForm/*
  components/Checklist/*
  components/Evidence/*
  components/ActivityTimeline.tsx
  domain/taskTypes.ts
  domain/taskGuards.ts
  domain/taskFormatters.ts
```

Server state belongs in React Query. Short-lived unsaved form state belongs in React Hook Form. Do not mirror fetched task objects into many independent `useState` variables.

### 16.4 Legacy compatibility

1. Add v1 APIs and new tables without removing legacy endpoints.
2. Build an idempotent migration that maps each legacy task to a new task and stores `legacy_task_id`.
3. Map `steps_dict`:
   - inventory → resource requirements;
   - logistics → vehicle resource links;
   - inspection → checklist/custom field definitions snapshot;
   - cultivation/on_field → location/entity links plus custom data/checklist;
   - others → checklist item or description.
4. Records without a reliable owner/due date enter a visible `MIGRATION_REVIEW` flag while retaining their closest valid lifecycle status.
5. Run dual-read comparison in staging, then switch UI reads to v1.
6. Optionally dual-write only through a server adapter during cutover; never maintain duplicate write logic in the client.
7. After reconciliation and a defined rollback window, make legacy UI read-only, then retire endpoints.

---

## 17. Implementation phases

### Phase 1 — Reliable core

- Schema, typed API, number generation, task CRUD/drafts.
- Workspace table and filters, create page, task detail.
- Individual/department/vendor assignment with internal owner.
- Lifecycle through close, including approval, hold, issues, verification, rework.
- Checklist, attachments/evidence, comments, activity/audit.
- Due reminders and basic escalation.
- Existing staff/land/vendor/inventory/vehicle entity linking.
- Permission enforcement and migration compatibility.

### Phase 2 — Scale and reuse

- Template/category administration and custom fields.
- Recurrence, board/calendar, saved views, dashboards, exports.
- Resource reservation/issue/return integration.
- Multi-stage approval/verification policies and extension workflow.
- Mobile upload queue and richer push notifications.

### Phase 3 — Optimization

- Workload-aware assignment suggestions.
- Advanced SLA calendars/holidays, analytics, bulk orchestration.
- Vendor self-service, customer/landowner acknowledgement, offline field mode.
- Rule-based task creation from ERP events.

---

## 18. Acceptance criteria

### 18.1 Generic creation

- Given a permitted user, when they create a locationless office follow-up task with title, category, owner, executor, and due date, then it activates without requiring cultivation fields.
- Given a land-inspection template, when selected, then land/plot, inspection fields, photo evidence, and verifier requirements appear from the template snapshot.
- Given a vendor executor, activation is blocked until an active internal coordinator/owner is selected.
- A draft can be saved with incomplete activation fields and reopened without data loss.
- Refreshing or using browser back does not silently discard an autosaved draft.

### 18.2 Lifecycle

- Only actions returned as allowed by the server are operable; calling a forbidden transition directly returns 403/409 without state change.
- Accept records actor and time; Start records actual start once.
- Hold requires reason/details/review date and Resume retains the complete hold interval.
- Overdue is displayed as a derived flag without replacing the current lifecycle status.
- Declining assignment requires a reason and routes the task to the configured dispatcher/owner.
- Cancellation requires reason, releases eligible reservations, retains all history, and prevents further execution updates.

### 18.3 Checklist, evidence, and completion

- A required checklist item cannot be bypassed by setting progress to 100%.
- Completion submission is blocked until mandatory evidence is uploaded, scanned, and linked to the correct rule.
- A failed/queued upload is visibly unsatisfied and retryable.
- Checklist-derived progress is deterministic and consistent on list and detail screens.
- Hard dependencies and blocking issues prevent completion; non-blocking issues do not unless configured.

### 18.4 Approval, verification, and rework

- Pre-approval tasks cannot be accepted or started before all required approval stages complete.
- Self-approval/self-verification is blocked when segregation policy requires independence.
- Request changes/reject/rework require reasons and notify the correct next actor.
- Each rework cycle retains its original submission, evidence, deficiencies, decisions, and timestamps.
- Closure is blocked until required verification succeeds and all rework items are resolved.

### 18.5 Permissions and security

- A user with only `task.view_own` cannot list or fetch unrelated tasks by changing URL/ID.
- Navigation access alone does not authorize API actions.
- Restricted related entities do not leak names/details through task payloads, search, exports, notifications, or audit UI.
- Vendor-visible responses exclude internal-only comments and fields.
- File downloads require current authorization and expire.
- Every override, reassignment, due-date change, evidence deletion, export, and transition is audited.

### 18.6 Concurrency and resilience

- Two users editing version N cannot both overwrite it; the second mutation receives 409 with current version.
- Retrying the same create/action request with one idempotency key creates one task/event only.
- A notification failure does not roll back a committed task transition; the outbox retries it.
- An unavailable optional integration allows draft save and shows a clear degraded-state message.
- An unavailable hard-required resource integration blocks the relevant transition with a stable error code.

### 18.7 Recurrence and dates

- Every recurrence produces independent auditable task instances linked by `series_id`.
- Changing a series does not modify completed/active instances without explicit supported action.
- Date display respects user timezone while API/database timestamps remain unambiguous.
- Due-date extension preserves original/current dates and decision history.

### 18.8 UX and accessibility

- All primary flows work at 360px mobile width and desktop without horizontal page scrolling; data tables may use an intentional scroll container.
- All controls are keyboard reachable, focus order is logical, and dialogs manage focus correctly.
- Status/priority/validation do not rely on color alone.
- Validation summary links focus the invalid field; server errors are preserved until corrected.
- Loading, empty, permission-denied, degraded integration, and retry states exist for every primary screen.

### 18.9 Performance targets

- Task list API p95 under 500 ms for 50 rows under expected production load, excluding network latency.
- Task detail API p95 under 700 ms without loading the full audit history or file binaries.
- Initial workspace UI is usable within 2.5 seconds on a typical business connection after assets are cached.
- Search input is debounced; list requests cancel/ignore stale responses.
- Audit and comments use cursor pagination; large lists/timelines do not render unbounded DOM nodes.

### 18.10 Definition of done

- Database migrations, rollback strategy, API schema, seed metadata, and permission seeds are reviewed.
- Unit tests cover transition matrix, guards, permission scope, recurrence math, and template snapshot behavior.
- Integration tests cover create→assign→execute→verify→close, approval, rework, cancellation cleanup, idempotency, and concurrency.
- UI tests cover blank/template creation, filters, actions, mandatory evidence, server validation, mobile layout, and accessibility smoke checks.
- Migration dry-run reports counts, unmapped fields, duplicates, invalid owners/dates, and reconciliation results.
- Production paths contain no mock fallbacks.
- Logs, metrics, error alerts, outbox monitoring, and audit retention are configured.
- Product owner accepts the scenarios below.

---

## 19. Mandatory end-to-end test scenarios

1. Locationless monthly MIS document task, individual executor, no approval, document evidence, manager verification.
2. Fertilizer application across selected plots, inventory requirement, labour/quantity recording, geo photos, field-manager verification.
3. Borewell repair by vendor, internal coordinator, asset and land links, spare-part request, hold for parts, rework after failed verification.
4. Material delivery from warehouse to site, department queue, vehicle link, challan and quantity evidence, shortage issue.
5. Procurement follow-up linked to PR/vendor, recurring follow-up, commitment date custom field, completion acknowledgement.
6. Critical safety corrective task with pre-approval, independent verifier, accelerated escalation, cancellation restriction.
7. Concurrent edit and duplicate network retry proving version conflict and idempotency.
8. Permission test proving own-task user, department manager, admin, and vendor each receive different valid data/actions.
9. Legacy `steps_dict` task migrated with inventory, logistics, inspection, and on-field data and reconciled against the source.

---

## 20. Product decisions that must remain explicit

These defaults are part of this specification and should not be silently changed during implementation:

- One task has one accountable internal owner.
- `Overdue` and `Blocked` are computed flags, not lifecycle statuses.
- Template versions are immutable snapshots for existing tasks.
- A checklist item is not a substitute for a child task with separate accountability.
- Vendor work always has an internal coordinator/owner.
- Related ERP modules remain source of truth for their records and approvals.
- The server owns permissions, allowed actions, state transitions, completion guards, and recurrence generation.
- Closed/cancelled tasks and audit history are never hard-deleted through ordinary product actions.
- Core generic task storage is normalized; template-specific values may use validated JSON snapshots.


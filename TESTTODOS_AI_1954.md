# Test TODOs — AI-1954 Plan Mode

Coverage analysis of new/changed code in `ai-1954-clean-up-plan-mode-implementation`.

**Branch stats:** 41 files changed, +2787 / -366 lines

## Coverage Summary (from `jest --coverage --changedSince=master`)

| File | Stmts | Branch | Funcs | Lines |
|------|------:|-------:|------:|------:|
| **planner.agent.ts** | 40% | 6% | 50% | 38% |
| **submit-questions.tool.ts** | 27% | 0% | 0% | 28% |
| **plan-helpers.ts** | 5% | 0% | 0% | 6% |
| **planner.prompt.ts** | 56% | 100% | 17% | 59% |
| **discovery.prompt.ts** | 82% | 0% | 33% | 82% |
| **stream-processor.ts** | 73% | 65% | 91% | 74% |
| **subgraph-helpers.ts** | 22% | 17% | 63% | 21% |
| **discovery.subgraph.ts** | 33% | 1% | 34% | 33% |
| **builder.subgraph.ts** | 42% | 8% | 37% | 43% |
| **multi-agent-workflow-subgraphs.ts** | 28% | 3% | 10% | 28% |
| **session-manager.service.ts** | 81% | 68% | 64% | 81% |
| **responder.agent.ts** | 21% | 0% | 20% | 22% |
| **Frontend (all plan components)** | **0%** | **0%** | **0%** | **0%** |

---

## Backend — `packages/@n8n/ai-workflow-builder.ee/`

### P0: Critical (pure functions, easy to unit test, high impact)

#### 1. `src/utils/plan-helpers.ts` — **0% covered**
**File:** `src/utils/test/plan-helpers.test.ts` (new)

Test `formatPlanAsText()`:
- [ ] Basic plan with summary, trigger, steps → formatted text
- [ ] Steps with subSteps → indented bullet points
- [ ] Steps with suggestedNodes → "Suggested nodes: ..." line
- [ ] Plan with additionalSpecs → "Additional specs" section
- [ ] Plan with empty additionalSpecs array → no additional specs section
- [ ] Minimal plan (1 step, no optional fields) → clean output

#### 2. `src/tools/submit-questions.tool.ts` — **0% function coverage**
**File:** `src/tools/test/submit-questions.tool.test.ts` (new)

Test `formatAnswersForDiscovery()` (exported or test the internal logic):
- [ ] Array format answers → "User provided these clarifications: ..." text
- [ ] Array format with skipped answers → skipped ones filtered out
- [ ] Array format with selectedOptions + customText → both joined
- [ ] Array format with empty selectedOptions and no customText → "(no answer)"
- [ ] Record format answers → mapped by question id
- [ ] Record format with array values → joined with comma
- [ ] Record format with missing answer for a question → filtered out
- [ ] Invalid/unparseable resume value → fallback "could not be parsed" message
- [ ] Schema validation: `plannerQuestionSchema` rejects invalid input
- [ ] Schema validation: `submitQuestionsInputSchema` enforces min 1, max 5 questions

#### 3. `src/agents/planner.agent.ts` — **6% branch coverage**
**File:** `src/agents/test/planner.agent.test.ts` (new)

Test `parsePlanDecision()`:
- [ ] `{ action: 'approve' }` → returns approve
- [ ] `{ action: 'reject' }` → returns reject
- [ ] `{ action: 'modify', feedback: 'change X' }` → returns modify with feedback
- [ ] `{ action: 'modify' }` without feedback → returns modify, no feedback
- [ ] `{ action: 'invalid' }` → defaults to reject with error feedback
- [ ] `null` input → defaults to reject
- [ ] Non-object input → defaults to reject

Test `plannerOutputSchema`:
- [ ] Valid plan object passes validation
- [ ] Missing required fields (summary, trigger, steps) fails
- [ ] Empty steps array fails (`.min(1)`)
- [ ] Steps with optional subSteps and suggestedNodes passes

Test `createPlannerAgent()`:
- [ ] Creates agent with correct system prompt
- [ ] Detects `get_documentation` tool for conditional prompt section
- [ ] Works with no tools (empty array)

Test `invokePlannerNode()`:
- [ ] Approve decision → returns `{ planDecision: 'approve', planOutput, mode: 'build' }`
- [ ] Reject decision → returns `{ planDecision: 'reject', planOutput: null }`
- [ ] Modify decision → returns `{ planDecision: 'modify', planFeedback, planPrevious, messages }`
- [ ] Invalid LLM output → throws "Planner produced invalid output"
- [ ] Context building includes all fields (userRequest, discoveryContext, workflowJSON)
- [ ] Context building includes planPrevious/planFeedback when provided

### P1: High (plan mode in stream processor — gap in existing test suite)

#### 4. `src/utils/stream-processor.ts` — **0% plan mode coverage**
**File:** `src/utils/test/stream-processor.test.ts` (extend existing)

Add plan mode interrupt tests:
- [ ] Questions interrupt → emits `QuestionsChunk` with questions array and introMessage
- [ ] Plan interrupt → emits `PlanChunk` with plan object
- [ ] `extractInterruptPayload` with valid `__interrupt__` array → extracts value and id
- [ ] `extractInterruptPayload` with missing/empty `__interrupt__` → returns null
- [ ] `extractInterruptPayload` with invalid nested value → returns null
- [ ] `isQuestionsInterruptValue` type guard → true for questions, false for plan
- [ ] `isPlanInterruptValue` type guard → true for plan, false for questions
- [ ] `processInterrupt` for questions → correct StreamOutput shape
- [ ] `processInterrupt` for plan → correct StreamOutput shape
- [ ] Interrupt id propagation → interruptId included in output when present
- [ ] Deduplicate interrupt events (same interrupt only emitted once)

#### 5. `src/utils/subgraph-helpers.ts` — **17% branch, missing `executeSubgraphTools`**
**File:** `src/utils/test/subgraph-helpers.test.ts` (extend existing)

Add tests for `executeSubgraphTools`:
- [ ] Executes tool calls from last AI message → returns ToolMessages
- [ ] No tool calls → returns empty object
- [ ] Non-AI last message → returns empty object
- [ ] Tool not found → returns "Tool not found" ToolMessage
- [ ] Tool throws regular error → returns "Tool failed" ToolMessage
- [ ] Tool throws GraphInterrupt → re-throws (does NOT catch)
- [ ] Command result → extracts messages, operations, templateIds, bestPractices
- [ ] Multiple tool calls → executes in parallel

### P2: Medium (prompt builders — verify structure)

#### 6. `src/prompts/agents/planner.prompt.ts` — **17% function coverage**
**File:** `src/prompts/agents/planner.prompt.test.ts` (new)

Test `buildPlannerPrompt()`:
- [ ] Default (no options) → contains role, goal, rules, output_format sections
- [ ] `hasDocumentationTool: true` → includes best_practices_tool section
- [ ] `hasDocumentationTool: false` → does NOT include best_practices_tool section

Test `buildPlannerContext()`:
- [ ] Includes user_request section
- [ ] Includes discovery_context when nodes found
- [ ] Omits discovery_context when no nodes found
- [ ] Includes existing_workflow_summary when workflow has nodes
- [ ] Omits existing_workflow_summary for empty workflow
- [ ] Includes previous_plan when planPrevious provided
- [ ] Includes user_feedback when planFeedback provided
- [ ] Omits previous_plan and user_feedback when null

#### 7. `src/prompts/agents/discovery.prompt.ts` — **33% function coverage**
**File:** `src/prompts/agents/discovery.prompt.test.ts` (new)

Test `buildDiscoveryPrompt()`:
- [ ] Default → contains role, goal, process, rules sections
- [ ] `hasTemplatesTool: true` → includes template section
- [ ] `hasDocumentationTool: true` → includes documentation section
- [ ] Plan mode options → includes plan-specific instructions

Test `buildDiscoveryContext()`:
- [ ] Includes user request
- [ ] Includes plan context when provided
- [ ] Includes previous discovery results when provided

### P3: Lower Priority (complex to test, integration-level)

#### 8. `src/session-manager.service.ts` — **TTL map untested**
**File:** `src/test/session-manager.service.test.ts` (extend existing)

- [ ] `pendingHitlByThreadId` TTL eviction after 1 day
- [ ] `pendingHitlByThreadId.get()` returns null for expired entries
- [ ] `pendingHitlByThreadId.set()` evicts old entries lazily

#### 9. `src/multi-agent-workflow-subgraphs.ts` — **3% branch coverage**
**File:** Not recommended for unit testing (orchestration logic, better covered by integration tests)

Key behaviors to verify via integration:
- [ ] `route_next_phase` routes to discovery when planDecision is 'modify'
- [ ] `route_next_phase` routes to builder when planDecision is 'approve'
- [ ] `route_next_phase` clears planFeedback/planPrevious on reject
- [ ] Plan state flows through parent → discovery → planner → back to parent

---

## Frontend — `packages/frontend/editor-ui/`

**Current state: ZERO plan mode tests exist.** The assistant feature area has tests for other components (`AskAssistantBuild.test.ts`, `useBuilderMessages.test.ts`, etc.) but nothing for plan mode.

### P0: Critical

#### 10. `src/features/ai/assistant/composables/useBuilderMessages.test.ts` — **Extend**
**File:** Already exists, add plan mode tests

Test `processSingleMessage` with plan mode messages:
- [ ] Questions message → creates custom message with `customType: 'questions'`
- [ ] Plan message → creates custom message with `customType: 'plan'`
- [ ] UserAnswers message → creates custom message with `customType: 'user_answers'`
- [ ] Duplicate questions message → not added twice (dedup logic)
- [ ] Duplicate plan message → not added when same plan signature
- [ ] New questions after user answer → added (new round)
- [ ] New plan after user response → added (new plan)

Test `mapAssistantMessageToUI` with plan mode:
- [ ] Maps questions message to UI format
- [ ] Maps plan message to UI format
- [ ] Maps user_answers message to UI format

Test factory functions:
- [ ] `createQuestionsUIMessage` → correct shape with questions and introMessage
- [ ] `createPlanUIMessage` → correct shape with plan data
- [ ] `createUserAnswersUIMessage` → correct shape with answers, role is 'user'
- [ ] `createUserAnswersMessage` → correct custom message shape

Test `getThinkingState` with custom messages:
- [ ] Custom message (plan/questions) counts as response → `isStillThinking: false`

### P1: High

#### 11. `src/features/ai/assistant/components/Agent/PlanQuestionsMessage.vue`
**File:** `src/features/ai/assistant/components/Agent/PlanQuestionsMessage.test.ts` (new)

- [ ] Renders intro message when provided
- [ ] Renders all questions
- [ ] Single-select: selecting option updates answer
- [ ] Multi-select: can select multiple options
- [ ] Text input: typing updates answer
- [ ] Custom "Other" input shown when `allowCustom: true`
- [ ] Submit button disabled when no answers
- [ ] Submit emits answers array
- [ ] Skipped questions have `skipped: true` in output
- [ ] Already-submitted state hides submit button

#### 12. `src/features/ai/assistant/components/Agent/PlanDisplayMessage.vue`
**File:** `src/features/ai/assistant/components/Agent/PlanDisplayMessage.test.ts` (new)

- [ ] Renders plan summary
- [ ] Renders trigger description
- [ ] Renders steps with descriptions
- [ ] Renders sub-steps when present
- [ ] Does NOT render suggestedNodes (internal)
- [ ] Renders additionalSpecs when present
- [ ] Approve button emits approve event
- [ ] Modify button emits modify event
- [ ] Reject button emits reject event
- [ ] Buttons hidden after decision made
- [ ] Loading dots animation renders

#### 13. `src/features/ai/assistant/components/Agent/UserAnswersMessage.vue`
**File:** `src/features/ai/assistant/components/Agent/UserAnswersMessage.test.ts` (new)

- [ ] Renders answered questions with responses
- [ ] Shows "(No answer)" for skipped questions (i18n key)
- [ ] Handles missing answers gracefully

#### 14. `src/features/ai/assistant/components/Agent/PlanModeSelector.vue`
**File:** `src/features/ai/assistant/components/Agent/PlanModeSelector.test.ts` (new)

- [ ] Renders build/plan mode toggle
- [ ] Emits mode change on toggle
- [ ] Shows correct state for current mode

### P2: Medium

#### 15. `src/features/ai/assistant/builder.store.ts` — **No plan mode tests**
**File:** `src/features/ai/assistant/builder.store.test.ts` (extend existing)

- [ ] `builderMode` defaults to 'build'
- [ ] `builderMode` switches to 'plan' when feature flag enabled and user toggles
- [ ] `createBuilderPayload` includes `isPlanModeEnabled` flag
- [ ] Plan interrupt handling: questions interrupt sets pending state
- [ ] Plan interrupt handling: plan interrupt sets pending state
- [ ] Resume with answers: sends correct resume payload
- [ ] Resume with plan decision: sends approve/reject/modify payload

#### 16. `src/features/ai/assistant/builder.utils.ts`
**File:** `src/features/ai/assistant/builder.utils.test.ts` (extend existing)

- [ ] `createBuilderPayload` with `isPlanModeEnabled: true` → includes planMode in payload
- [ ] `createBuilderPayload` with `isPlanModeEnabled: false` → no planMode in payload

---

## Priority Order for Implementation

1. **P0 Backend**: #1 (plan-helpers), #2 (submit-questions), #3 (planner.agent) — pure functions, easy wins
2. **P0 Frontend**: #10 (useBuilderMessages plan mode) — extend existing test file
3. **P1 Backend**: #4 (stream-processor interrupts), #5 (subgraph-helpers executeSubgraphTools)
4. **P1 Frontend**: #11 (PlanQuestionsMessage), #12 (PlanDisplayMessage), #13 (UserAnswersMessage), #14 (PlanModeSelector)
5. **P2**: #6, #7 (prompt tests), #8 (TTL), #15, #16 (store/utils extensions)
6. **P3**: #9 (integration-level orchestration)

---

## Notes

- Frontend has **zero** test files for any plan mode component
- Backend has good test infrastructure for the AI builder package (310 tests pass), but plan mode adds ~1200 lines of new untested logic
- `formatAnswersForDiscovery` in submit-questions.tool.ts is not exported — may need to export for direct testing, or test via the tool wrapper
- Stream processor has comprehensive tests (1512 lines) but zero coverage of interrupt/plan/questions events
- `executeSubgraphTools` is the most critical gap in subgraph-helpers — it has the GraphInterrupt re-throw fix that was a production bug

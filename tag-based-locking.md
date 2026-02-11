# Tab-Based Locking Analysis

## Executive Summary

**Goal:** Enable tab-based write locks so multiple tabs from the same user can independently edit workflows.

**Strategy:** Three-phase incremental implementation

### Phase 1: Basic Tab-Based Locking

- Implement clientId-based write locks (no stealing)
- If Tab A has lock, Tab B is read-only until Tab A closes or TTL expires
- Keep collaboration pane unchanged (user-based presence)
- **Outcome:** Each tab works independently, basic lock isolation

### Phase 1.5: "Acquire Editing" (Lock Stealing)

- Add atomic lock stealing for same user
- Add "Acquire editing" button to forcibly take lock from your other tab
- **Outcome:** Users can intentionally transfer lock between their tabs

### Phase 2: Enhanced Collaboration Pane

- Add tab count visibility to collaboration pane
- Show "Alice (3 tabs)" instead of just "Alice"
- **Outcome:** Users see how many tabs each person has open

### Quick Reference: What Changes When

| Feature                   | Phase 1 (Basic)        | Phase 1.5 (Stealing)           | Phase 2 (Enhanced)              |
| ------------------------- | ---------------------- | ------------------------------ | ------------------------------- |
| **Write Locks**           | ✅ ClientId-based      | ✅ Same                        | ✅ Same (no change)             |
| **Lock Stealing**         | ❌ No (wait for TTL)   | ✅ "Acquire editing" button    | ✅ Same                         |
| **Collaborator Tracking** | User-based (unchanged) | User-based (unchanged)         | ✅ ClientId-based with grouping |
| **Collaboration Pane**    | Shows "Alice"          | Shows "Alice"                  | ✅ Shows "Alice (3)"            |
| **Tab Independence**      | ✅ Yes                 | ✅ Yes                         | ✅ Yes                          |

### User Experience Timeline

```

UNCHANGED:
├─ Alice opens workflow and starts editing → Gets write lock
├─ Bob opens workflow and sees it in read-only mode, because Alice has a write lock
└─ Collaboration Pane: [Avatar: Alice, Avatar: Bob]

BEFORE (Current):
├─ Alice opens workflow in Tab A 
├─ Alice (Same user) opens workflow in Tab B and starts editing → Gets write lock
├─ Alice goes back to Tab A (stale version) and starts editing the workflow → Runs into conflicts on the first autosave (live updates do not come on this tab)
└─ Collaboration Pane: [Avatar: Alice]

AFTER PHASE 1 (Basic Tab Locking):
├─ Alice opens workflow in Tab A
├─ Alice (Same user) opens workflow in Tab B and starts editing → Gets write lock
├─ Alice goes back to Tab A → The tab received live updates and is in read-only mode (while Tab B has a lock). User must close Tab B or wait for lock TTL (2 min) to regain write access in Tab A.
├─ Error shown: "Another tab is editing this workflow" (409 - clear message, but still blocked)
└─ Collaboration Pane: [Avatar: Alice] ← No UI change

Note: Phase 1 differentiates 409 (same user) vs 423 (different user) for clear messaging, but both result in denial. No special "same user" handling until Phase 1.5.

AFTER PHASE 1.5 (Lock Stealing):
├─ Alice opens workflow in Tab A
├─ Alice (Same user) opens workflow in Tab B and starts editing → Gets write lock
├─ Alice goes back to Tab A → The tab received live updates and is in read-only mode (while Tab B has a lock). There is a button "Acquire editing" which allows to remove lock from Tab B and get it for Tab A. Available only if the lock is held by the same user (another tab).
└─ Collaboration Pane: [Avatar: Alice] ← No UI change

AFTER PHASE 2 (Enhanced Visibility):
├─ Alice opens workflow in Tab A 
├─ Alice opens workflow in Tab B 
├─ Alice opens workflow in Tab C 
└─ Collaboration Pane: [Avatar: Alice (3)]  ← Shows tab count
```

---

## Current Implementation (User-Based)

**Lock Identifier:** `userId` - All tabs for the same user share lock state
**Key Components:**
- Backend: `CollaborationService`, `CollaborationState` (packages/cli/src/collaboration/)
- Frontend: `CollaborationStore` (packages/frontend/editor-ui/src/features/collaboration/)
- Storage: Redis `collaboration:write-lock:${workflowId}` stores `userId`
- Connection: `pushRef` is stored in Pinia
  - **✅ VERIFIED:** `pushRef` is already per-tab (no persistence plugin configured)
  - Generated on store init: `pushRef: randomString(10).toLowerCase()` (line 56 of useRootStore.ts)
  - **Issue:** New random value on every page load → refresh loses identity
  - **Solution:** Persist to sessionStorage for refresh stability (~5 lines)

## Required Changes for Phase 1 (Basic Tab-Based Locking)

**Implementation uses Option C (Hybrid): Keep collaborator tracking user-based, make locks clientId-based**

**Good News:** `pushRef` is already per-tab! No Pinia persistence plugin exists, so each tab gets its own random pushRef. We only need to add sessionStorage persistence for refresh stability.

**Simplified Scope:** Phase 1 excludes lock stealing - that complexity is deferred to Phase 1.5. Users must close tabs or wait for TTL to free locks.

### Core Changes

1. **Frontend: Per-Tab ClientId** (~5 lines)
   - **Current:** `pushRef` is already per-tab but regenerates on refresh ✅
   - **Change:** Persist `pushRef` in sessionStorage for refresh stability
   - **Implementation:**
     ```typescript
     // Line 56 in useRootStore.ts - replace:
     pushRef: randomString(10).toLowerCase(),

     // With:
     pushRef: sessionStorage.getItem('n8n-client-id') || (() => {
       const id = randomString(10).toLowerCase();
       sessionStorage.setItem('n8n-client-id', id);
       return id;
     })(),
     ```
   - File: `packages/frontend/@n8n/stores/src/useRootStore.ts:56`
   - **Benefit:** Tab refresh maintains the same clientId and preserves write lock

2. **Backend: ClientId-Based Locks** (~20 lines)
   - Update `CollaborationState`: `setWriteLock()`, `getWriteLock()`, `renewWriteLock()`, `releaseWriteLock()`
   - Change Redis value from `userId` to `clientId`
   - **TTL Management:**
     - Lock key: 120 seconds (2 min)
     - Mapping key: 150 seconds (2.5 min, slightly longer to tolerate clock skew)
     - Refresh both on: acquire, heartbeat, renew operations
   - File: `packages/cli/src/collaboration/collaboration.state.ts`

3. **ClientId → UserId Mapping** (~15 lines)
   - Add separate Redis key: `collaboration:client-mapping:${workflowId}`
   - Store `{clientId: userId}` for permission validation
   - **TTL Policy:** Set EXPIRE on the mapping key (e.g., same TTL as lock or slightly longer, ~150 seconds) and refresh it on heartbeat/acquire. This prevents unbounded growth and ensures mapping stays in sync with active locks.
   - **Purpose:** This mapping is used only to (a) authorize same-user 'Acquire editing' (steal) **[Phase 1.5 only]** and (b) return the correct error (409 vs 423) when the requester is not the lock holder. The lock holder is validated purely by clientId match and does not depend on mapping.
   - **Phase 1:** Mapping used only for error messages (409 vs 423). Both errors result in denial - no special handling.
   - **Phase 1.5:** Mapping also used to authorize force-steal (same user only).
   - File: `packages/cli/src/collaboration/collaboration.state.ts`

4. **Message Handler Updates** (~30 lines)
   - Thread `clientId` through `handleUserMessage()` signature
   - Update handlers: `handleWriteAccessRequested`, `handleWriteAccessReleaseRequested`, `handleWriteAccessHeartbeat`, `handleWorkflowClosed`
   - **Simple lock acquisition logic (Phase 1 - No Stealing, Idempotent):**
     - If lock exists and equals my clientId → Success (idempotent, allows reconnect/reacquire)
     - If lock exists and different clientId → Reject (use mapping for 409 vs 423)
     - If no lock → Set lock with clientId
     - **Note:** REST/WebSocket still differentiate errors (409 same-user tab vs 423 other user), but both result in denial in Phase 1. The mapping exists for clear error messages, not special handling.
   - File: `packages/cli/src/collaboration/collaboration.service.ts`

5. **Frontend Store** (~10 lines)
   - Replace `currentWriterId` with `currentWriterClientId`
   - Compare `rootStore.pushRef === currentWriterClientId`
   - File: `packages/frontend/editor-ui/src/features/collaboration/collaboration.store.ts`

6. **REST Endpoint ClientId** (~30 lines) **⚠️ LOAD-BEARING**
   - **Require** `X-Client-Id` header on all workflow mutation endpoints
   - Reject with 409/423 if header missing or doesn't match lock holder
   - **Phase 1 Behavior:** Both 409 and 423 result in denial (no special handling)
     - 409: "Another tab is editing" (same user, different clientId)
     - 423: "Another user has write access" (different user)
     - **Why differentiate?** Clear user messaging. User needs to know if they should close their other tab (409) vs wait for another user (423).
   - Include error payload: `{ code: 'READ_ONLY_TAB', message: 'Another tab is editing this workflow' }`
   - Update `validateWriteLock()` to strictly check clientId match:
     - **If `lockHolderClientId === requestClientId`:** Allow immediately (mapping not required)
     - **If not:** Use mapping to decide whether it's another tab of same user (409) or another user (423)
   - Ensure both WebSocket and REST use same clientId source (sessionStorage)
   - **Endpoints requiring X-Client-Id validation (audited):**
     - ✅ `PATCH /:workflowId` (line 445) - already calls `validateWriteLock`
     - ✅ `DELETE /:workflowId` (line 503) - already calls `validateWriteLock`
     - ✅ `POST /:workflowId/archive` (line 527) - already calls `validateWriteLock`
     - ✅ `POST /:workflowId/unarchive` (line 558) - already calls `validateWriteLock`
     - ✅ `POST /:workflowId/activate` (line 586) - already calls `validateWriteLock`
     - ✅ `POST /:workflowId/deactivate` (line 613) - already calls `validateWriteLock`
   - **Endpoints intentionally bypassing lock validation:**
     - ❌ `POST /` (line 103) - create new workflow, no lock needed
     - ❌ `POST /:workflowId/run` (line 629) - execution only, doesn't modify workflow
     - ❌ `PUT /:workflowId/share` (line 677) - permissions only, not content
     - ❌ `PUT /:workflowId/transfer` (line 744) - ownership only, not content
   - Files:
     - `packages/cli/src/workflows/workflows.controller.ts` (6 endpoints to update)
     - `packages/cli/src/collaboration/collaboration.service.ts` (validateWriteLock signature)
   - **Critical:** All 6 lock-protected endpoints already identified, no hidden write paths

7. **API Types** (~5 lines)
   - Add `clientId` to `WriteAccessAcquired` payload
   - File: `packages/@n8n/api-types/src/push/collaboration.ts`
   - **Note:** `force` flag deferred to Phase 1.5

8. **Testing** (~50 lines)
   - Multi-tab scenarios, lock conflicts, TTL expiry
   - **Test REST mutations without X-Client-Id header (must fail with 423)**
   - **Test REST mutations with wrong clientId (must fail with 409)**
   - Test WebSocket and REST using same clientId
   - **Test basic lock behavior:**
     - Tab A requests lock, no existing lock → success
     - Tab A requests lock again (same clientId) → success (idempotent)
     - Tab B (same user) requests lock, Tab A has lock → reject with 409
     - Tab C (different user) requests lock, Tab A has lock → reject with 423
     - Tab A releases lock, Tab B requests → success
     - Lock expires via TTL, Tab B requests → success
     - Mapping key TTL expires after lock, stale entries cleaned up
   - Files: `packages/cli/test/integration/collaboration/`, `packages/cli/src/collaboration/__tests__/`
   - **Note:** Atomic stealing tests deferred to Phase 1.5

9. **Audit All Write Paths** ✅ **COMPLETED**
   - **Found:** 6 endpoints already calling `validateWriteLock()`
   - **Verified:** 4 endpoints intentionally bypass (create, run, share, transfer)
   - **Confirmed:** No hidden write paths exist
   - All write paths documented above

**Phase 1 Total:** 9-10 files, ~140-180 lines

**Simplified Scope (No Stealing):**
- 1 line change in useRootStore.ts (sessionStorage)
- 1 signature update in collaboration.service.ts (validateWriteLock)
- Simple lock request handling in handleWriteAccessRequested (~15 lines)
- 6 call sites in workflows.controller.ts (add clientId extraction + pass to validateWriteLock)
- 1 new method in collaboration.state.ts (getUserIdForClient)
- Frontend API client updates (X-Client-Id header)
- Test updates for basic lock scenarios

**Load-Bearing Components (Must Be Correct):**
1. ✅ X-Client-Id validation on REST mutations - prevents data corruption (6 endpoints audited)
2. ✅ SessionStorage clientId source - ensures WebSocket/REST consistency
3. ✅ ClientId → UserId mapping - for clear error messages (409 vs 423)
   - **Important:** Both errors result in denial in Phase 1. No special handling, just different messaging.

**Deferred to Phase 1.5:**
- Force flag and atomic stealing logic
- "Acquire editing" button
- Lua script for lock stealing
- Complex race condition handling

---

## Required Changes for Phase 1.5 (Lock Stealing)

**Goal:** Add "Acquire editing" button to intentionally transfer lock between user's own tabs

**Prerequisites:** Phase 1 complete and tested

### Additional Changes

1. **Add Force Flag to Message Type** (~5 lines)
   - Update `WriteAccessRequested` to include `force?: boolean`
   - File: `packages/@n8n/api-types/src/push/collaboration.ts`
   ```typescript
   export type WriteAccessRequested = {
     type: 'writeAccessRequested';
     data: {
       workflowId: string;
       force?: boolean; // true = steal from my other tab
     };
   };
   ```

2. **Update Message Handler** (~30 lines)
   - Add conditional logic in `handleWriteAccessRequested`:
     - `force: false/undefined` → Reject if any lock exists (Phase 1 behavior)
     - `force: true` → Call atomic steal operation
   - File: `packages/cli/src/collaboration/collaboration.service.ts`

3. **Atomic Lock Steal Operation** (~40 lines)
   - Add `acquireWriteLockAtomic()` method in CollaborationState
   - Implement Lua script: check permission + steal + cleanup old mapping + TTL
   - File: `packages/cli/src/collaboration/collaboration.state.ts`

4. **Frontend "Acquire Editing" Button** (~20 lines)
   - Show button when read-only and same user owns lock
   - Send `writeAccessRequested` with `force: true`
   - Handle success/failure responses
   - Files: Collaboration pane component

5. **Testing** (~30 lines)
   - Test force flag behavior (normal vs force)
   - Test atomic stealing (same user success, different user fail)
   - Test race conditions (stealing while renewing)
   - Files: `packages/cli/test/integration/collaboration/`

**Phase 1.5 Total:** 4-5 files, ~125 additional lines on top of Phase 1

**Load-Bearing Component:**
- ✅ Atomic Lua script - prevents race conditions during lock stealing

---

### Critical: REST Mutation Protection

**All workflow write endpoints MUST validate X-Client-Id header:**
- `PATCH /workflows/:id` - workflow updates
- `POST /workflows/:id/activate` - activation/deactivation
- `POST /workflows/:id/run` - manual execution (if it modifies workflow)
- Any other mutation endpoints

**Defensive Implementation:**
```typescript
// Current signature (line 233 in collaboration.service.ts):
async validateWriteLock(
  userId: User['id'],
  workflowId: Workflow['id'],
  action: string,
): Promise<void>

// New signature:
async validateWriteLock(
  userId: User['id'],
  clientId: string,
  workflowId: Workflow['id'],
  action: string,
): Promise<void> {
  // Require clientId
  if (!clientId) {
    throw new ForbiddenError('Client ID required', {
      httpStatusCode: 423,
      code: 'CLIENT_ID_REQUIRED'
    });
  }

  const lockHolder = await this.collaborationState.getWriteLock(workflowId);

  // Fast path: if clientId matches lock holder, allow immediately (idempotent)
  if (lockHolder === clientId) {
    return; // This tab owns the lock, allow mutation
  }

  // Lock exists and doesn't match requesting clientId (someone else has it)
  if (lockHolder) {
    // Use mapping to determine if it's same user (different tab) or different user
    const lockHolderUserId = await this.collaborationState.getUserIdForClient(workflowId, lockHolder);
    if (lockHolderUserId === userId) {
      // Same user, different tab
      throw new ForbiddenError(`Cannot ${action} workflow - another tab is editing`, {
        httpStatusCode: 409,
        code: 'READ_ONLY_TAB',
        lockHolderClientId: lockHolder
      });
    } else {
      // Different user owns lock
      throw new ForbiddenError(`Cannot ${action} workflow - another user has write access`, {
        httpStatusCode: 423,
        code: 'WORKFLOW_LOCKED'
      });
    }
  }

  // No lock exists, allow (though this might indicate a race condition)
}

// Example controller update (line 445):
// Before:
await this.collaborationService.validateWriteLock(req.user.id, workflowId, 'update');

// After:
const clientId = req.headers['x-client-id'] as string;
await this.collaborationService.validateWriteLock(req.user.id, clientId, workflowId, 'update');
```

**Frontend Must:**
- Read clientId from sessionStorage (same source as WebSocket)
- Include `X-Client-Id` header in all mutation requests
- Handle 409 error by showing "Read-only: another tab is editing"
- Never cache or reuse stale clientId

**Implementation Checklist (Commit Order):**

**Pre-Implementation:**
- [x] **VERIFIED:** `pushRef` is already per-tab (no persistence plugin) ✅
- [x] **AUDITED:** All workflow mutation endpoints identified ✅
  - 6 endpoints already call `validateWriteLock` and need X-Client-Id validation
  - 4 endpoints intentionally bypass lock validation (create, run, share, transfer)

**Commit 1: Per-Tab ClientId**
- [ ] Update `pushRef` initialization in useRootStore.ts to use sessionStorage
- [ ] Add test: Verify different tabs get different clientIds
- [ ] Add test: Verify refresh maintains same clientId

**Commit 2: Thread ClientId Backend**
- [ ] Update `abstract.push.ts` to pass pushRef through event chain
- [ ] Update `handleUserMessage()` signature to accept clientId parameter
- [ ] Update all handler calls to pass clientId (don't use yet)
- [ ] Add logging to verify clientId is received
- [ ] Test: Verify logs show different clientIds per tab

**Commit 3: ClientId Lock Storage**
- [ ] Update `CollaborationState` lock methods (setWriteLock, getWriteLock, renewWriteLock, releaseWriteLock)
- [ ] Change Redis lock value from userId to clientId
- [ ] Add TTL management for lock key (120s)
- [ ] Keep validation using userId temporarily (backward compatible)
- [ ] Test: Verify locks stored as clientId in Redis
- [ ] Test: Verify TTL set correctly

**Commit 4: Add Mapping**
- [ ] Add `collaboration:client-mapping:${workflowId}` Redis key
- [ ] Add `setClientMapping()`, `getClientMapping()` methods
- [ ] Store mapping on lock acquire, remove on release
- [ ] Add TTL management for mapping key (150s)
- [ ] Test: Verify mapping stored correctly
- [ ] Test: Verify mapping TTL > lock TTL

**Commit 5: ClientId Validation (Generic Error)**
- [ ] Update `validateWriteLock()` signature to accept clientId parameter
- [ ] Update lock validation to compare clientIds
- [ ] Add idempotent reacquire (same clientId = success)
- [ ] Use generic error message "Workflow is locked" (temporarily)
- [ ] Update WebSocket handlers to check clientId
- [ ] Test: Tab A has lock, Tab A can mutate (idempotent)
- [ ] Test: Tab B (same user) blocked
- [ ] Test: Tab C (different user) blocked

**Commit 6: REST X-Client-Id Header** ⚠️ LOAD-BEARING
- [ ] Add clientId extraction from X-Client-Id header in workflows.controller.ts
- [ ] Update all 6 endpoint calls to pass clientId to validateWriteLock
- [ ] Reject with 423 if header missing
- [ ] Update frontend API client to include X-Client-Id header
- [ ] Test: Mutation without header → 423
- [ ] Test: Mutation with wrong clientId → blocked
- [ ] Test: Mutation with correct clientId → success
- [ ] Verify WebSocket and REST read from same sessionStorage key

**Commit 7: Error Differentiation**
- [ ] Add `getUserIdForClient()` method using mapping
- [ ] Update validateWriteLock to differentiate 409 vs 423
- [ ] Return 409 for same user, 423 for different user
- [ ] Update frontend to show appropriate error messages
- [ ] Test: Tab B (same user) → 409 "Another tab is editing"
- [ ] Test: Tab C (different user) → 423 "Another user has write access"

**Commit 8: Comprehensive Tests**
- [ ] Multi-tab scenarios
- [ ] TTL expiry (lock and mapping)
- [ ] Idempotent reacquire
- [ ] Error code differentiation

**Phase 1.5 (Lock Stealing):**
- [ ] Add `force` flag to `WriteAccessRequested` message type
- [ ] Update `handleWriteAccessRequested` to handle `force` flag:
  - `force: false/undefined` → Normal request (Phase 1 behavior)
  - `force: true` → Use atomic Lua script (steal from same user only)
- [ ] Implement atomic lock steal with Lua script in CollaborationState
- [ ] Frontend: Add "Acquire editing" button (visible when same user owns lock)
- [ ] Frontend: Button sends `writeAccessRequested` with `force: true`
- [ ] Add tests for force flag behavior (normal vs force acquire)
- [ ] Add tests for atomic stealing (race conditions, same vs different user)

---

### Atomic Lock Acquisition ("Steal from My Other Tab") - PHASE 1.5 ONLY

> **Note:** This section describes Phase 1.5 functionality. Phase 1 uses simple reject-if-locked behavior.

**Problem:** Race condition when user's Tab A tries to steal lock from Tab B while Tab B also tries to renew.

**Solution:** Single atomic Redis operation using Lua script

```lua
-- Atomic lock acquisition with permission check and cleanup
-- KEYS[1] = lock key (e.g., "collaboration:write-lock:workflow-123")
-- KEYS[2] = mapping key (e.g., "collaboration:client-mapping:workflow-123")
-- ARGV[1] = requesting clientId
-- ARGV[2] = requesting userId
-- ARGV[3] = TTL in seconds (120)

local currentLockHolder = redis.call('GET', KEYS[1])
if currentLockHolder then
  -- Verify current lock holder belongs to same user
  local lockHolderUserId = redis.call('HGET', KEYS[2], currentLockHolder)
  if lockHolderUserId ~= ARGV[2] then
    return {err = "PERMISSION_DENIED"}  -- Different user owns lock
  end

  -- Clean up old lock holder's mapping (if different from new one)
  if currentLockHolder ~= ARGV[1] then
    redis.call('HDEL', KEYS[2], currentLockHolder)
  end
end

-- Atomically set lock + update mapping + set TTL
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
return {ok = "ACQUIRED"}
```

**Why Cleanup Matters:**
- Reduces stale entries on lock transfer (HDEL removes immediate previous holder)
- Tab A's clientId removed when Tab B steals the lock
- **Note:** This only cleans up during transfers, not stale entries from crashes/TTL expiry
- **For full cleanup:** Ensure the mapping key has a TTL and is refreshed on heartbeats/acquire. Stale entries expire with the mapping key.

**Why Atomic:**
- Without atomicity: Tab A checks lock → Tab B renews → Tab A steals → both think they have lock
- With Lua: Check + permission validation + set + TTL happen in single Redis transaction
- Prevents flip-flopping between tabs

**Implementation:**
```typescript
// In CollaborationState
async acquireWriteLockAtomic(
  workflowId: string,
  clientId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const lockKey = this.formLockKey(workflowId);
  const mappingKey = this.formClientMappingKey(workflowId);

  try {
    const result = await this.redisClient.eval(
      ATOMIC_LOCK_SCRIPT,
      2, // number of keys
      lockKey,
      mappingKey,
      clientId,
      userId,
      120 // TTL in seconds
    );
    return { success: true };
  } catch (error) {
    if (error.message.includes('PERMISSION_DENIED')) {
      return { success: false, error: 'Different user owns lock' };
    }
    throw error;
  }
}
```

**Message Type Update:**
```typescript
// packages/@n8n/api-types/src/push/collaboration.ts
export type WriteAccessRequested = {
  type: 'writeAccessRequested';
  data: {
    workflowId: string;
    force?: boolean; // NEW: true = steal from my other tab, false/undefined = normal request
  };
};
```

**Frontend Flows:**

**Normal Lock Request (opening workflow):**
1. User opens workflow in Tab A
2. Tab A sends `writeAccessRequested` with `force: false` (or omitted)
3. Backend checks if lock available
4. If another user has lock: Reject
5. If same user has lock (different tab): Reject (don't steal)
6. If no lock: Grant

**Force Acquire ("Acquire editing" button):**
1. User clicks "Acquire editing" button in Tab A
2. Tab A sends `writeAccessRequested` with `force: true`
3. Backend runs atomic Lua script with permission check
4. If same user owns lock: Steal lock, Tab B receives `writeAccessLost`
5. If different user owns lock: Reject with 423
6. If no lock: Grant

**Backend Logic:**
```typescript
// In handleWriteAccessRequested
async handleWriteAccessRequested(userId, clientId, msg) {
  const { workflowId, force } = msg.data;

  if (force) {
    // Use atomic Lua script (allows stealing from same user)
    const result = await this.collaborationState.acquireWriteLockAtomic(
      workflowId,
      clientId,
      userId
    );
    if (!result.success) {
      // Different user owns lock
      return this.sendError(clientId, 'PERMISSION_DENIED');
    }
  } else {
    // Normal acquisition (no stealing)
    const currentHolder = await this.collaborationState.getWriteLock(workflowId);
    if (currentHolder) {
      // Lock exists (any user) - reject
      return this.sendError(clientId, 'LOCK_TAKEN');
    }
    // Set lock normally
    await this.collaborationState.setWriteLock(workflowId, clientId);
  }

  // Notify all tabs
  this.broadcastWriteLockAcquired(workflowId, clientId, userId);
}
```

**Why This Matters:**
- Without `force` flag: Either always steal (bad - disrupts other tabs) or never steal (bad - button doesn't work)
- With `force` flag: Normal workflow opening doesn't disrupt existing tabs, but "Acquire editing" button works as intended

---

## Phase 2: Enhanced Collaboration Pane (Tab Count Visibility)

**Goal:** Show tab counts in collaboration pane (e.g., "Alice (3)")
**Approach:** Migrate from Option C (Hybrid) to Option B (Group in UI)

### Changes Required

1. **Migrate Collaborator Tracking to ClientId** (~30 lines)
   - Change Redis from `{userId: lastSeen}` to `{clientId: {userId, lastSeen}}`
   - Update `CollaborationState.addCollaborator()` and `removeCollaborator()`
   - File: `packages/cli/src/collaboration/collaboration.state.ts`

2. **Add Grouping Logic** (~25 lines)
   - Group collaborators by userId before broadcasting
   - Calculate `sessionCount` per user
   - File: `packages/cli/src/collaboration/collaboration.service.ts`

3. **Update API Types** (~10 lines)
   - Add `sessionCount` and optional `writeLockClientId` to `Collaborator` type
   - File: `packages/@n8n/api-types/src/push/collaboration.ts`

4. **Update Collaboration Pane UI** (~35 lines)
   - Show tab count badge: "Alice (3)"
   - Update tooltip display
   - Files: `CollaborationPane.vue`, `N8nUserStack` component

5. **Testing** (~20 lines)
   - Verify grouping logic and UI display with multiple tabs

**Phase 2 Total:** 3-4 additional files, +80-100 lines

**Why Option B (Group in UI)?**
- Clean UI (one avatar per user with badge)
- Tracks tabs accurately for locking
- Intuitive for users

**Why Not Option A (Show All Tabs)?**
- Poor UX: Multiple avatars per user is confusing and clutters UI

---

## Edge Cases & Risk Mitigation

| Edge Case | Solution |
|-----------|----------|
| Tab closes without cleanup | Lock TTL (2 min) auto-expires, mapping TTL (2.5 min) cleans up entry |
| Simultaneous lock requests (different users) | Redis atomic operation (first wins) |
| User refreshes tab | ClientId persists via sessionStorage, lock maintained |
| Browser crash/force quit | Lock TTL (2 min) auto-expires, mapping TTL cleans up stale entry |
| **Lock holder reconnects/reacquires** | **Idempotent: Same clientId reacquiring = success (no-op)** |
| Missing X-Client-Id header | **Reject with 423, require header on all mutations** |
| Wrong clientId in header | Reject with 409 "Another tab is editing" |
| WebSocket vs REST clientId mismatch | Both read from same sessionStorage source |
| Mutation endpoint bypasses check | **Audit all write paths, reject by default** |
| **Mapping grows unbounded (stale clientIds)** | **Mapping key has TTL (150s), refreshed on heartbeat/acquire** |
| **User opens workflow in new tab (disrupts existing tab)** | **Normal request rejected if any lock exists (Phase 1)** |
| **"Acquire editing" button doesn't work** | **Force request uses atomic Lua script to steal (Phase 1.5)** |
| **Tab A force-steals while Tab B renews** | **Atomic Lua script: check + set + cleanup + TTL in single operation (Phase 1.5)** |
| **Tab A tries to force-steal from different user** | **Lua script validates userId before allowing steal (Phase 1.5)** |
| **Two tabs fight over lock (flip-flop)** | **Atomic operation prevents TOCTOU race (Phase 1.5)** |

**Risks:**
- **Low:** Lock TTL prevents deadlocks, no DB schema changes, backward compatible
- **High (mitigated):** REST mutations without clientId validation → **MUST be strict**
- **Medium:** User confusion if tabs fight over locks

---

## Implementation Summary

### Phase 1: Basic Tab-Based Locking (Commit-by-Commit Breakdown)

**Overview:**
- **Files:** 9-10 | **Lines:** ~140-180
- **Approach:** Option C (Hybrid) - Keep UI unchanged, make locks clientId-based
- **Strategy:** Small, testable commits that can be deployed incrementally

#### Commit 1: Add Per-Tab ClientId (~10 lines)
**Commit Message:**
```
feat(editor): Add per-tab client ID with refresh persistence

Store pushRef in sessionStorage to maintain unique client ID across
page refreshes. This enables per-tab workflow lock tracking.

Each browser tab now gets a persistent unique identifier that survives
refresh but resets when tab closes.
```

**Goal:** Generate unique clientId per tab with refresh persistence

**Changes:**
- Update `useRootStore.ts` to use sessionStorage for `pushRef`
- Add test: Verify different tabs get different clientIds
- Add test: Verify refresh maintains same clientId

**Why First:** Foundation for everything else, no breaking changes, easy to test

**Testable:** Open two tabs, verify different pushRef values

---

#### Commit 2: Thread ClientId Through Backend (~20 lines)
**Commit Message:**
```
refactor(collaboration): Thread client ID through message handlers

Pass pushRef/clientId through collaboration service event chain.
No behavior change - parameter added but not yet used for validation.

Prepares backend for per-tab lock validation while maintaining
backward compatibility.
```

**Goal:** Pass clientId to collaboration handlers without changing behavior yet

**Changes:**
- Update `abstract.push.ts` to pass `pushRef` through event chain
- Update `handleUserMessage()` signature to accept `clientId` parameter
- Update all handler calls to pass clientId (but don't use it yet)
- Add logging to verify clientId is received

**Why Second:** Plumbing with no behavior change, easy to verify

**Testable:** Check logs show different clientIds per tab

---

#### Commit 3: Replace userId with ClientId in Lock Storage (~30 lines)
**Commit Message:**
```
refactor(collaboration): Store workflow locks by client ID

Change lock storage from userId to clientId in Redis. Lock validation
still uses userId temporarily to maintain backward compatibility.

Adds TTL management (120s) for lock keys. Multiple tabs from same user
can now hold separate locks.
```

**Goal:** Store locks by clientId instead of userId

**Changes:**
- Update `CollaborationState`: change lock value from userId to clientId
- Update `setWriteLock()`, `getWriteLock()`, `renewWriteLock()`, `releaseWriteLock()`
- Keep lock validation using userId temporarily (backward compatible)
- Add TTL management (120s for locks)

**Why Third:** Core lock change, but validation still works with userId

**Testable:**
- Same user, two tabs: Both can get locks (regression vs current)
- Verify locks stored as clientId in Redis
- Verify TTL set correctly

---

#### Commit 4: Add ClientId → UserId Mapping (~20 lines)
**Commit Message:**
```
feat(collaboration): Add client ID to user ID mapping

Store clientId → userId mapping in Redis with 150s TTL (longer than lock).
Mapping is set on lock acquire and cleaned up on release.

Prepares for error differentiation (same-user tab vs different user)
and future lock stealing authorization.
```

**Goal:** Track which clientId belongs to which userId

**Changes:**
- Add `collaboration:client-mapping:${workflowId}` Redis key
- Add `setClientMapping()`, `getClientMapping()` methods
- Store mapping on lock acquire, remove on release
- Add TTL management (150s for mapping)
- Update locks to set mapping

**Why Fourth:** Non-breaking addition, prepares for clientId validation

**Testable:**
- Verify mapping stored correctly
- Verify mapping TTL > lock TTL
- Verify mapping cleaned on lock release

---

#### Commit 5: Update Lock Validation to Use ClientId (~25 lines)
**Commit Message:**
```
feat(collaboration): Validate workflow locks by client ID

Switch lock validation from userId to clientId. Each tab now holds
independent locks. Generic error message used temporarily.

Adds idempotent reacquire - same tab requesting lock returns success.
This enables per-tab workflow editing without conflicts.
```

**Goal:** Validate locks by clientId instead of userId (still single error message)

**Changes:**
- Update `validateWriteLock()` to compare clientIds
- Update WebSocket handlers to check clientId
- **Temporary:** Show generic error "Workflow is locked" (same for all cases)
- Add idempotent reacquire (same clientId = success)

**Why Fifth:** Core validation change, but still simple error message

**Testable:**
- Tab A has lock, Tab A can mutate (idempotent) ✓
- Tab B (same user) blocked ✓
- Tab C (different user) blocked ✓
- Both get same error message (temporary)

---

#### Commit 6: Add X-Client-Id Header to REST Endpoints (~20 lines)
**Commit Message:**
```
feat(API): Require X-Client-Id header for workflow mutations

Add strict client ID validation on all workflow mutation endpoints.
Requests without header or with wrong clientId are rejected.

Prevents data corruption when multiple tabs edit same workflow.
Must deploy atomically with commit 5 to close validation gap.
```

**Goal:** Require clientId on all mutation endpoints

**Changes:**
- Add clientId extraction from `X-Client-Id` header in workflows.controller.ts
- Update 6 endpoint calls to pass clientId to validateWriteLock
- Reject with 423 if header missing
- Frontend API client adds header

**Why Sixth:** REST protection, builds on commit 5's clientId validation

**Testable:**
- Mutation without header → 423
- Mutation with wrong clientId → blocked
- Mutation with correct clientId → success

---

#### Commit 7: Differentiate 409 vs 423 Errors (~20 lines)
**Commit Message:**
```
feat(collaboration): Differentiate lock errors by user

Return 409 for same-user different-tab conflicts and 423 for
different-user conflicts. Both still result in denial.

Provides clear user feedback: close your other tab (409) vs wait
for another user (423). Pure UX improvement, no behavior change.
```

**Goal:** Clear error messages (same user tab vs different user)

**Changes:**
- Update `validateWriteLock()` to use mapping for error differentiation
- Add `getUserIdForClient()` method
- Return 409 for same user, 423 for different user
- Frontend shows appropriate message

**Why Last:** Polish, doesn't change behavior (both still denied)

**Testable:**
- Tab B (same user) → 409 "Another tab is editing"
- Tab C (different user) → 423 "Another user has write access"
- Both still blocked (no special handling)

---

#### Commit 8: Update Tests (~50 lines)
**Commit Message:**
```
test(collaboration): Add tests for per-tab workflow locking

Comprehensive test coverage for client ID based locking:
- Multi-tab scenarios (same user, different users)
- Error code differentiation (409 vs 423)
- TTL expiry for locks and mappings
- Idempotent reacquire by same tab
- REST X-Client-Id header validation
```

**Goal:** Comprehensive test coverage for all scenarios

**Changes:**
- Add tests for each commit's functionality
- Multi-tab scenarios
- Error code differentiation
- TTL expiry
- Idempotent reacquire

---

### Phase 1 Commit Progression Summary

**All commits follow n8n conventions:** `type(scope): description`
- **Types:** feat, refactor, test
- **Scopes:** editor, collaboration, API
- **Format:** Imperative mood, no period, concise description

```
Commit 1: feat(editor): Add per-tab client ID with refresh persistence
└─ Each tab gets unique ID (sessionStorage)
   ✓ Testable: Different tabs, different IDs
   ✓ Zero risk: No backend changes

Commit 2: refactor(collaboration): Thread client ID through message handlers
└─ Pass clientId through handlers (unused)
   ✓ Testable: Logs show clientIds
   ✓ Zero risk: No behavior change

Commit 3: refactor(collaboration): Store workflow locks by client ID
└─ Store locks by clientId (validation still userId)
   ✓ Testable: Redis shows clientIds
   ✓ Low risk: Validation unchanged, backward compatible

Commit 4: feat(collaboration): Add client ID to user ID mapping
└─ Track clientId → userId
   ✓ Testable: Mapping in Redis
   ✓ Zero risk: Not used yet

Commit 5: feat(collaboration): Validate workflow locks by client ID
└─ Validate by clientId, single error message
   ✓ Testable: Tab isolation works
   ✓ Medium risk: Core change, but simple

Commit 6: feat(API): Require X-Client-Id header for workflow mutations
└─ Require header on mutations
   ✓ Testable: Missing header rejected
   ✓ High risk: LOAD-BEARING (prevents corruption)

Commit 7: feat(collaboration): Differentiate lock errors by user
└─ 409 vs 423 messages
   ✓ Testable: Different error codes
   ✓ Zero risk: Pure UX polish

Commit 8: test(collaboration): Add tests for per-tab workflow locking
└─ Comprehensive coverage
   ✓ All scenarios tested
```

**Why This Order:**
- ✅ Each commit is independently testable
- ✅ Can deploy partial progress (commits 1-5 are safe without 6)
- ✅ Load-bearing change (commit 6) comes after foundation is solid
- ✅ Error polish (commit 7) is last (pure UX, no behavior change)

**Deployment Safety:**
- Commits 1-4: Can deploy to production independently (no behavior change)
- Commit 5: Enable tab isolation (backward compatible, fixes multi-tab corruption)
- Commit 6: **Critical** - Must deploy with commit 5, prevents REST bypass
- Commit 7: Can deploy anytime after commit 5 (optional polish)

**Rollback Strategy:**
- Commits 1-4: Revert individually with no impact
- Commits 5-6: Revert together (deployed as atomic unit)
- Commit 7: Revert independently (just error messages)

**Commit Dependencies:**
```
┌─────────────────────────────────────────────────────┐
│ Commit 1: Per-Tab ClientId (Foundation)            │
│ └─ No dependencies, safe to deploy alone           │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Commit 2: Thread ClientId Backend                  │
│ └─ Depends on: Commit 1                            │
│ └─ Safe to deploy (no behavior change)             │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Commit 3: ClientId Lock Storage                    │
│ └─ Depends on: Commit 2                            │
│ └─ Safe to deploy (validation still userId)        │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Commit 4: Add Mapping                              │
│ └─ Depends on: Commit 3                            │
│ └─ Safe to deploy (not used yet)                   │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Commit 5: ClientId Validation                      │
│ └─ Depends on: Commits 1-4                         │
│ └─ BEHAVIOR CHANGE: Tab isolation enabled          │
│ └─ Must deploy with Commit 6 (atomic unit)         │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Commit 6: REST X-Client-Id ⚠️ CRITICAL             │
│ └─ Depends on: Commit 5                            │
│ └─ LOAD-BEARING: Prevents REST bypass corruption   │
│ └─ Must deploy with Commit 5 (atomic unit)         │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│ Commit 7: Error Differentiation (Optional Polish)  │
│ └─ Depends on: Commit 4 (mapping)                  │
│ └─ Can deploy anytime after Commit 6               │
│ └─ Pure UX improvement, no behavior change         │
└─────────────────────────────────────────────────────┘
```

### Phase 1 Final Outcome
- **Behavior:**
  - If lock holder reacquires (same clientId) → Success (idempotent)
  - If different clientId requests → Denied (409 same user, 423 different user)
  - Both errors result in denial - differentiation is for clear user messaging only
- **TTL Management:**
  - Lock key: 120s (2 min), refreshed on heartbeat
  - Mapping key: 150s (2.5 min), refreshed on heartbeat/acquire
- **Critical Components:**
  - Strict X-Client-Id validation on 6 REST mutation endpoints (audited)
  - SessionStorage-based clientId (WebSocket + REST consistency)
  - ClientId → UserId mapping (for error messages, not authorization logic)

**Concrete File Changes:**
1. `packages/frontend/@n8n/stores/src/useRootStore.ts` - Add sessionStorage persistence (1 line)
2. `packages/cli/src/collaboration/collaboration.state.ts` - Update lock methods + add getUserIdForClient (~30 lines)
3. `packages/cli/src/collaboration/collaboration.service.ts` - Update validateWriteLock signature + simple lock handling (~50 lines)
4. `packages/cli/src/workflows/workflows.controller.ts` - Add clientId extraction for 6 endpoints (~12 lines)
5. `packages/cli/src/push/abstract.push.ts` - Thread clientId through handlers (~5 lines)
6. `packages/frontend/editor-ui/src/features/collaboration/collaboration.store.ts` - Update to clientId-based (~10 lines)
7. `packages/@n8n/api-types` - Add clientId to message types (~5 lines)
8. Frontend API client - Add X-Client-Id header (~15 lines)
9. Test files - Multi-tab scenarios, basic lock behavior (~50 lines)

### Phase 1.5: Lock Stealing ("Acquire Editing")
- **Additional Files:** +4-5 | **Additional Lines:** ~125
- **Approach:** Add force flag + atomic Lua script for same-user lock stealing
- **Outcome:** Users can intentionally transfer lock between their tabs
- **Critical Component:**
  - Atomic Lua script for race-free lock stealing

**Additional File Changes:**
1. `packages/@n8n/api-types` - Add force flag to WriteAccessRequested (~5 lines)
2. `packages/cli/src/collaboration/collaboration.service.ts` - Force flag handling (~30 lines)
3. `packages/cli/src/collaboration/collaboration.state.ts` - Atomic lock steal with Lua script (~40 lines)
4. Frontend collaboration pane - "Acquire editing" button (~20 lines)
5. Test files - Force flag behavior, atomic stealing (~30 lines)

### Phase 2: Enhanced UI (Tab Count Display)
- **Additional Files:** +3-4 | **Additional Lines:** ~80-100
- **Approach:** Option B (Group in UI) - Show "Alice (3)" in collaboration pane
- **Outcome:** Users see tab counts per person

### Total (All Phases)
- **Files:** 16-19 | **Lines:** ~345-405
- **Phase 1:** ~140-180 lines (basic locking)
- **Phase 1.5:** +~125 lines (stealing)
- **Phase 2:** +~80-100 lines (UI enhancement)
- **Risk:** Low-Medium (High risk areas mitigated with incremental delivery + atomic operations + strict validation)

---

## Audit Results Summary

**✅ Verification Completed:**
1. **pushRef per-tab behavior:** Already per-tab, only needs sessionStorage for refresh persistence
2. **Workflow mutation endpoints:** All 6 write-protected endpoints identified and documented
3. **Write path coverage:** No hidden mutations found, all paths accounted for

**Endpoints Requiring X-Client-Id Validation:**
- `PATCH /:workflowId` - Update workflow (line 445)
- `DELETE /:workflowId` - Delete workflow (line 503)
- `POST /:workflowId/archive` - Archive workflow (line 527)
- `POST /:workflowId/unarchive` - Unarchive workflow (line 558)
- `POST /:workflowId/activate` - Activate workflow (line 586)
- `POST /:workflowId/deactivate` - Deactivate workflow (line 613)

**Endpoints Intentionally Bypassing Lock:**
- `POST /` - Create new workflow (no existing lock)
- `POST /:workflowId/run` - Execute only, no workflow modification
- `PUT /:workflowId/share` - Permission changes only
- `PUT /:workflowId/transfer` - Ownership changes only

**Current validateWriteLock Signature:**
```typescript
// packages/cli/src/collaboration/collaboration.service.ts:233
async validateWriteLock(userId, workflowId, action): Promise<void>
```

**Required Signature Change:**
```typescript
async validateWriteLock(userId, clientId, workflowId, action): Promise<void>
```

**Ready for Implementation:** All prerequisites verified, scope clearly defined, no unknowns remaining.

---

## Key Technical Decisions

1. **ClientId Storage:** SessionStorage (per-tab, persists on refresh) ✅ **REQUIRED**
   - **Verified:** Pinia `pushRef` is already per-tab (no persistence configured) ✅
   - Only need sessionStorage for refresh persistence (~5 lines)
   - No migration needed - simple addition to existing code
2. **REST Endpoint ClientId:** **STRICT - Require X-Client-Id header, reject if missing/mismatched** ✅ **REQUIRED**
   - Alternative (rejected): Validate userId only → Allows tab A to corrupt tab B's work ❌
3. **Incremental Implementation:** **Three phases (Basic → Stealing → UI)** ✅ **REQUIRED**
   - **Phase 1:** Basic clientId locking, no stealing (simpler, safer)
   - **Phase 1.5:** Add force flag + atomic stealing (complex part isolated)
   - **Phase 2:** UI enhancements (tab counts)
   - Alternative (rejected): All at once → Higher risk, harder to test ❌
4. **Lock Acquisition with Force Flag (Phase 1.5):** **Add `force` parameter to distinguish normal vs steal** ✅ **REQUIRED**
   - `force: false/undefined` - Normal request (reject if any lock exists, prevents disrupting other tabs)
   - `force: true` - Force acquire (steal from same user only, for "Acquire editing" button)
   - Alternative (rejected): Always steal → Opening new tab disrupts existing work ❌
   - Alternative (rejected): Never steal → "Acquire editing" button doesn't work ❌
5. **Atomic Steal Operation (Phase 1.5):** **Lua script for force acquire** ✅ **REQUIRED**
   - Check permission (same user) + set lock + cleanup old mapping + renew TTL in single operation
   - Alternative (rejected): Separate check/set → Race condition, flip-flopping ❌
6. **Lock Expiry:** TTL-based (2 min) vs proactive cleanup ✅ **Recommended: TTL**
7. **Lock Conflict:** First-come-first-served (Redis atomic) vs user notification ✅ **Recommended: First-come-first-served**
8. **Error Codes:** 409 (same user, different tab) vs 423 (different user) ✅ **REQUIRED for clear UX**
   - **Phase 1:** Both result in denial (no special handling). Different messages help user understand why blocked.
   - **Phase 1.5:** 409 becomes relevant for "Acquire editing" button eligibility (shown only for same-user locks)

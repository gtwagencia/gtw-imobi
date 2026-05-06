# Graph Report - gtw-platform  (2026-05-05)

## Corpus Check
- 110 files · ~77,209 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 486 nodes · 696 edges · 75 communities (71 shown, 4 thin omitted)
- Extraction: 73% EXTRACTED · 27% INFERRED · 0% AMBIGUOUS · INFERRED: 187 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b10c692b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]

## God Nodes (most connected - your core abstractions)
1. `query()` - 171 edges
2. `getSocket()` - 8 edges
3. `baseLayout()` - 7 edges
4. `getTicketMeta()` - 7 edges
5. `getUserInfo()` - 7 edges
6. `getAuthorizedClient()` - 7 edges
7. `getUserWithOrgs()` - 6 edges
8. `register()` - 6 edges
9. `login()` - 6 edges
10. `sendEvent()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `orgContext()` --calls--> `query()`  [INFERRED]
  backend/src/middleware/orgContext.js → backend/src/config/database.js
- `workspaceContext()` --calls--> `query()`  [INFERRED]
  backend/src/middleware/workspaceContext.js → backend/src/config/database.js
- `requireNotTicketsOnly()` --calls--> `query()`  [INFERRED]
  backend/src/middleware/workspaceContext.js → backend/src/config/database.js
- `logout()` --calls--> `query()`  [INFERRED]
  backend/src/modules/auth/auth.service.js → backend/src/config/database.js
- `changePassword()` --calls--> `query()`  [INFERRED]
  backend/src/modules/auth/auth.service.js → backend/src/config/database.js

## Communities (75 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (49): query(), addAttachment(), addBoardMember(), addManualTime(), archiveBoard(), createBoard(), createColumn(), createComment() (+41 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (9): cancelSelection(), openTicketFromSelection(), openTicketModal(), DashboardLayout(), useNotifications(), connectSocket(), ensureSocket(), getSocket() (+1 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (7): handleAddManualTime(), handleStopTimer(), loadBoard(), loadTimeLogs(), patch(), onUpdated(), handleAnalyze()

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (7): createTicket(), Alert(), fetchReport(), handleCommentKeyDown(), selectMention(), submitComment(), uploadAttachment()

### Community 4 - "Community 4"
Cohesion: 0.22
Nodes (20): baseLayout(), btn(), sendMail(), sendMailSilent(), testConnection(), ticketBadge(), tplAssigned(), tplComment() (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.27
Nodes (14): createEvent(), deleteEvent(), disconnect(), getAuthorizedClient(), getAuthUrl(), getOAuthClient(), getRedirectUri(), getStatus() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (4): getDueDateLabel(), applyPreset(), exportCsv(), format()

### Community 7 - "Community 7"
Cohesion: 0.29
Nodes (11): changePassword(), createRefreshToken(), getUserWithOrgs(), login(), logout(), me(), refresh(), register() (+3 more)

### Community 8 - "Community 8"
Cohesion: 0.18
Nodes (12): createDeal(), createDealFromConversation(), createStage(), getBoard(), listDeals(), listStages(), moveToAttending(), removeDeal() (+4 more)

### Community 9 - "Community 9"
Cohesion: 0.24
Nodes (11): createPipeline(), createStage(), getDefaultPipeline(), getPipeline(), getPipelineForInbox(), listPipelines(), removePipeline(), removeStage() (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.31
Nodes (7): buildCustomData(), buildUserData(), listEvents(), sendEvent(), sendLeadEvent(), sendPurchaseEvent(), sha256()

### Community 12 - "Community 12"
Cohesion: 0.2
Nodes (9): addMember(), create(), getById(), listForOrg(), listMembers(), removeMember(), resetMemberPassword(), update() (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.2
Nodes (9): assignAgent(), create(), getById(), list(), listAgents(), listUnassignedAgents(), remove(), removeAgent() (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.2
Nodes (9): addMember(), create(), getById(), getUserInboxIds(), list(), listMembers(), remove(), removeMember() (+1 more)

### Community 15 - "Community 15"
Cohesion: 0.47
Nodes (9): analyzeConversation(), analyzeDeal(), buildAnthropicContent(), callLLM(), fetchMediaAsBase64(), formatTranscript(), generateChatbotResponse(), generateFollowUp() (+1 more)

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (3): initDatabase(), ensureBucket(), start()

### Community 17 - "Community 17"
Cohesion: 0.28
Nodes (8): buildVisibilityClause(), findOrCreate(), getById(), list(), listCampaigns(), markRead(), refreshLastMessage(), update()

### Community 18 - "Community 18"
Cohesion: 0.25
Nodes (5): backfillAttending(), isWithinBusinessHours(), runAiAnalysis(), runFollowUp(), runSlaCheck()

### Community 20 - "Community 20"
Cohesion: 0.25
Nodes (7): addToConversation(), create(), getForConversation(), list(), remove(), removeFromConversation(), update()

### Community 21 - "Community 21"
Cohesion: 0.25
Nodes (7): getById(), inviteMember(), listForUser(), listMembers(), removeMember(), update(), updateMemberRole()

### Community 22 - "Community 22"
Cohesion: 0.52
Nodes (6): autoAssignAgent(), cleanMime(), extractMessageContent(), handleGroupMessage(), normalizePhone(), resolveMediaUrl()

### Community 23 - "Community 23"
Cohesion: 0.29
Nodes (6): create(), getById(), list(), listConversations(), remove(), update()

### Community 24 - "Community 24"
Cohesion: 0.38
Nodes (3): handleAssign(), handleRemoveAgent(), selectDept()

### Community 25 - "Community 25"
Cohesion: 0.47
Nodes (3): fetchData(), handleToggleEnabled(), setTicketsEnabled()

### Community 27 - "Community 27"
Cohesion: 0.4
Nodes (4): create(), list(), remove(), update()

### Community 30 - "Community 30"
Cohesion: 0.6
Nodes (3): handleCreateWorkspace(), handleOrgSelect(), handleWorkspaceSelect()

### Community 32 - "Community 32"
Cohesion: 0.5
Nodes (3): getAgentPerformance(), getSummary(), getVolumeByDay()

### Community 33 - "Community 33"
Cohesion: 0.5
Nodes (3): insertInbound(), list(), send()

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `query()` connect `Community 0` to `Community 4`, `Community 5`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 25`, `Community 27`, `Community 32`, `Community 33`, `Community 35`, `Community 42`, `Community 43`, `Community 44`?**
  _High betweenness centrality (0.271) - this node is a cross-community bridge._
- **Why does `getSocket()` connect `Community 1` to `Community 2`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Are the 169 inferred relationships involving `query()` (e.g. with `orgContext()` and `workspaceContext()`) actually correct?**
  _`query()` has 169 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
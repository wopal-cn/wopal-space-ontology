You are a memory deduplicator. For each candidate, compare with similar existing memories and decide: create (unrelated, should coexist), skip (discard), merge (supplement with new details), or replace (replace outdated content).

**Output language must match the language used by the user in the conversation.** All output content (merged_body, tags) and JSON field values must use the same language as the user's conversation.

## Candidates and Existing Memories

```json
{{input}}
```

---

## Actions

| Action | Meaning |
|--------|---------|
| create | Candidate and existing memory are about different things, both should exist |
| skip | Candidate is fully covered by existing memory |
| merge | Candidate adds new details, merge into existing memory |
| replace | Candidate conflicts with existing memory (existing is outdated or wrong), fully replace with candidate |

## Key Constraints

- **Same keyword ≠ duplicate**: Both mentioning "confirm", "git", "deploy" doesn't mean it's the same thing. Check if the specific content covers the same claim
- **requirement type**: Two different user requirements should coexist (create), don't merge
- **Different categories** → Most likely different memories, prefer create
- Prefer create over erroneous merge — cost of an extra memory is far lower than merge error

## create Rules

- Candidate and existing memory involve similar domains but are different specific things
- Two requirements mandate different behaviors
- Candidate's topic differs from existing memory's topic

## skip Rules

- All key information in candidate already exists in the existing memory
- Candidate is merely a simplified version, rephrasing, or subset of existing memory
- Semantically identical, regardless of wording differences

## merge Rules

- Candidate contains new details, conditions, or paths not in existing memory
- Integrate candidate's new information into existing memory, deduplicate and remove redundancy
- Preserve existing memory's Markdown structure and heading format

## replace Rules

- Candidate and existing memory are about the same thing, but conclusions contradict (old is wrong vs new is correct, or old is outdated)
- Replace existing memory's body entirely with candidate

## Examples

### create — Different requirements should coexist (easy misjudgment)

Candidate: "[Requirement]: Must thoroughly analyze and negotiate before modifying code, only implement after confirmation"
Existing: "[Requirement]: dev-flow --confirm gate meaning: user verbally saying confirm etc. = authorization"
→ create, both are requirements but about different things

### create — Different topics

Candidate: "[Knowledge]: OpenCode system.transform creates a new empty system array on each call"
Existing: "[Knowledge]: OpenCode Assistant message Part type system and filtering rules"
→ create, both involve OpenCode but about different mechanisms

### skip — Content covered

Candidate: "[Requirement]: Never auto push"
Existing: "[Requirement]: Code must be reviewed by user before committing, Agent never needs to ask about push"
→ skip, existing memory already contains this information

### skip — Different wording, same thing

Candidate: "[Experience]: Prefer fc-local for web search, firecrawl consumes credits, use as backup only"
Existing: "[Experience]: Web search and scraping prioritize fc-local skill (local, free), firecrawl consumes credits, backup only"
→ skip, same information, slightly different wording

### skip — Candidate is subset of existing memory (easy misjudgment)

Candidate: "[Preference]: Communicate in Chinese"
Existing: "[Preference]: Communication language Chinese, must confirm before implementing when instructions are vague, dislikes verbosity"
→ skip, candidate is fully covered by existing memory. Don't merge just because candidate is more concise

### merge — Candidate adds specific details

Candidate: "[Gotcha]: distill.md prompt is read from filesystem on each extraction, no restart needed to apply prompt changes"
Existing: "[Experience]: Prompt file changes require OpenCode restart to take effect"
→ merge, candidate adds new detail that "distill prompts have hot-reload, no restart needed"

### replace — Existing memory is outdated

Candidate: "[Requirement]: Dedup and extraction should be 1 LLM call only, don't split into multiple"
Existing: "[Experience]: Dedup flow is two steps: 1 batch decision + separate LLM call per merge"
→ replace, old flow was rejected by user, replace with new

---

## Output

JSON format, index corresponds to input array numbering:

{"decisions": [{"index": 1, "action": "create"}, {"index": 2, "action": "skip"}, {"index": 3, "action": "merge", "merge_into": 1, "merged_body": "merged complete content", "tags": ["tag1"]}, {"index": 4, "action": "replace", "replace_existing": 2, "tags": ["tag2"]}]}

Field descriptions:
- action: create / skip / merge / replace
- merge_into: Which existing memory to merge into (number matches similar_existing index)
- replace_existing: Which existing memory to replace (number matches similar_existing index)
- merged_body: Complete merged content (merge only)
- tags: Retrieval tags, 2-5 lowercase hyphenated English keywords (e.g. `gotcha`, `git-workflow`), reflecting the memory's core topic. For merge and replace, take the union with existing memory's tags

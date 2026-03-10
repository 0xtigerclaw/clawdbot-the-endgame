# LinkedIn Content Pipeline

## Mandatory Flow

```
Scout (Curie) → Writer (Ogilvy) → Editor (Carnegie) → Visual (Ive)
```

> **This is a mandatory sequential flow. No step can be skipped.**

---

## Pipeline Stages

### Stage 1: Scout (Curie)
**Input**: Topic request or scheduled scan  
**Output**: `candidate_brief` (3-7 per cycle)

- Scans sources across coverage buckets
- Verifies with primary sources
- Scores feature_score and originality_potential_score
- Packages structured briefs with proof points

**Handoff Condition**: `feature_score >= 7` AND `originality_potential_score >= 7`

---

### Stage 2: Writer (Ogilvy)
**Input**: `candidate_brief` from Scout  
**Output**: `post_bundle` (1-3 drafts per brief)

- Converts brief into LinkedIn post drafts
- Applies author voice profile
- Includes originality signals
- Adds cold-reader bridge line
- Ends with forced-choice question

**Handoff Condition**: All `compliance_checks` pass

---

### Stage 3: Editor (Carnegie)
**Input**: `post_bundle` from Writer + `candidate_brief`  
**Output**: `editor_bundle` (finalized drafts + distribution kit)

- Polishes for cold-network engagement
- Adds hook variants (safe, strong, spicy)
- Creates distribution kit:
  - First comment seed
  - Outreach targets (5-10)
  - DM templates
  - Posting windows
- Scores editorial_clarity, social_friction, narrative_pull

**Handoff Condition**: All three scores >= 7

---

### Stage 4: Visual (Ive)
**Input**: `editor_bundle` from Editor  
**Output**: `visual_bundle` (Veo payload + overlay payload)

- Creates loopable 5-8 second motion visual concept
- Selects template (stack_shift, this_vs_that, proof_point_pulse, decision_fork, mechanism_loop)
- Generates Veo-ready JSON prompt
- Creates overlay payload for text overlays
- Runs QA checks

**Publish Condition**: All `qa_checks` pass

---

## Flow Enforcement

```json
{
  "pipeline_id": "linkedin_content",
  "version": "2.0",
  "mandatory": true,
  "stages": [
    {
      "stage": 1,
      "agent": "Curie",
      "skill": "Scout",
      "input_type": "topic_request",
      "output_type": "candidate_brief",
      "next_stage": 2
    },
    {
      "stage": 2,
      "agent": "Ogilvy",
      "skill": "Writer",
      "input_type": "candidate_brief",
      "output_type": "post_bundle",
      "requires_stage": 1,
      "next_stage": 3
    },
    {
      "stage": 3,
      "agent": "Carnegie",
      "skill": "Editor",
      "input_type": "post_bundle",
      "output_type": "editor_bundle",
      "requires_stage": 2,
      "next_stage": 4
    },
    {
      "stage": 4,
      "agent": "Ive",
      "skill": "Visual",
      "input_type": "editor_bundle",
      "output_type": "visual_bundle",
      "requires_stage": 3,
      "next_stage": null
    }
  ],
  "skip_allowed": false,
  "parallel_allowed": false
}
```

---

## Task Assignment Rules

1. **LinkedIn tasks MUST start with Scout (Curie)**
2. **Writer (Ogilvy) cannot run without Scout output**
3. **Editor (Carnegie) cannot run without Writer output**
4. **Visual (Ive) cannot run without Editor output**
5. **No agent can bypass the pipeline**

---

## Triggers

| Trigger | Starts At |
|---------|-----------|
| Manual topic request | Scout |
| Daily scan (scheduled) | Scout |
| Weekly sweep (scheduled) | Scout |
| Brief ready | Writer |
| Draft ready | Editor |
| Editor bundle ready | Visual |

---

## Error Handling

- If Scout produces < 3 candidates: Flag in `risks_and_unknowns`, proceed with best 1-2
- If Writer `compliance_checks` fail: Return to Writer for revision
- If Editor scores < 7: Return to Editor for tightening
- If `fact_integrity.new_claims_added = true`: Reject and return to Writer
- If Visual `qa_checks` fail: Simplify visual concept and retry

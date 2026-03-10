# Form Filler Pipeline

## Mandatory Flow

```
Application Recon (Porter) → Essay Generation (Porter)
```

> **This is a mandatory sequential flow.** 
> **Each step runs ONE AT A TIME via the Gateway.**

---

## Pipeline Stages

### Stage 1: Application Reconnaissance (Porter - Analyst)
**Input**: Application URL  
**Output**: `contextProfile` (JSON: archetype, audience, tone, values)

- Browses the target URL
- Identifies organization type and key values
- Stores result in `form_templates`

**Handoff Condition**: Profile generated and saved

---

### Stage 2: Essay Generation (Porter - Writer)
**Input**: Essay question + word limit + contextProfile  
**Output**: `draft_essay` (text)

- Uses `Generic/App-Specific` prompt structure
- Injects RAG knowledge (Company) AND Context Profile (Target)
- Generates 1st person plural draft

**Handoff Condition**: Essay generated

---

## Flow Enforcement

```json
{
  "pipeline_id": "form_filler",
  "version": "2.0",
  "mandatory": true,
  "stages": [
    {
      "stage": 1,
      "agent": "Porter",
      "skill": "App Recon",
      "input_type": "url",
      "output_type": "contextProfile",
      "next_stage": 2
    },
    {
      "stage": 2,
      "agent": "Porter",
      "skill": "Essay Writing",
      "input_type": "essay_question",
      "output_type": "draft_essay",
      "requires_stage": 1,
      "next_stage": null
    }
  ],
  "skip_allowed": true, 
  "parallel_allowed": false
}
```

> **Note**: Stage 1 is optional if a profile already exists.

---

## Key Differences from LinkedIn Pipeline

| Aspect | LinkedIn | Form Filler |
|--------|----------|-------------|
| Agents | Curie → Ogilvy → Carnegie → Ive | Porter (Analyst) → Porter (Writer) |
| Parallelism | None | None |
| Output type | Social post + visual | Essay text only |
| RAG source | RSS/Scout feeds | `company_knowledge` (Voyage) |
| Memory concern | Low (short output) | High (multiple essays) |
| Execution | Sequential, one task | Sequential, one field at a time |

---

## Memory Safety Rules

1. **ONE essay at a time** — never batch-generate all fields simultaneously
2. **Context truncation** — limit knowledge chunks to 8k chars
3. **No server browser spawning** — live fill happens via Chrome extension in user tab
4. **Polling architecture** — Frontend controls the pace

---

## Triggers

| Trigger | Starts At |
|---------|-----------|
| Single essay question (Test Generation) | Porter |
| Template "Generate Draft" button | Porter (one field at a time) |
| Extension "Auto Fill" / "Run All" | Extension + `/api/form-filler/live-suggest` |

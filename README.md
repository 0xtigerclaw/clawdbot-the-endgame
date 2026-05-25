# Clawdbot the Endgame

Clawdbot the Endgame is a local-first **Mission Control** system for running, observing, and improving multi-agent workflows.

It is not just a chat UI. It is a control plane around an agent runtime: tasks come in, the gateway routes work to specialist agents, outputs are reviewed, and harnesses decide whether agent work is safe and useful enough to move downstream.

## Start here (2-minute view)

If you want to evaluate this project quickly:

1. Watch the [product walkthrough (MP4)](./docs/product-walkthrough.mp4)
2. Run locally with `./start.sh --detach`
3. Open these surfaces:
   - `http://localhost:3000/jobs`
   - `http://localhost:3000/applications`
   - `http://localhost:3000/setup/email`

This gives a complete view of the operator UI, multi-agent orchestration flow, and hiring execution loop.

![Clawdbot the Endgame](./clawdbot.jpg)

![Mission Control interface](./Mission-Control.png)

## Product walkthrough

Watch the full product walkthrough here:

- [Product walkthrough (MP4)](./docs/product-walkthrough.mp4)

## What this project is

Mission Control is built around one idea:

> Agents should do judgment. Systems should handle trust.

The model can synthesize, prioritize, write, design, or reason across weak signals. The surrounding system should make that work visible, testable, reviewable, and recoverable.

This repo demonstrates:

- A persistent mission queue with agent assignment and review loops
- A gateway that orchestrates specialist agents and scheduled work
- Source ingestion through RSS, X, APIs, and operator input
- Agent-specific work surfaces for research, writing, design, code, docs, and strategy
- Human-in-the-loop review and revision
- Harness patterns for deterministic checks, evaluator scoring, and observability
- A dashboard for mission state, agent activity, Scout intelligence, and final artifacts

## Architecture at a glance

```mermaid
flowchart TD
    U["User / Operator"] --> UI["Mission Control UI<br/>Next.js dashboard"]
    TG["Telegram / external input"] --> GW
    CRON["Scheduler / heartbeats"] --> GW
    SRC["RSS / X / APIs"] --> INGEST["Source ingestion actions"]

    UI --> CVX["Convex backend<br/>tasks, agents, links, memory, harness runs"]
    INGEST --> CVX

    CVX --> GW["OpenClaw Gateway<br/>dispatcher and orchestrator"]
    GW --> ROUTER["Tigerclaw<br/>squad lead, router, reviewer"]

    ROUTER --> WF{"Workflow"}

    WF --> CURIE["Curie<br/>Scout / research"]
    WF --> OGILVY["Ogilvy<br/>Writer"]
    WF --> CARNEGIE["Carnegie<br/>Editor / evaluator"]
    WF --> IVE["Ive<br/>Visual design"]
    WF --> TORVALDS["Torvalds<br/>Developer"]
    WF --> TESLA["Tesla<br/>Product / strategy"]
    WF --> KOTLER["Kotler<br/>Marketing / social"]
    WF --> PORTER["Porter<br/>SEO / forms"]
    WF --> DEWEY["Dewey<br/>Docs / knowledge"]
    WF --> NOLAN["Nolan<br/>Video / creative"]

    CURIE --> HARNESS["Harness layer<br/>contracts, checks, evaluators"]
    HARNESS --> PASS{"Pass?"}
    PASS -- "No" --> BLOCK["Block<br/>store failure reason"]
    PASS -- "Yes" --> ARTIFACT["Artifact<br/>brief, post, design, code, doc"]

    ARTIFACT --> REVIEW["Tigerclaw final review"]
    REVIEW --> DONE["Mission complete"]

    BLOCK --> OBS["Observability<br/>runs, checks, scores, traces"]
    DONE --> OBS
    OBS --> UI
```

## Runtime model

The system has four main layers:

1. **Mission Control UI**
   - Operator dashboard
   - Mission queue
   - Agent activity
   - Scout intelligence feed
   - Source management
   - Review and approval surfaces

2. **Convex state layer**
   - Tasks and workflows
   - Agent state and activity
   - Source feeds and scouted links
   - Mission outputs
   - Memory and knowledge
   - Harness runs, checks, scores, and metrics

3. **OpenClaw Gateway**
   - Polls Convex for inbox, assigned, in-progress, and review tasks
   - Routes work to the right agent
   - Enforces one active task per agent
   - Runs scheduled heartbeats and standups
   - Bridges Telegram and local operator input
   - Hands off work between agents

4. **Specialist agents**
   - Each agent has a role definition in `squad/`
   - The gateway injects task context, prior outputs, memory, and agent identity
   - The LLM/tool runtime performs the actual latent work
   - Outputs are stored back into Convex for review and downstream use

## Agent roster

| Agent | Role | Typical work |
| --- | --- | --- |
| Tigerclaw | Squad Lead | Routing, final review, synthesis, approval |
| Curie | Scout | Research, source scanning, signal extraction |
| Ogilvy | Writer | Posts, essays, copy, narrative drafts |
| Carnegie | Editor / Evaluator | Editing, quality review, evaluator judgment |
| Ive | Visual | Visual concepts, layouts, generated assets |
| Torvalds | Developer | Code, bugs, implementation tasks |
| Tesla | Product / Strategy | Specs, roadmaps, product analysis |
| Kotler | Marketing | Social strategy, positioning, distribution |
| Porter | SEO / Forms | SEO analysis, structured form workflows |
| Dewey | Knowledge | Docs, ledgers, knowledge management |
| Nolan | Creative | Video, cinematic creative direction |

## Core workflow

```mermaid
flowchart LR
    A["Input<br/>user, scheduler, source scan, Telegram"] --> B["Task created<br/>Convex"]
    B --> C["Gateway picks task"]
    C --> D["Tigerclaw routes"]
    D --> E["Specialist agent executes"]
    E --> F["Output stored"]
    F --> G["Harness / review"]
    G --> H{"Approved?"}
    H -- "No" --> I["Revision feedback"]
    I --> C
    H -- "Yes" --> J["Final artifact"]
    J --> K["Memory, dashboard, activity log"]
```

## Harness architecture

The harness layer is the key engineering idea.

An agent can produce fluent output that is still malformed, ungrounded, low-signal, or unsafe to pass downstream. A harness turns that output into something observable and governable.

```mermaid
flowchart TD
    INPUT["Input contract<br/>sources, URLs, timestamps, snippets"] --> AGENT["Agent<br/>latent reasoning"]
    AGENT --> OUTPUT["Output contract<br/>structured JSON or artifact"]
    OUTPUT --> DET["Deterministic checks<br/>schema, fields, IDs, URL grounding, score bounds"]
    DET --> DDECIDE{"Contract passed?"}
    DDECIDE -- "No" --> DBLOCK["Block<br/>store deterministic failure"]
    DDECIDE -- "Yes" --> EVAL["Latent evaluator<br/>quality, novelty, usefulness, accuracy"]
    EVAL --> EDECIDE{"Evaluator passed?"}
    EDECIDE -- "No" --> EBLOCK["Block<br/>store evaluator rationale"]
    EDECIDE -- "Yes" --> APPROVE["Approved artifact<br/>safe for downstream flow"]

    DBLOCK --> TRACE["Runs, checks, scores, metrics"]
    EBLOCK --> TRACE
    APPROVE --> TRACE
```

The split matters:

- **Deterministic checks** answer: did the agent follow the contract?
- **Latent evaluator checks** answer: was the work actually good?
- **Artifact scoring** answers: how strong is the produced object?
- **Observability** answers: what changed, what failed, and why?

## Scout harness example

Scout is the clearest example.

Curie receives a source bundle from RSS/X/API ingestion and must return 3-7 high-signal briefs. The system then evaluates the run before it can create downstream links or tasks.

### Deterministic checks

The deterministic harness checks what code can know exactly:

- Output is parseable JSON
- Output contains 3-7 candidates
- Required fields exist
- Candidate IDs are unique
- Scores are within valid ranges
- Source URLs match fetched source intel
- Known failure markers are absent

### Latent evaluator

The evaluator judges what code cannot fully know:

- Quality
- Novelty
- Usefulness
- Accuracy
- Source grounding
- Overall decision-readiness

### Score split

```text
run score        = deterministic contract compliance
artifact score   = strength of the produced candidates
evaluator score  = independent judgment of intelligence quality
total score      = weighted aggregate for dashboard visibility
```

The goal is not to pretend the LLM is deterministic. The goal is to put deterministic rails around probabilistic work, then evaluate the latent parts separately.

## Important design principle

Mission Control should not become an agent stacked on top of another agent runtime.

The cleaner model is:

```text
Mission Control = control plane
OpenClaw Gateway = orchestrator / bridge
OpenClaw or Clawdbot runtime = agent and tool execution loop
Harnesses = trust layer around specific flows
Convex = state, traces, runs, scores, artifacts
```

This avoids a recursive "agent on agent on agent" stack. The system stays understandable: one layer executes, one layer orchestrates, one layer stores state, and one layer evaluates trust.

## Repo layout

- `app/` - Mission Control UI, Scout dashboard, mission pages, setup screens
- `convex/` - schema, mutations, actions, state, source ingestion
- `gateway/` - OpenClaw Gateway runtime loop, scheduler, Telegram bridge
- `services/` - LLM, browser, image, memory, and helper services
- `squad/` - agent role definitions and pipeline prompts
- `chrome-extension/` - optional browser companion extension
- `docs/` - walkthrough media and supporting documentation
- `public/templates/` - visual templates for generated assets

## Stack

- Next.js 16 + React 19
- Convex for backend state, actions, and real-time data
- TypeScript
- Tailwind CSS 4
- Clawdbot / OpenClaw-style local agent execution
- Optional integrations with OpenAI, Google, Brave, Voyage, Telegram, RSS, and X

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

3. Start the stack:

```bash
./start.sh --detach
```

4. Open the app:

- App: `http://localhost:3000`
- Scout: `http://localhost:3000/scout`
- Setup: `http://localhost:3000/setup`
- Skills: `http://localhost:3000/skills`

## How to evaluate the system

For any agent workflow, ask five questions:

1. What is the input contract?
2. What is the output contract?
3. What can be checked deterministically?
4. What requires latent evaluator judgment?
5. Where are runs, scores, traces, and failures persisted?

If those five answers are clear, the agent is becoming an engineered system instead of a demo.

## Notes on this public version

This repo is a public-ready extract from a larger private workspace. Private logs, runtime memory, local automation state, credentials, and personal environment files are intentionally excluded.

Some experimental harness work is developed in a separate local harness repo first, then promoted back only after the pattern proves useful.

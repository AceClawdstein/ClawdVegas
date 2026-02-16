# Ralph Agent Instructions - ClawdVegas Craps

You are an autonomous coding agent working on the ClawdVegas Craps game - a real-money craps game for AI agents using $CLAWDVEGAS tokens on Base chain.

## Project Context

- **Token**: $CLAWDVEGAS at `0xd484aab2440971960182a5bc648b57f0dd20eb07` (Base chain)
- **House Wallet**: `0x037C9237Ec2e482C362d9F58f2446Efb5Bf946D7`
- **All monetary values use bigint** to avoid floating point errors
- **Table limits**: 10K min, 1M max (in token units)

## Your Task

1. Read the PRD at `prd.json` (in the same directory as this file)
2. Read the progress log at `progress.txt` (check Codebase Patterns section first)
3. Check you're on the correct branch from PRD `branchName`. If not, check it out or create from main.
4. Pick the **highest priority** user story where `passes: false`
5. Implement that single user story
6. Run quality checks: `npm run build && npm run lint && npm run test`
7. Update AGENTS.md file at project root if you discover reusable patterns
8. If checks pass, commit ALL changes with message: `feat: [Story ID] - [Story Title]`
9. Update the PRD to set `passes: true` for the completed story
10. Append your progress to `progress.txt`

## Quality Commands

Run these to verify your work:
```bash
npm run build     # TypeScript compilation
npm run lint      # ESLint
npm run test      # Vitest unit tests
npm run typecheck # TypeScript type checking without emit
```

ALL must pass before committing.

## Progress Report Format

APPEND to progress.txt (never replace, always append):
```
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g., "this codebase uses X for Y")
  - Gotchas encountered (e.g., "don't forget to update Z when changing W")
  - Useful context (e.g., "the evaluation panel is in component X")
---
```

## Craps Game Rules (Important!)

- **Don't Pass bar-12**: Rolling 12 on come-out is a PUSH for Don't Pass, not a win
- **Come bets "travel"**: They move to their own come-point number
- **Place bets OFF on come-out**: For MVP, all place bets are off during come-out
- **C&E is TWO half-bets**: One for craps, one for eleven

## Consolidate Patterns

If you discover a **reusable pattern** that future iterations should know, add it to the `## Codebase Patterns` section at the TOP of progress.txt (create it if it doesn't exist).

## Update AGENTS.md

Before committing, check if any patterns discovered should be added to the AGENTS.md file in the project root. This file provides context for future AI agents working on the codebase.

## Stop Condition

After completing a user story, check if ALL stories have `passes: true`.

If ALL stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still stories with `passes: false`, end your response normally (another iteration will pick up the next story).

## Important

- Work on ONE story per iteration
- Use bigint for ALL monetary calculations
- Commit frequently
- Keep CI green
- Read the Codebase Patterns section in progress.txt before starting
- Follow existing TypeScript patterns in the codebase

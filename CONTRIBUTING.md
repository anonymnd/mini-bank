# Engineering workflow

Start with [the engineering standard](docs/engineering-standards.md) and
[architecture](docs/architecture.md). Keep this a single local application with
COBOL business rules and a narrow SQLite bridge.
The Angular frontend and loopback Python HTTP adapter add presentation/transport;
financial mutations must still use existing COBOL commands. Inquiry SQL is
read-only. See `docs/web-architecture.md` for the browser trust boundary.

## Change workflow

1. State the observable requirement, affected invariant and failure behavior.
2. Trace entry point -> COBOL service -> C bridge -> database -> result.
3. Extend the existing owner. Do not duplicate financial rules in the menu,
   importer or SQL bridge. Avoid abstractions for hypothetical future platforms.
4. For a bug, capture a failing regression before changing the implementation
   when practical. Use temporary databases and fictional data only.
5. Implement and run `make check` inside Ubuntu/WSL. Tests must not mutate demo
   or user databases. Use failure/concurrency tests for affected integrity rules.
6. Update contracts/runbooks and record material unverified behavior. Data-shape
   changes require an explicit migration and backup/restore proof.
7. Review the diff for security boundaries, error paths, compatibility and
   accidental secrets/data. Commit focused changes with a descriptive message.

## Review checklist

- Does the change meet a concrete requirement at its responsible layer?
- Do all entry points use the same business rules?
- Are C prototypes and COBOL CALL argument order, widths and termination aligned?
- Are user values bound as SQL parameters, with types validated at read boundaries?
- Can failure leave a partial posting, leak a handle, overwrite data or publish
  an incomplete artifact?
- Are technical errors distinct from stable business rejections?
- Are transactions short, with no prompts under locks and safe retry semantics?
- Do tests prove the meaningful success, rejection and recovery paths?
- Do setup instructions and CI invoke the same checks?
- Are remaining limits stated honestly, including mainframe work not executed?

`make check` is the local gate. The repository includes a GitHub Actions workflow
using that gate; branch protection/reviewer requirements must be configured on a
hosted repository separately. No remote CI or review approval is implied.

For frontend changes, run `npm run format:check`, `npm run typecheck`,
`npm audit --audit-level=high`, `npm run build` and `npm run test:e2e` inside
`frontend/`. Install test Chromium once with `npx playwright install chromium`.
Use typed reactive forms, accessible labels/native dialogs and authoritative
server state after mutations. Keep decimal strings at payment entry and integer
cents in data responses; do not duplicate financial calculations in TypeScript.

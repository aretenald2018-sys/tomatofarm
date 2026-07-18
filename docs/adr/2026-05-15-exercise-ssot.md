# ADR: Exercise catalog SSOT

Status: accepted and implemented.

## Decision

- `users/{owner}/exercises` is the editable exercise catalog SSOT.
- `CONFIG.DEFAULT_EXERCISES` is seed/migration input only. It is not merged back on every load.
- `MOVEMENTS` is movement taxonomy, not an exercise catalog.
- Equipment repositories own equipment and reference compatible `movementIds`; they do not duplicate exercises.
- Workout documents contain historical execution snapshots. Deleting a catalog item does not rewrite history.
- The canonical max-cycle plan owns benchmark selection. Legacy preset data is migration input only.

## Consequences

All picker, recommendation, benchmark, and history code uses the loaded exercise catalog through its public resolver. Seed, delete persistence, legacy migration, and history rendering require contract tests.

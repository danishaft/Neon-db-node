# @TODOS

The node now has focused contract tests and a live local n8n/PostgreSQL run.
Only external compatibility and release work remains.

- [ ] Run credential test, parameterized query, transaction rollback, and
      independent failure against a disposable current Neon Cloud project.
- [ ] Verify the published package in the oldest supported self-hosted n8n
      release before documenting a minimum n8n version.
- [ ] Add npm provenance and verify a clean install from the packed artifact.
- [ ] Add secret scanning to CI before accepting external contributions.

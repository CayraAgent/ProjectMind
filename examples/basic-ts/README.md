# Basic JS authentication fixture

The folder name comes from the original bootstrap; its current source is JavaScript. From a copy outside any parent Git repository:

```bash
git init
git add .
git -c user.name='Demo' -c user.email='demo@example.com' commit -m 'demo'
node /path/to/ProjectMind/apps/cli/src/index.ts verify
```

This example has an explicitly bound requirement and a real test. Remove `evidenceCommands` from the intent to see NOT_VERIFIED, or change login to accept an empty user to see failed evidence. CI runs the committed example through the actual composite Action. No fake typecheck/build scripts are used.

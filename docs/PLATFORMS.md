# Platform support — v0.1 development preview

ProjectMind's source CLI and deterministic core are tested on Linux and macOS with Node.js 24. Linux is additionally tested on the minimum supported Node.js major, Node.js 22.18+. Windows has a narrower preview surface, listed explicitly below.

| Surface | Linux | macOS | Windows |
| --- | --- | --- | --- |
| CLI scan, graph, intent contracts and change analysis | CI tested | CI tested | CI tested |
| Command execution, timeouts, MCP and end-to-end verification | CI tested | CI tested | Not yet claimed |
| ProofPack schemas and structured evidence parsing | CI tested | CI tested | CI tested |
| Git working-tree and base-ref analysis | CI tested | CI tested | CI tested |
| Development build and tests | Full suite | Full suite | Portable deterministic subset; the invalid-on-Windows newline-filename fixture is skipped |
| Composite GitHub Action | CI tested on Ubuntu | Not yet claimed | Not yet claimed |
| Preview package creation and consumer smoke | CI tested on Ubuntu | Not yet claimed | Not yet claimed |

Git and a supported Node.js runtime are required. Verification commands use the operating system's default shell, so reviewed `.projectmind/config.json` commands must be valid for the runner that executes them. ProjectMind normalizes repository paths in its portable contracts and does not follow source symlinks while scanning. Windows command-tree termination uses `taskkill`, but end-to-end Windows command execution remains outside the tested support claim until its runner lifecycle suite is stable.

This matrix documents tested behavior, not a promise of hermetic execution or support for every shell and filesystem combination. The development preview does not yet claim FreeBSD, containers without Git, Windows versions older than the active GitHub-hosted runner, or a native non-bash GitHub Action path.

# Platform support — v0.1 development preview

ProjectMind's source CLI and deterministic core are tested on Linux, macOS, and Windows with Node.js 24. Linux is additionally tested on the minimum supported Node.js major, Node.js 22.18+.

| Surface | Linux | macOS | Windows |
| --- | --- | --- | --- |
| CLI scan, graph, intent, evidence, verification and ProofPack | CI tested | CI tested | CI tested |
| Git working-tree and base-ref analysis | CI tested | CI tested | CI tested |
| Development build and tests | CI tested | CI tested | CI tested; the invalid-on-Windows newline-filename fixture is skipped |
| Composite GitHub Action | CI tested on Ubuntu | Not yet claimed | Not yet claimed |
| Preview package creation and consumer smoke | CI tested on Ubuntu | Not yet claimed | Not yet claimed |

Git and a supported Node.js runtime are required. Verification commands use the operating system's default shell, so reviewed `.projectmind/config.json` commands must be valid for the runner that executes them. ProjectMind normalizes repository paths in its portable contracts, does not follow source symlinks while scanning, and terminates timed-out Windows command trees with `taskkill`.

This matrix documents tested behavior, not a promise of hermetic execution or support for every shell and filesystem combination. The development preview does not yet claim FreeBSD, containers without Git, Windows versions older than the active GitHub-hosted runner, or a native non-bash GitHub Action path.

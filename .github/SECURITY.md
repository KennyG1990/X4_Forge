# Security Policy

X4 Forge is a **local-first** application: a desktop web app / VS Code (Antigravity)
extension that runs an HTTP server on `localhost:3000`, reads your X4: Foundations
install, and writes generated mod packages to your `extensions/` folder. That local
trust model is exactly why security reports matter — a flaw here touches files on
your machine.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

Only the latest release on `main` receives security fixes.

## What Counts as a Vulnerability

Reports we especially want:

- **Auth bypass** — reaching non-allowlisted API endpoints without the bearer token
  (`PUBLIC_READONLY_GETS` allowlist escape), or the agent API accepting requests it
  should 401.
- **Path traversal / arbitrary write** — any way to make the compiler, deployer,
  package importer, or `run_command` surface read or write outside the mod workspace
  and configured game directories.
- **Command injection** — via mod content, imported packages, XPath patches, t-files,
  or the agent `run_command` job endpoint.
- **API key / credential leakage** — server-held AI keys exposed to non-app-UI
  origins, keys written to logs or generated packages, or `x-custom-api-key`
  handling flaws.
- **Cross-origin abuse** — a malicious web page driving the localhost server
  (CSRF/DNS-rebinding against the local API).
- **Malicious mod packages** — a crafted `.zip`/extension import that executes code
  or escapes validation.

Out of scope: issues requiring an attacker who already has full local user access,
vulnerabilities in X4: Foundations itself, and Lua behavior inside the game's own
sandbox.

## Reporting a Vulnerability

Please **do not open a public issue** for security problems.

1. **Preferred:** [Report privately via GitHub Security Advisories](https://github.com/KennyG1990/X4_Forge/security/advisories/new).
2. **Alternative:** email **kennysmith.1911@gmail.com** with subject `[X4 Forge Security]`.

Include: version (or commit), platform (Forge app / VS Code extension / Antigravity),
reproduction steps, and impact. A proof-of-concept is welcome; live exploitation of
other users' machines is not.

## What to Expect

- Acknowledgement within **7 days**.
- An assessment (accepted / declined / needs info) within **14 days**.
- A fix on `main` for accepted reports as quickly as severity warrants, with credit
  in the release notes unless you prefer anonymity.

This is a solo-maintained noncommercial project (PolyForm Noncommercial 1.0.0) —
there is no bug bounty, but reports are taken seriously and honestly, per the
project's core rule: honesty over coverage.

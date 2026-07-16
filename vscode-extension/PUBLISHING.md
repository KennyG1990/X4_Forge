# Publishing an X4 Forge Studio update (the agreed flow)

The extension ships from the **`claude/x4-forge-vscode-poc-806ef5`** branch to the **Open VSX**
store (namespace `x4forge`). GitHub and the store are two SEPARATE destinations:
- **GitHub** = the source code (push commits to the branch).
- **Open VSX** = the installable app users get (a published `.vsix`). Pushing to GitHub does
  NOT update the store; you must publish.

## One-time facts
- Namespace: `x4forge` · extension id: `x4forge.x4-forge-studio`
- Store page: https://open-vsx.org/extension/x4forge/x4-forge-studio
- Publish token: `OVSX_PAT` in `F:\DEV_ENV\X4_Forge\.env.local` (gitignored, never in chat)
- Both IDEs use Open VSX by default (Antigravity, Cursor, VSCodium, Windsurf); stock VS Code
  does not (that would need the MS Marketplace, currently blocked on Azure billing).

## Steps to cut a new version
1. Commit the code changes (Ken commits + pushes to the branch).
2. Bump `version` in `vscode-extension/package.json` (e.g. 0.0.6 -> 0.0.7).
3. From `vscode-extension/`:
   ```
   npm run stage-app                                  # copy built product into app/
   npm run build                                      # compile the controller (out/)
   npx @vscode/vsce package --pre-release --allow-missing-repository
   ```
   (Run `npm run build` in the REPO ROOT first if the product bundle changed.)
4. Publish (token read from .env.local, never printed):
   ```
   npx ovsx publish x4-forge-studio-<version>.vsix -p <OVSX_PAT>
   ```
   `--pre-release` on publish is ignored for a prepackaged vsix — the pre-release flag is baked
   at PACKAGE time in step 3, so keep it there. To cut a STABLE (non-beta) release, drop
   `--pre-release` from step 3.
5. Verify: `https://open-vsx.org/api/x4forge/x4-forge-studio/versions` lists the new version.
   Indexing of the "latest" pointer can lag a few minutes; the version query confirms it's live.

## How users get the update
Installed-from-store extensions with Auto Update on pick it up automatically within a bit, or on
IDE reload. A SIDE-LOADED install (installed from a local .vsix) may not auto-update from the
store — reinstall from the store (Extensions view → search "X4 Forge" → the `x4forge` one →
Install) to move onto the store channel, then future updates are automatic.

## ⚠ Pre-release vs stable — the gotcha that bit us (2026-07-16)
Every version so far (0.0.4, 0.0.6) was published `--pre-release`, so the store has **NO stable
release**. Consequences we hit live:
- A plain `--install-extension x4forge.x4-forge-studio` (and the store's default "Install"
  button) FAILS with "Can't install release version ... it has no release version." Users must
  pass `--install-extension <id> --pre-release`, or click "Switch to Pre-Release Version" in the
  UI — friction most users won't figure out.
- A SIDE-LOADED install (Source: VSIX in the Extensions panel) does NOT auto-update from the
  store at all — it's pinned. Reinstall from the store to move onto the auto-updating channel.

RECOMMENDATION for adoption: publish STABLE (drop `--pre-release` at package time in step 3) so
"Install" just works for everyone. Keep the "beta" signal in the version number (0.0.x) and the
README, not in the pre-release channel. Switching is free: bump the version and package WITHOUT
`--pre-release`, then publish. Once a stable exists, normal installs and auto-update work
seamlessly; you can still cut pre-release builds alongside for testers.

## Notes
- Version must always increase (store rejects a re-publish of an existing version).

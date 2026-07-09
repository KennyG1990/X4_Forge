/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Selftest route registry (audit round 2, R1 — 2026-07-09). The house pattern gives
 * every deterministic engine a public GET selftest; those routes had grown into ~60
 * copies of the same 7-line try/json/catch boilerplate PLUS a hand-maintained
 * allowlist entry each (and the allowlist entry was the #1 forgotten step — the
 * documented "401 gotcha"). One registry: a name→oracle map registers the route AND
 * feeds the public allowlist, so a new selftest is ONE line and can't be half-wired.
 */

import type { Express } from "express";

export type SelftestFn = () => unknown;

export function registerSelftests(
  app: Express,
  publicGets: Set<string>,
  tests: Record<string, SelftestFn>,
  errorMessage: (e: unknown) => string,
): string[] {
  const registered: string[] = [];
  for (const [name, fn] of Object.entries(tests)) {
    const route = `/api/agent/${name}`;
    publicGets.add(`/agent/${name}`);
    app.get(route, (_req, res) => {
      try {
        return res.json(fn());
      } catch (error) {
        return res.status(500).json({ pass: false, error: errorMessage(error) || `${name} failed` });
      }
    });
    registered.push(name);
  }
  return registered;
}

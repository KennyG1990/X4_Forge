/**
 * Shared event-name derivation for contract transports.
 */

/** Lua/UI names for an endpoint's events, derived from namespace + id. */
export function endpointEventNames(namespace: string, id: string) {
  return {
    request: `${namespace}.${id}`,
    response: `${namespace}.${id}.response`,
    error: `${namespace}.${id}.error`
  };
}

import { test as base, type APIRequestContext, type Route } from '@playwright/test';

export { expect } from '@playwright/test';
export type { APIRequestContext, Page, Request, Response, Route, TestInfo } from '@playwright/test';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'fetch';
type Headers = Record<string, string>;
const wrappedContexts = new WeakMap<APIRequestContext, APIRequestContext>();

function closingHeaders(selected: Headers | undefined): Headers {
  return {
    ...Object.fromEntries(Object.entries(selected || {}).filter(([name]) => name.toLowerCase() !== 'connection')),
    Connection: 'close',
  };
}

function closingOptions<T extends { headers?: Headers }>(options: T | undefined) {
  const copied = { ...options };
  return { ...copied, headers: closingHeaders(copied.headers) };
}

/** Keep Playwright's context, defaults and cookie jar; retire each API connection. */
export function withClosingApiRequest(context: APIRequestContext): APIRequestContext {
  const existing = wrappedContexts.get(context);
  if (existing) return existing;
  const methods: Pick<APIRequestContext, HttpMethod> = {
    get: async (url, options) => context.get(url, closingOptions(options)),
    post: async (url, options) => context.post(url, closingOptions(options)),
    put: async (url, options) => context.put(url, closingOptions(options)),
    patch: async (url, options) => context.patch(url, closingOptions(options)),
    delete: async (url, options) => context.delete(url, closingOptions(options)),
    head: async (url, options) => context.head(url, closingOptions(options)),
    fetch: async (input, options) => {
      // Explicit headers, including {}, replace Request headers in Playwright.
      const copied = { ...options };
      const selected = copied.headers || (typeof input === 'string' ? undefined : input.headers());
      return context.fetch(input, { ...copied, headers: closingHeaders(selected) });
    },
  };
  const bound = new Map<PropertyKey, { source: unknown; value: unknown }>();
  const wrapped = new Proxy(context, {
    get(target, property) {
      if (Object.hasOwn(methods, property)) return Reflect.get(methods, property);
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      const cached = bound.get(property);
      if (cached?.source === value) return cached.value;
      const result = value.bind(target);
      bound.set(property, { source: value, value: result });
      return result;
    },
  });
  wrappedContexts.set(context, wrapped);
  wrappedContexts.set(wrapped, wrapped);
  return wrapped;
}

/** Route.fetch uses the same API pool; keep its own Request and replacement rules. */
export async function fetchRouteWithClosingConnection(
  route: Route,
  options?: Parameters<Route['fetch']>[0],
) {
  const copied = { ...options };
  const selected = copied.headers || route.request().headers();
  return route.fetch({ ...copied, headers: closingHeaders(selected) });
}

export const test = base.extend({
  request: async ({ request }, provide) => {
    await provide(withClosingApiRequest(request));
  },
});

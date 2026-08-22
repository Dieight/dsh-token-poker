/**
 * Host-side RPC adapter for the tokenPoker service.
 *
 * DSH's generic Connection RPC channel (`ctx.connection.rpc.handle`) only
 * exists on the *client* half — the host half of `@deepseek-ai/dsh-client-connection`
 * never provides a `connection` service. Host plugins therefore expose their
 * browser call surface by registering a `webServer` route, as dshmarket does.
 *
 * This module implements the same wire protocol as DSH's client-connection
 * `rpcFetchHandler` (client-request envelope → `{ type, rpcId, method, payload }`,
 * server-response envelope → `{ type, rpcId, result }`), so the browser half's
 * `createPokerApi` → `rpc.call("/token-poker", ...)` works unchanged:
 *
 *   POST /token-poker/game/get  { type:"client-request", rpcId, method:"game/get", payload }
 *   ← 200 { type:"server-response", rpcId, result:{ ok:true, value } }
 *
 * Types are declared structurally (minimal views of DSH's surfaces) so this
 * package stays portable — the DSH packages are not consistently published to
 * the public registry.
 */
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TokenPokerService } from "./index";

// ---- Wire protocol (aligned with @deepseek-ai/dsh-client-connection) -------

export const TOKEN_POKER_CHANNEL = "/token-poker";
const ENDPOINT_SEGMENT = /^[A-Za-z0-9_$.-]+$/;
const MAX_BODY_BYTES = 64 * 1024;

/** Client→host request envelope (structure of `clientRequestSchema`). */
const clientRequestSchema = z.object({
  type: z.literal("client-request"),
  rpcId: z.string(),
  method: z.string(),
  payload: z.unknown(),
});

// ---- Minimal structural views of DSH's host surfaces -----------------------

export interface RpcErrorView {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export type RpcResultView<T> =
  | { ok: true; value: T }
  | { ok: false; error: RpcErrorView };

export type ConnectionRpcHandler = (
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
) => Promise<RpcResultView<unknown>>;

/** Minimal view of `@deepseek-ai/dsh-host-webserver`'s register surface. */
export interface HostWebServerView {
  register(route: {
    kind: "exact" | "prefix";
    path: string;
    handler: (req: IncomingMessage, res: ServerResponse) => void;
  }): () => void;
}

// ---- Endpoint payload schemas -------------------------------------------------

const scopeSchema = z.object({ scope: z.string().optional() });
const joinSchema = z.object({
  scope: z.string().optional(),
  name: z.string().max(20).optional(),
});
const actionSchema = z.object({
  scope: z.string().optional(),
  action: z.enum(["fold", "check", "call", "bet", "allIn"]),
  amount: z.number().positive().optional(),
});

function ok(value: unknown): RpcResultView<unknown> {
  return { ok: true, value };
}

function err(message: string, code = "internal"): RpcResultView<unknown> {
  return { ok: false, error: { code, message, details: {} } };
}

/**
 * Build the channel handler that dispatches endpoints onto the service.
 * Unknown endpoints and schema failures fold into RPC error branches; service
 * errors become `internal` with their message preserved.
 */
export function createTokenPokerRpcHandler(
  service: TokenPokerService,
): ConnectionRpcHandler {
  return async (endpoint, payload) => {
    try {
      switch (endpoint) {
        case "game/get": {
          const { scope } = scopeSchema.parse(payload ?? {});
          return ok(await service.get(scope));
        }
        case "game/join": {
          const { scope, name } = joinSchema.parse(payload ?? {});
          return ok(await service.join(scope, name));
        }
        case "game/action": {
          const { scope, action, amount } = actionSchema.parse(payload ?? {});
          return ok(
            await service.action(scope, {
              action,
              ...(amount === undefined ? {} : { amount }),
            }),
          );
        }
        case "game/newHand": {
          const { scope } = scopeSchema.parse(payload ?? {});
          return ok(await service.newHand(scope));
        }
        case "game/leave": {
          const { scope } = scopeSchema.parse(payload ?? {});
          await service.leave(scope);
          return ok(null);
        }
        case "game/stats": {
          const { scope } = scopeSchema.parse(payload ?? {});
          return ok(await service.stats(scope));
        }
        case "game/rebuy": {
          const { scope } = scopeSchema.parse(payload ?? {});
          await service.rebuy(scope);
          return ok(null);
        }
        default:
          return {
            ok: false,
            error: {
              code: "bad-request",
              message: `unknown endpoint: ${endpoint}`,
              details: {},
            },
          };
      }
    } catch (e) {
      if (e instanceof z.ZodError) {
        return {
          ok: false,
          error: {
            code: "bad-request",
            message: e.issues.map((i) => i.message).join("; ") || "参数非法",
            details: {},
          },
        };
      }
      return err(e instanceof Error ? e.message : String(e));
    }
  };
}

// ---- webServer route registration (host side of the wire protocol) ----------

/** Path→endpoint extraction (same rules as client-connection). */
function endpointFromPath(channel: string, pathname: string): string | undefined {
  if (!pathname.startsWith(`${channel}/`)) return undefined;
  const endpoint = pathname.slice(channel.length + 1);
  if (
    endpoint
      .split("/")
      .some(
        (segment) =>
          segment === "" ||
          segment === "." ||
          segment === ".." ||
          !ENDPOINT_SEGMENT.test(segment),
      )
  ) {
    return undefined;
  }
  return endpoint;
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer | string) => {
      data += chunk;
      if (data.length > maxBytes) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

function fullResponse(rpcId: string, result: RpcResultView<unknown>) {
  return { type: "server-response", rpcId, result };
}

/**
 * Register the `/token-poker` prefix route on the host webServer, returning
 * the route disposer. The route speaks DSH's Connection RPC wire protocol.
 */
export function registerTokenPokerRoutes(
  webServer: HostWebServerView,
  service: TokenPokerService,
): () => void {
  const handler = createTokenPokerRpcHandler(service);
  return webServer.register({
    kind: "prefix",
    path: TOKEN_POKER_CHANNEL,
    handler: (req, res) => {
      void handleRpcRequest(req, res, handler);
    },
  });
}

async function handleRpcRequest(
  req: IncomingMessage,
  res: ServerResponse,
  handler: ConnectionRpcHandler,
) {
  try {
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST" });
      res.end();
      return;
    }
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    const endpoint = endpointFromPath(TOKEN_POKER_CHANNEL, pathname);
    if (endpoint === undefined) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const raw = await readBody(req, MAX_BODY_BYTES);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sendJson(res, 400, {
        type: "server-response",
        rpcId: null,
        result: {
          ok: false,
          error: { code: "bad-request", message: "body is not JSON", details: {} },
        },
      });
      return;
    }
    const envelope = clientRequestSchema.safeParse(parsed);
    if (!envelope.success) {
      sendJson(res, 400, {
        type: "server-response",
        rpcId: null,
        result: {
          ok: false,
          error: {
            code: "bad-request",
            message: "invalid client-request message",
            details: { issues: envelope.error.issues },
          },
        },
      });
      return;
    }
    const { rpcId, method, payload } = envelope.data;
    if (method !== endpoint) {
      sendJson(
        res,
        200,
        fullResponse(rpcId, {
          ok: false,
          error: {
            code: "bad-request",
            message: `method ${JSON.stringify(method)} does not match endpoint ${JSON.stringify(endpoint)}`,
            details: { issues: [] },
          },
        }),
      );
      return;
    }
    let result: RpcResultView<unknown>;
    try {
      result = await handler(endpoint, payload, new AbortController().signal);
    } catch (e) {
      result = err(e instanceof Error ? e.message : String(e));
    }
    sendJson(res, 200, fullResponse(rpcId, result));
  } catch (e) {
    sendJson(res, 500, {
      type: "server-response",
      rpcId: null,
      result: {
        ok: false,
        error: {
          code: "internal",
          message: e instanceof Error ? e.message : String(e),
          details: {},
        },
      },
    });
  }
}

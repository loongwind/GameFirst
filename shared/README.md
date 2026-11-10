# Pure shared TypeScript

`protocol/` contains command/reply/checkpoint DTOs and snapshot version fields.
`config-schema/` validates versioned JSON balance tables and cross-table rules.
`numeric/` supplies exact safe-integer/decimal-string amounts, progression,
equipment, pity and drop algorithms; `errors/` shares the wire error codes.
`protocol/telemetry.ts` defines the v1 event names and `telemetry.batch` contract.

This package has no runtime or development dependencies, DOM types, Cocos imports,
wx calls, Node globals, or credentials. Amount strings are JSON-safe; internal
BigInt arithmetic prevents exponential upgrade costs from losing precision.
These local algorithms and DTOs are not a server authority or anti-cheat boundary.

`config/balance.json` is the tuning source, with `balance.schema.json` constraints.
From `game/`, run `npm run config:export` after editing either JSON file. Tests and
builds reject stale `config/generated.ts`; importing the compiled package validates
the generated table. Unspecified tech/equipment prices and box probabilities are
initial test defaults, not approved retention balance.

From `game/`, run `npm run build:shared` to emit ESM and declarations into ignored
`shared/dist/`. The client's local npm dependency points to that output. The same
package can be consumed by a future server without importing client code.

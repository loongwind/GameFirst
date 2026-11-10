# Pure shared TypeScript

`protocol/` contains command/reply/checkpoint DTOs and snapshot version fields.
`config-schema/` reserves typed configuration schemas. `numeric/` supplies exact
nonnegative safe-integer operations; `errors/` shares the wire error codes.

This package has no runtime or development dependencies, DOM types, Cocos imports,
wx calls, Node globals, or credentials. Game balance and runtime schema validation
are later tasks. These interfaces are not a server implementation or input validator.

From `game/`, run `npm run build:shared` to emit ESM and declarations into ignored
`shared/dist/`. The client's local npm dependency points to that output. The same
package can be consumed by a future server without importing client code.

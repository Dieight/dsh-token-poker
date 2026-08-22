# dsh-token-poker

**token-poker 的 DeepSeek Harness 移植版** —— Agent 陪玩的虚拟筹码德州扑克（Earn Tokens 风格）。

> **衍生声明**：本项目是 [yzxoi/token-poker](https://github.com/yzxoi/token-poker)（其 README 声明 MIT）的独立移植仓库。牌局引擎与 AI 决策逻辑移植自上游；AI 对手改用 DSH LLM 服务；UI 以 React 18 重写并接入 DSH 主题；新增 DSH 插件层（host RPC 通道、设置命名空间、浏览器 bundle）。上游仓库当前未附带 LICENSE 文件，详见文末「版权」。

## 移植状态

| 层 | 状态 | 说明 |
|---|---|---|
| `src/engine/`（cards/evaluate/game/pots） | ✅ 已复用 | 纯 TS、零运行时依赖，原样拷贝 |
| `src/ai/`（roster/seeds/prompt/parse/fallback） | ✅ 已复用 | 纯 TS 决策逻辑，原样拷贝 |
| `src/runtime/manager.ts`（GameManager） | ✅ 已移植 | Synergy `context` 全部替换为依赖注入（StateStore / DecideFn / publish） |
| `src/runtime/persistence.ts` | ✅ 已移植 | `StoredState` + `StateStore` 接口，默认 `$DSH_HOME/data/dsh-token-poker/*.json` |
| `src/runtime/llm.ts` | ✅ 已移植 | `ctx.llm.stream` → `DecideFn`，失败/未配置自动回退启发式 |
| host 半体（Cordis 插件） | ✅ 可加载 | `apply()` 注册 `tokenPoker` 服务 + `/token-poker` webServer RPC route |
| client 调用通道 | ✅ 已打通 | client `createPokerApi` → `ctx.connection.rpc.call("/token-poker", ...)`；bundle 符合 `__ModuleLoader__` 契约 |
| client 半体（UI） | ✅ 已重写 | Solid.js 牌桌 → React 18（cards/action-bar/table-top/poker-page），经 `tokenPokerClient` 服务 + `conversation.view` slot 挂载，CSS 原样内联 |
| 测试 | ✅ 85 用例全绿（12 文件） | 引擎/AI + manager + host RPC + client api + host 冒烟 + React 渲染冒烟 + 真实 HTTP 端到端 + bundle 契约验证 |

## 安装（DSH）

```bash
dsh plugin --profile <name> add dsh-token-poker
```

npm 包安装后：host 半体按 `dsh.bundle.patch` 挂进对应 profile 的 bundle；Web 端按 `dsh.client` 加载浏览器 bundle（`conversation.view` Poker 标签页 + 设置页「Poker 设置」分区）。模型供应商与 AI 设置见「配置」。

## 常用命令

```bash
pnpm install
pnpm test         # vitest 引擎 + AI 单测
pnpm typecheck    # tsc --noEmit
pnpm build        # tsup → lib/{host,client}/index.js
```

## 下一步（host 端）

✅ 已完成：GameManager 移植为 Cordis `tokenPoker` 服务；AI 决策走 `ctx.llm.stream`；持久化走 `$DSH_HOME/data/dsh-token-poker` JSON 文件；浏览器调用通道经 `ctx.webServer.register` 挂载 `/token-poker` 前缀路由（实现 DSH 的 Connection RPC wire 协议，见下）。

## 下一步（client 端）

✅ 已完成：`src/client/` 下 React 18 组件（`cards.tsx` / `action-bar.tsx` / `table-top.tsx` / `poker-page.tsx` / `format.ts`）复刻 Solid.js 原版 UI 与交互（行动气泡、发牌/翻牌动画、下注滑条 + 底池预设、摊牌排行与筹码动画、轮询刷新）；`poker.css` 原样内联。client 插件入口把牌桌挂为 `conversation.view` 标签（id `poker`，order 20，右于 Context），经 `tokenPokerClient` 服务调 host。

✅ 真机实测（已跑通）：装进 `web` profile 后，host 插件、`/token-poker` RPC 路由、引擎 AI 回合、client bundle（`/plugins/dsh-token-poker/client.js`）全部验证正常。

✅ UI 验收 + 真实 AI：浏览器 Poker 标签正常对局；profile 已配 `llm.provider: scnet / model: DeepSeek-V4-Flash-0731`（对应 settings.yaml 的 SCNet provider），AI 对手走模型决策。

✅ 配色适配：适配 DSH 深/浅双主题（跟随系统）——页面背景/文字接入 DSH 的 `--dsw-alias-bg-base` / `--dsw-alias-label-*`，牌桌整套暗色规则改用 DSH 真实标记 `body[data-ds-dark-theme]`（原版 `html[data-synergy-color-scheme="dark"]` 在 DSH 不生效）。

## 调用通道说明

- Host：`src/host/rpc.ts` 的 `createTokenPokerRpcHandler` 把 `tokenPoker` 服务包装成 RPC handler（endpoint `game/get|join|action|newHand|leave|stats|rebuy`，payload 经 zod 校验，失败回 `bad-request`/`internal`）；`registerTokenPokerRoutes` 经 `ctx.webServer.register({ kind:"prefix", path:"/token-poker" })` 挂载路由。
  - ⚠️ **不要用 `ctx.connection.rpc.handle` 在 host 端注册 channel**——`connection` 服务只存在于 DSH 的 **client 半体**，host 端没有；DSH host 插件暴露浏览器调用面的正道是 `webServer.register`（dshmarket 同款）。
  - host 端路由实现了 DSH client-connection 的 RPC **wire 协议**（请求 `{ type:"client-request", rpcId, method, payload }`、响应 `{ type:"server-response", rpcId, result }`），所以 client 端 `rpc.call` 无需任何改动即可通信。
- Client：`src/client/api.ts` 的 `createPokerApi(rpc)` 把 `ctx.connection.rpc` 包装成类型化 `PokerApi`（纯逻辑，可单测）。
- Client bundle：构建为 `window.__ModuleLoader__.load({ id: "dsh-token-poker", factory })` 契约，DSH web 经 `/plugins/dsh-token-poker/client.js` 服务；`pnpm build && pnpm verify:client` 本地校验工厂 materialize 出 `{ name, inject, apply }`。
- 插件 `Config`：参照 dsh-context 用 `z.preprocess((v) => v ?? {}, ...)` 容忍 loader 对无 `config:` 条目传入的 `undefined`（否则 cordis 校验报 `expected object, received undefined`）。

## 配色适配（DSH 主题）

- DSH 主题 token：页面背景 `--dsw-alias-bg-base`（亮 `#fff` / 暗 `#151517`）、文字 `--dsw-alias-label-primary/secondary/tertiary`、边框 `--dsw-alias-border-l1/l2`。这些变量定义在 body 上并**随主题自动切换**（暗色由 `body[data-ds-dark-theme]` 覆盖），组件直接引用即可，无需自己写 `prefers-color-scheme`。
- `.tp-page` 背景/文字用 `var(--dsw-alias-bg-base, var(--color-background-base, #fafafa))` 结构（DSH → Synergy → 本地 fallback 三级回退）。
- 牌桌专属元素（felt/卡片/座位/按钮/摊牌结果）复用原版暗色规则，但前缀必须用 **`body[data-ds-dark-theme]`**——`html[data-synergy-color-scheme="dark"]` 是 Synergy 的标记，在 DSH 不生效。

## 配置

**推荐：DSH 设置页**（浏览器 → 设置 → **Poker 设置**）——插件在 DSH Settings 注册 `dsh-token-poker` 设置命名空间（schemastery schema，落盘 settings.yaml）：

| 项 | 说明 |
|---|---|
| 真实 AI 对手 | 开关；关闭则全部启发式 |
| 模型供应商 / AI 模型 | 下拉选择，**读 DSH 本地已配置的供应商目录**（与 Models 设置页同源：`connection.api.llm.providers` + settings describe）；模型列表跟随所选供应商 |
| 最大 Token / 温度 | AI 决策生成参数 |
| 会话隔离 | 每个会话一张独立牌桌（client 按会话 id 传 scope） |
| AI 思考超时 (ms) | 单次 LLM 决策超时 |

改动即时生效（host 通过 settings 命名空间 watcher 热切换 AI 决策器，无需重启）。

**兼容：`cordis.patch.yml` / profile patch**（seed 层，首次注册时作为初始值）：

| 键 | 说明 |
|---|---|
| `llm.provider` / `llm.model` | 指定 DSH 已注册的模型路由；不配则 AI 对手全走启发式策略 |
| `llm.maxTokens` / `llm.temperature` | 可选，AI 决策生成参数 |
| `stateDir` | 覆盖持久化目录（默认 `$DSH_HOME/data/dsh-token-poker`） |
| `scope` | 默认游戏作用域（默认 `default`） |

## 版权

代码源自 [yzxoi/token-poker](https://github.com/yzxoi/token-poker)（README 声明 MIT；上游仓库当前未附 LICENSE 文件）。本仓库以 [MIT](LICENSE) 发布，LICENSE 文件包含版权声明与衍生说明：牌局引擎、AI 决策逻辑与部分 UI 来自上游，上游 MIT 声明已保留。如需正式分发，仍建议先与上游确认授权文件。

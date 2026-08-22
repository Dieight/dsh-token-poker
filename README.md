# dsh-token-poker

**token-poker 的 DeepSeek Harness 移植版** —— Agent 陪玩的虚拟筹码德州扑克（Earn Tokens 风格）。

> **衍生声明**：本项目是 [yzxoi/token-poker](https://github.com/yzxoi/token-poker)（其 README 声明 MIT）的独立移植仓库。牌局引擎与 AI 决策逻辑移植自上游；AI 对手改用 DSH LLM 服务；UI 以 React 18 重写并接入 DSH 主题；新增 DSH 插件层（host RPC 通道、设置命名空间、浏览器 bundle）。上游仓库当前未附带 LICENSE 文件，详见文末「版权」。

## 功能

- 虚拟筹码德州扑克牌桌（React 18），随 DSH 深/浅主题自动配色
- AI 对手走 DSH LLM（默认 SCNet），失败自动回退启发式；引擎与 AI 决策移植自上游
- DSH 设置页「Poker 设置」分区：真实 AI 开关、供应商/模型下拉、生成参数、会话隔离

## 移植状态

| 层 | 说明 |
|---|---|
| 引擎 / AI 决策 | 纯 TS 逻辑，原样移植自上游 |
| GameManager | 依赖注入改造（StateStore / DecideFn / publish），持久化 `$DSH_HOME/data/dsh-token-poker/` |
| 浏览器调用通道 | host `webServer.register` `/token-poker` 路由 + client `rpc.call`（见下） |
| UI | Solid.js 牌桌重写为 React 18，CSS 原样内联 |
| 测试 | 85 用例：引擎/AI + manager + host RPC + client api + React 渲染 + 真实 HTTP 端到端 + bundle 契约 |

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

## 调用通道

- Host 经 `ctx.webServer.register` 挂载 `/token-poker` 前缀路由，实现 DSH client-connection 的 RPC wire 协议，client 的 `rpc.call` 无需改动即可通信。
- Client 用 `createPokerApi(ctx.connection.rpc)` 包装成类型化 `PokerApi`。
- 注意：host 端不能用 `ctx.connection.rpc.handle`（`connection` 服务只在 client 半体）；host 暴露浏览器调用面的正道是 `webServer.register`。
- Client bundle 按 `window.__ModuleLoader__` 契约构建，`pnpm build && pnpm verify:client` 校验 `{ name, inject, apply }` 契约。

## 配色适配

- 页面背景/文字用 DSH 主题 token（`--dsw-alias-bg-base` / `--dsw-alias-label-*`），随主题自动切换。
- 牌桌暗色规则用 DSH 真实标记 `body[data-ds-dark-theme]`（Synergy 的 `html[data-synergy-color-scheme="dark"]` 在 DSH 不生效）。

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

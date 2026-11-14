# STATUS — LOVE20 界面交接状态

> 采集时点：2026-11-11 20:05（Asia/Taipei）· 本仓 HEAD 以 `git rev-parse HEAD` 为准（本轮提交见 `git log -1`）· anvil 导出源 HEAD 见 `src/config/abis/manifest.json` · 本地链高度随时间增长，以 `cast block-number` 为准。每条事实都能由仓库、`cast` 或文中链接复核；无法确认处标「待核实」。

## 1. 一句话定位

LOVE20BSC 协议的纯静态、移动优先前端：无后端、无索引器、无第三方 API 调用，钱包只支持注入式。本 checkout（目录 `interface-dev-dsh`，`origin` = `LOVE20BSC/interface-dev`）是**三变体中的 dev**（链 31337 / 本地 anvil），当前处于 **M0 收尾**（身份漏斗 + 空投 + 通用兑换）：功能与验收、包体已闭环，发布尚未闭环；M1 未开始。三变体定义见 [ADR-0002](adr/0002-three-environment-injection.md) §4。

## 2. 当前状态

M0 范围共 6 项（[m0-scope](product/m0-scope.md)「范围内」）。✅ 完成 / 🔄 部分 / ⏳ 未做。

| # | M0 项 | 状态 | 证据（可复核） |
| --- | --- | --- | --- |
| 1 | 导航骨架 | ✅ | `src/app/navigation` + 5 个一级 tab（`/apps` 为功能页目录）；占位页 `src/pages/{gov,act,group,me}`；`7e9b03b` |
| 2 | 右上角连接按钮 | ✅ | [ADR-0003](adr/0003-identity-and-connect-button.md) §1；`src/widgets/connect-pill`；`6db99a4`（品牌字标/余额格式） |
| 3 | 新用户漏斗 | 🔄 | 首页/我的 NFT `ae607dd`；铸造身份 `484af93`+`49f63ce`；空投 `1a7074f`；通用兑换 `b3a2a7d`；**未做真机验收；e2e 已跑在独立 8555 自动化链（§6.1）** |
| 4 | 工程底座 | 🔄 | 分层+架构测试 `7e9b03b`；CI `7f9794a`；路由拆分 `7dc0949`；`.github/workflows/deploy.yml`；ABI manifest + `pnpm abis:check` 漂移门禁已补（ADR-0002 §3）；**缺口：HEAD 未推送，CI 未验证** |
| 5 | 一条命令起全栈 | ✅ | [ADR-0004](adr/0004-anvil-local-chain.md)；clean bootstrap 两次导出同 sha256；本次 `cast chain-id`=31337，`merkleRoot` 与快照一致；前端地址簿由 `pnpm sync:anvil` 生成 |
| 6 | 文案纪律落地 | ✅ | 所有中文进 `src/shared/config/copy.ts`（生成的错误文案除外），`src/architecture.test.ts` 强制；`7dc0949`；对照 [GLOSSARY](../GLOSSARY.md) |
| — | M0 验收报告 | ✅ | [m0-acceptance](product/m0-acceptance.md)（14 步 + 证据；§3 的 O1–O4 已修复复核，见 §3.1） |
| — | E2E 100 条 | ✅ | `e2e/*.spec.ts` 合计 100 个 `test()`；跑在独立 **8555** 链（`pnpm e2e` 自举/复用），按文件 `anvil_snapshot`/`anvil_revert` 隔离；**2026-11-14 第二轮整改（owner 逐条意见）合并后权威跑 95/95 全绿**（§6.1）。2026-11-14 兑换四缺陷修复新增 5 条：`e2e/swap-slow-wallet.spec.ts` 3 条（慢钱包 + 钱包 nonce 领先链上的「卡在钱包里」复现、修复后首笔一次成功、回执关闭后第二笔真实成交）+ `e2e/swap.spec.ts` 2 条（选择器互斥、到账侧余额）；该 3 个 spec 在本机 8583 验证链上 **16/16 + tx-recovery 1/1 全绿**（`E2E_PORT=4189`） |
| — | 首页身份读取状态 | ✅ | `loading` / `error` / `unconfigured` 不再只剩问候：骨架卡、错误卡 +「重试」、未部署说明；无身份与未选择卡不变；[m0-ux-spec](product/m0-ux-spec.md) §3.1 · `home-identity-error.png` / `home-no-identity.png` |
| — | 主题（浅色/深色） | ✅ | [ADR-0005](adr/0005-color-tokens-and-theme.md)；`/theme` 应用目录「设置」分类、`requires: null`；两套语义 token 在 `src/index.css`（深色币安配色 canvas `#0B0E11` / surface `#1E2329` / brand `#FCD535`）；`index.html` 首帧前应用 `love20:theme`；全仓清掉 49 处硬编码色类；配色三线 [three-line/theme.md](product/three-line/theme.md)；`e2e/theme-colors.spec.ts` |
| — | 应用·代币转账 | ✅ | `/transfer` 应用目录「代币」分类、`requires: null`（普通转账不依赖协议合约）；代币 = 原生币 / Launch 社区代币分页+搜索 / WETH / LP（地址簿 `pair`）/ 自定义 ERC20（校验 bytecode + 读 symbol/decimals）；收款方 = 地址或按身份 NFT（复用转让页的 ownerOf/memberId 解析 + ID 确认）；已知合约收款强制二次确认、任意合约警告；ERC20 直接 `transfer`（界面无授权）、原生币普通转账；`tx-watch` 90s 有界 + 重新查询/重新提交；回执可关闭留在原页；`shared/ui/token-picker.tsx` 从兑换页提升并由两页共用；三线校验 [three-line/transfer.md](product/three-line/transfer.md)（理论 先于实现 → 合约线 `scripts/verify/transfer-contract.mjs` 26/26 → 前端线 `e2e/transfer-numbers.spec.ts`）；截图 12 张 `transfer-{form,protection,receipt}-{light,dark}-{mobile,desktop}.png` |
| — | 应用·代币授权 | ✅ | `/approvals` 应用目录「代币」分类、`requires: null`（ERC20 `allowance`/`approve` 任意代币可用）；代币 = Launch 社区代币分页+搜索 / WETH / LP（地址簿 `pair`）/ 自定义 ERC20；常用合约 spender 来自地址簿（router / stake / vote / submit / mint / launch / hub / lpExecutor / batchTransfer / groupChat），逐项三态：未授权 / 长期授权（≥ 2^255，写 `maxUint256`）/ 具体额度（按 decimals 截断，1 wei 显示 `< 0.000001`）；每行「长期授权」「撤销」走确认 sheet + `tx-watch` 90s 有界（已长期授权的行按钮转禁用的「已长期授权」）；自定义 spender 查询/授权/撤销 + 非法地址即时提示；版面按 owner 2026-11-14 整改：代币行 → ①默认使用长期授权 → ②授权说明 → ③自定义地址 → ④常用合约列表（列表全部展开、不折叠；每行缩略合约地址 + 点击复制完整地址 + 「已复制」反馈；极长额度行内截断、全文进 `title`；不再出现「推荐」二字）；默认长期授权偏好写 `love20:tokenApprovalUseUnlimitedByDefault`；风险说明用普通人话；三线校验 [three-line/approvals.md](product/three-line/approvals.md)（理论先于实现 → 合约线 `scripts/verify/approvals-contract.mjs` 26/26 → 前端线 `e2e/approvals-numbers.spec.ts` 6 passed）；截图 12 张 `approvals-{list,confirm,custom}-{light,dark}-{mobile,desktop}.png` |
| — | 应用·批量转账 | ✅ | `/batch-transfer` 应用目录「代币」分类、`requires: batchTransfer`（地址簿未部署时入口禁用 + 人话原因，页面同态）；原生 / 单一 ERC20 切换；文本域逐行「地址 金额」（空白或逗号分隔、粘贴），逐行定位错误、重复地址按行号标出「与第 N 行重复」并阻止提交（不再合并）、合计对比我的余额、超余额禁提交、单行非法禁提交；ERC20 先 `approve(BatchTransfer, 合计)`（额度足够不重复授权，确认后重读额度再允许提交）；提交前 `nativeBalances`/`erc20Balances` 展示预余额，`tx-watch` 确认后重读并逐行显示 `+X` / 未变化 / 异常；`gasLimit` 默认 30000（原生）/ 60000（ERC20）+ 高级选项与 21000–1000000、单块 3000 万上限；收款方是合约时警告、禁止转给合约自身；整批原子在录入/回执/错误三处都写明「有一笔失败全部不到账」；三线校验 [three-line/batch-transfer.md](product/three-line/batch-transfer.md)（理论先于实现 06:34 → 合约线 `scripts/verify/batch-transfer-contract.mjs` 56/56 → 前端线 `e2e/batch-transfer-numbers.spec.ts`）；截图 12 张 `batch-transfer-{entry-errors,review,receipt}-{light,dark}-{mobile,desktop}.png` |
| — | 应用·流动性池 | ✅ | `/liquidity` 应用目录「代币」分类、`requires: router`（无 Router/Factory 时入口禁用 + 人话原因）；三块 = 添加 / 我的流动性 / 社区流动性查询（owner 2026-11-14 交互重做：页内去掉社区代币下拉，换代币用右上角社区切换）；添加区只有一个「智能模式」开关（默认开）：开 = 两侧都可填或只填一侧，Hub 自动配平，写入 `addLiquidityWithToken` / `addLiquidityWithNative`（需要时先授权给 Hub）；关 = 改一侧按池子比例自动填另一侧（只读联动，点另一侧可切换驱动侧），走 Router `addLiquidityETH`；Hub 缺失 / 空池自动降级并写明原因；输入后只留「预计获得 X 流动性凭证」，swap 段 / 实进池 / 最少进池收在默认折叠的「详情」，「已为网络手续费预留」只在点过「全部」原生币后出现；我的流动性读 pair `balanceOf`/`totalSupply` → 份额，**按 LP 数量**撤出（25/50/75/100% 只是快捷填充），只显示「预计收到约 X + Y」，LP 授权 + `removeLiquidityETH`；社区查询只给全局数据（交易对地址可复制、两侧储备、凭证总量、双向价格），无池明确写「这个代币还没有流动性池」；滑点默认 0.5%（0.01–50 校验）+ deadline 20 分钟；`tx-watch` 90s 有界 + 回执可关闭留在原页；三线校验 [three-line/liquidity.md](product/three-line/liquidity.md)（理论线 06:36 先于实现 → 合约线 `scripts/verify/liquidity-contract.mjs` 45/45 → 前端线 `e2e/liquidity-numbers.spec.ts` 7 passed）；截图 16 张 `liquidity-{add,mine,withdraw,empty}-{light,dark}-{mobile,desktop}.png` |
| — | 发布 interface-test | ✅ | 2026-11-14 发布 `1463501`（五个应用页 + anvil 外围合约 + 三线文档）；线上 200，`interface-test` 远端 `main` = 本仓 HEAD（其后若只有台账/文档提交，不重复发布）；dev 站同步部署 |
| — | M1 治理 | ⏳ | 未开工；[CI-001](contract-issues/001-no-member-round-index.md) Blocker 未解 |

**未完成清单（别误读为 done）**：三处真机体验、test/prod 地址簿填充（协议尚未在 BSC 测试网/主网部署，两个变体的五个应用页按「未配置」禁用入口）。e2e 已隔离到独立 8555 链（§6.1）；包体 prod 159.1 / dev 160.1 kB（2026-11-14 五个应用页合并后实测；dev 预算 161 = 160 + 1 kB 部署数据豁免，§6.2）；ABI manifest 与漂移门禁已补（§6.5）。

截图共 135 张（2026-11-14 `find docs/product/screenshots -name '*.png' | wc -l` 实测；下方分类为各任务新增时的记录）：home 7（含链不对药丸与身份读取错误卡）/ airdrop 6（含「还没到可铸造轮次」）/ mint 5 / my-nft 2 / swap 15（2026-11-14 兑换缺陷修复新增 `swap-token-excluded`、`swap-to-balance`、`swap-slow-wallet-{nonce-gap,pending,receipt}`、`swap-second-swap-receipt`）/ about 2 / apps 1 / me 1 / transfer 15（代币转账 12：`transfer-{form,protection,receipt}-{light,dark}-{mobile,desktop}.png`；转让抽屉 3）/ tx-recovery 1 / live 1 / 主题 12（`theme-{light,dark}-{home,apps,theme}-{mobile,desktop}.png`，2026-11-14）/ 代币授权 12（`approvals-{list,confirm,custom}-{light,dark}-{mobile,desktop}.png`，2026-11-14）/ 批量转账 12（`batch-transfer-{entry-errors,review,receipt}-{light,dark}-{mobile,desktop}.png`，2026-11-14）/ 流动性池 16（`liquidity-{add,mine,withdraw,empty}-{light,dark}-{mobile,desktop}.png`，2026-11-14），见 [`product/screenshots/`](product/screenshots/)。本次核对用到的文件：`home-identity-error.png`、`home-no-identity.png`、`swap-form.png`、`mint-form.png`、`airdrop-eligible.png`、[`live/interface-test-live-2026-11-11.png`](product/screenshots/live/interface-test-live-2026-11-11.png)。

## 3. 仓库与环境事实

### 3.1 三个仓库与部署（2026-11-11 实测）

| 仓库 | 是否存在 | 变体 / 链 | Pages |
| --- | --- | --- | --- |
| `LOVE20BSC/interface-dev` | 存在（`git ls-remote` 正常；本仓 `origin`） | dev / 31337 | <https://love20bsc.github.io/interface-dev/> 200，build id `mwb9t10g-85b4d354` |
| `LOVE20BSC/interface-test` | 存在（本仓另有 `test` remote） | test / 97 占位 | <https://love20bsc.github.io/interface-test/> 200，build id `mwb9werl-379de9b0` |
| `LOVE20BSC/interface` | **不存在**（`git ls-remote` 128 `Repository not found`；根站 404） | prod / 56 | 尚未部署 |

线上两站可访问但构建早于当前 HEAD（页面标题仍是旧品牌 `LOVE20`，现应为 `LOVE20协议`）。本地跟踪分支 `test/main` 停在 `8707b6a`，远端实际 `a217ddb`，一律以 `git ls-remote` 为准。

### 3.2 本地链与地址来源

- **两条链，别混**：`http://127.0.0.1:8545` 是**人工链**（开发者浏览器钱包连的链；自动化运行永不触碰），`http://127.0.0.1:8555` 是 **e2e 自动化链**（`pnpm e2e` 自举并复用，入口 `scripts/e2e-chain.mjs`）。两者都是 chainId **31337**；bootstrap 期间 automine（导出块高确定），结束后恢复 `--block-time 1`。链高随时间增长，不写死。
- 运行时状态按端口隔离：8545 保持平铺 `.anvil/`（当前 pid `13323`），8555 在 `.anvil/8555/`；`make stop PORT=8555` / `make clean PORT=8555` 只作用于 8555，反之亦然。
- **重启任何 anvil（尤其 8545）都会让浏览器钱包缓存的 nonce 失效**：已签名未上链的交易会永远 pending（2026-11-11 事故：账户 #1 钱包 nonce 68 vs 链上 nonce 3，页面卡在「确认中…」）。重启链后先在钱包里「重置账户活动」/清掉 pending，再重新发交易；自动化测试不要跑在人工链上。
- 地址唯一来源：`../anvil/export/deployments/anvil31337_dev.json`；前端副本、ABI、manifest 与快照全部由 `pnpm sync:anvil` 生成；ABI 源为 `../anvil/export/abis/*.json`。禁止手改前端地址簿，也不得以地址簿为目标反推 nonce。
- 本轮实测地址（clean bootstrap）：MemberNFT `0x610178dA211FEF7D417bC0e6FeD39F05609AD788`（seed 后 `totalSupply`=5，e2e 后 6）；首币 `0x8aCd85898458400f7Db866d53FCFF6f0D49741FF`（`symbol`=`TestLOVE20`，`name`=`TestLOVE20@TestWETH`）；AirdropDistributor `0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6`（`airdropInfo`=`merkleRoot 0x046a…c404` / `claimableFromRound 2` / `remainingAmount 5e26`，与内置快照一致）；Phase 因 nonce 前移改为 `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853`。前端 `deployment.blockNumber`=导出 `deployBlock`（2026-11-14 追加两个模块后为 34，此前 32，见下条）。
- 人工链起链：`make stop && make clean && make bootstrap`（≈45–50 s，8545）；重跑必须重新 clean，bootstrap 会拒绝复用旧链。之后 `pnpm sync:anvil`，有兄弟仓时 `pnpm abis:check`。
- e2e 链：`pnpm e2e` 首次在 8555 上执行 `make -C ../anvil bootstrap PORT=8555`（≈1 min），之后复用；需要重建时 `pnpm e2e:reset-chain`。**换端口不影响地址**：clean bootstrap 从 deployer nonce 0 开始，8555 的导出与提交的 `src/config/deployments/anvil31337_dev.json` 逐字节相同，不需要为 e2e 重新 `pnpm sync:anvil`。
- **地址归属不交叉**：`anvil/` 只拥有本地部署；test/prod 地址只能来自合约仓 `script/network/<chain>_<type>/`（当前 core/action 只有 `anvil31337_dev`）。`src/config/deployments/bscTestnet_test.json` 与 `bscMainnet_prod.json` 各有 24 个零地址槽 → 「未配置」，test/prod 构建不会显示假数据。
- **2026-11-14 追加 periphery/tools 两个模块（PORT=8556 clean bootstrap，未触碰 8545）**：既有 34 个地址逐键不变，只多出两项——`BatchTransfer`（地址簿 `batchTransfer`，工具的批量转账）`0xc3e53F4d16Ae77Db1c982e75a937B9f60FE63690`（部署块 33）、`LOVE20Hub`（地址簿 `hub`，构造只注入 Stake）`0x84eA74d481Ee0A5332c457a4d796187F6Ba67fEB`（部署块 34）；`deployBlock` 32 → 34。两次 clean bootstrap 的 `export/deployments/anvil31337_dev.json` sha256 均为 `9e811d4d719b96aaa51b707baef3bb9dbcd0a8118bf0e198aa5ca4e17fcbd44c`。ABI 从 `anvil/export/abis/` 经 `pnpm sync:anvil` 生成为 `src/config/abis/{batch-transfer,love20-hub}.ts`。

### 3.3 工具链（实测）

- **可用**：nvm Node **v24.12.0** + pnpm **11.5.1**（`package.json` engines `>=22.12.0`；CI 用 Node 24 + pnpm 11.5.1）。
- **不可用**：DSH 自带 Node **v24.21.0**（`~/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/bin/node`）。加载 rollup 原生二进制失败：`dlopen(.../@rollup/rollup-darwin-arm64/rollup.darwin-arm64.node) … code signature … different Team IDs`。同一 `.node` 在系统 Node 下加载正常。**install / build 一律用系统 Node，不要用 DSH 运行时。**
- 代码地图：`src/` 分层 `app → pages → widgets → features → entities → shared`，`domain`/`config` 为叶子；ESLint + `src/architecture.test.ts` 双重强制，详见 [README](../README.md) §Layout。
- 工作区：HEAD 以 `git rev-parse HEAD` 为准；本轮改动前工作区干净。`dist/`、`dist-*/`、`.build-id`、`.research/` 均被 gitignore。
- **兄弟仓改动会打断本地链时改用「钉版」**：`../anvil` 新增 `siblings.lock`（七个兄弟仓的 `url` + `sha`，基线取上次成功导出的 `sources.*.head`）与 `make pin` / `pin-status` / `unpin`；`make bootstrap PINNED=1 PORT=<port>` 用 `.siblings-pinned/` 里只读的 `git worktree` 快照编译，默认 `PINNED=0` 仍走 `.siblings/` 软链、行为不变。2026-11-14 在 owner 正改 core `IStake.stakeLiquidity`（live core 编译不过）时，`PINNED=1` 在 8580 上两次 bootstrap 产出的 `export/deployments/anvil31337_dev.json` 与仓库已提交版本 sha256 均为 `9e811d4d…c44c`（逐字节相同），随后 `make stop PORT=8580`；bump 流程见 `../anvil/README.md`「Pinned siblings」。

## 4. 常用命令

| 目的 | 命令 | 备注 |
| --- | --- | --- |
| 开发 | `pnpm dev` | <http://127.0.0.1:5173>，默认 dev 变体 |
| 类型检查 | `pnpm typecheck` | 两份 tsconfig 都跑 |
| Lint | `pnpm lint` | `--max-warnings=0` |
| 单元/组件测试 | `pnpm test` | Vitest；`test:watch` 可选 |
| 构建 | `pnpm build` | typecheck → vite → 404/.nojekyll/build-id → 包体门禁；默认 **prod** 变体 |
| dev 变体构建 | `VITE_ENV=dev pnpm build` | 测包体/本地地址簿时必须显式指定 |
| 预览产物 | `pnpm preview` | <http://127.0.0.1:4173> |
| E2E | `pnpm e2e` | Playwright，**52 条**；在独立 **8555** 自动化链上自举/复用（`scripts/e2e-chain.mjs`），`playwright.config.ts` 强制 `VITE_ENV=dev` 并跑 `build && preview`，把解析出的 RPC 作为 `VITE_ANVIL_RPC` 烘进构建 |
| 只看 e2e 链 | `pnpm e2e:ensure-chain` | 打印 8555 端点与「自举/复用」结果，不跑测试；`pnpm e2e:reset-chain` 重建 |
| 格式化 | `pnpm format` / `pnpm format:check` | Prettier |
| 起人工链（8545） | `make stop && make clean && make bootstrap` | 只从全新链/nonce 0 部署；旧链会被拒绝 |
| 起 e2e 链（8555） | `pnpm e2e`（首次自举）/ `make -C ../anvil bootstrap PORT=8555` | 运行时状态 `.anvil/8555/`，与 8545 互不影响 |
| 同步地址/ABI | `pnpm sync:anvil` | bootstrap 后运行；地址簿/ABI/manifest/快照一次写完 |
| ABI 漂移门禁 | `pnpm abis:check` | 无 `../anvil/export` 时明确跳过 |
| 发布到 test | `pnpm release-to-interface-test` | 裸仓库名别名；也可 `pnpm release-to LOVE20BSC/interface-test` |
| 发布到 prod | `pnpm release-to-interface` | 目标仓尚不存在 |

发布前置固定为：干净工作区（含未跟踪文件）→ 当前 SHA 的 CI 绿 → 目标 `main` 是 `HEAD` 祖先 → 打印 SHA/目标/提交并确认（`RELEASE_YES=1` 跳过）→ fast-forward push。命令零写入、不打 tag、不 force（[ADR-0002](adr/0002-three-environment-injection.md) §4）。

CI 环境规则（`.github/workflows/deploy.yml`）：取 `github.repository` 最后一个 `/` 之后的名字转小写，含 `dev` → dev，否则含 `test` → test，否则 prod；`vars.VITE_ENV` 可覆盖，base 分别为 `/interface-dev/`、`/interface-test/`、`/`。只有 push `main` 或手动 dispatch 触发；ABI 漂移门禁不在这个 workflow（本仓无 forge/兄弟仓）。

## 5. 已定的关键决策（附链接）

| 决策 | 结论 | 出处 |
| --- | --- | --- |
| 技术栈与静态托管 | React 19 + TS + Vite + Tailwind + wagmi/viem + TanStack Query + Radix + pnpm；GitHub Pages；无 Next/PWA/自定义响应头；`base` 构建期烘入，深链靠 `404.html` | [ADR-0001](adr/0001-stack-and-static-hosting.md) |
| 三环境注入 | 同一代码库三次构建，差异只在构建期环境包；组件/数据层零环境分支；地址、chainId、品牌全编译进产物 | [ADR-0002](adr/0002-three-environment-injection.md) §1–§2 |
| 身份模型 | 身份 = `(chainId, MemberNFT 地址, tokenId)`；MemberNFT 由种子 core 的 `MEMBER_NFT_ADDRESS()` 解析；`balanceOf`+`tokenOfOwnerByIndex` 枚举；每次加载 `ownerOf` 重校验 | [ADR-0003](adr/0003-identity-and-connect-button.md) §2 |
| 本地链 | `make bootstrap` 一条命令完成 preflight→fixture→build→anvil→fresh→部署→seed→导出→验证；`export/` 是唯一来源，前端只经 `pnpm sync:anvil` 消费 | [ADR-0004](adr/0004-anvil-local-chain.md) |
| 品牌标签 | 社区名 = 链上 `symbol()`；无社区/未知回退「LOVE20协议」（协议名，不是代币社区）；`name()` = `<子币 symbol>@<父币 symbol>`，仅技术详情可见 | [m0-ux-spec](product/m0-ux-spec.md) §1.3/§2.1；[GLOSSARY](../GLOSSARY.md) 易混对 |
| 空投页措辞 | 标题、按钮、状态统一「空投铸造」（2026-11-11 由「铸造空投份额」改名），不写「领取空投」；被铸造的对象仍叫「空投份额」；合约动作 `claim` 只留在代码/术语层 | [m0-ux-spec](product/m0-ux-spec.md) §3.4；[GLOSSARY](../GLOSSARY.md) |
| 空投数据源 | `AirdropDistributor`（地址簿 `airdropDistributor`）：`claim(token,share,proof)` 只付 `msg.sender`；每个 token 的根、轮次、快照 URI、已认领/剩余份额与金额全部来自**一次** `airdropInfo(token)`（`merkleRoot` / `claimableFromRound` / `snapshotUri` / `totalRemainingShare` / `remainingAmount` 等）；创世快照用内置 JSON 并以 `airdropInfo(genesisToken).merkleRoot` 校验，后续 Launch 代币从 `airdropInfo(token).snapshotUri` 拉取；轮次门槛用 `airdropInfo(token).claimableFromRound` + Phase 估算「约 X 分钟」 | [m0-ux-spec](product/m0-ux-spec.md) §3.4；[CI-017](contract-issues/017-genesis-snapshot-uri-locked.md) |
| 已铸造量 | 已铸造态必须显示实际铸造数量，金额来自 `claimedAmount(token,wallet)` 一次 view 调用，不依赖本机缓存 | [m0-ux-spec](product/m0-ux-spec.md) §3.4；[CI-014](contract-issues/014-airdrop-claimed-amount-not-readable.md) |
| tools 两个工具合约 | `BatchTransfer` / `UniswapV2Zap` **先不做进前端**（owner 2026-11-12 决定），M2 再作为「应用 → 工具」分类上线；两者独立于协议、不在 M0 漏斗内 | [contract-change-impact-2026-11-12](product/contract-change-impact-2026-11-12.md) §3 |
| Test 前缀 | dev/test 变体前端强制名字以 `Test` 开头（大小写敏感），prod 无此规则；`core@72a1604` 起合约不再自动加/改前缀 | [m0-ux-spec](product/m0-ux-spec.md) §3.3/§6；[CI-004](contract-issues/004-member-nft-test-prefix-mismatch.md) |
| 通用兑换页 | 任意代币 ↔ 任意代币（含原生币），路径 ≤3 跳；报价只调 `Router.getAmountsOut`；费率不写死，读不到就写「以链上费率为准」 | [m0-ux-spec](product/m0-ux-spec.md) §3.5；`b3a2a7d` |
| 无第三方 / 零密钥 | 钱包 injected-only；无 WalletConnect/AppKit/第三方 API/Service Worker；所有 `VITE_*` 公开，环境包不放任何密钥 | [README](../README.md) §Stack；[ADR-0002](adr/0002-three-environment-injection.md) §1 |
| i18n 纪律 | 所有用户可见文案进 `shared/config/copy.ts`；组件内禁止 CJK 字面量（架构测试强制）；暂不引入 i18n 库 | [README](../README.md)「i18n readiness」 |
| 缓存与错误 | 唯一存储封装 `shared/lib/cache.ts`，键 `love20:v1:<chainId>:<contractAddress>:<wallet>:<businessKey>`；合约错误 selector → 中文人话 | [ADR-0003](adr/0003-identity-and-connect-button.md) §3；[README](../README.md) §Storage |
| 底栏与占位页 | 5 个 tab 同权重，不做中央凸起；治理/行动/我的只显示「即将上线」，不出现半成品表单 | [README](../README.md)「Decisions…」；[m0-ux-spec](product/m0-ux-spec.md) §1.2 |
| 应用目录 | 底栏「链群」改为「应用」（`/apps?symbol=`）：功能型页面统一由 `src/domain/apps-catalog.ts` 的数据目录管理（今日：创世空投 / 身份 NFT / 代币兑换 / 开源文档；`/about` 是文档、合约地址与只读链上数据页，无合约地址依赖），≥2 个分类自动分组，未来页面只加目录条目；`/group` 深链保留、不再上底栏 | [m0-ux-spec](product/m0-ux-spec.md) §1.2/§3.6/§3.8 |

## 6. 已知坑与注意事项

1. **E2E 已隔离到独立链（8545 人工链不可触碰）**：2026-11-11，`pnpm e2e` 在人工正在使用的 8545 上 bootstrap/回滚，把账户 #1 的链上 nonce 从 68 打回 3，他签名的 approve 永远 pending、页面卡「确认中…」。现在的规则：
   - `pnpm e2e` 由 `scripts/e2e-chain.mjs` 守护：默认链 `http://127.0.0.1:8555`，本机命中 `:8545` **立即失败**（`playwright.config.ts` 对直接 `playwright test` 同样拒绝）；未显式设置 `E2E_ANVIL_RPC` 时首次在 8555 上 `make -C ../anvil bootstrap PORT=8555`、之后复用。
   - `e2e/chain.ts` 仍按 spec 文件 `anvil_snapshot`/`anvil_revert`（文件内测试共享夹具，如 mint 收据给 my-nft 列表用；按测试回滚会抹掉下一个测试依赖的状态），`playwright.config.ts` 固定 `workers: 1`——快照作用于整条链，不能让两个文件同时改链。现在它只作用于自动化链，**链脏/被强杀用 `pnpm e2e:reset-chain` 重建，不要去动 8545**。
   - 复核（2026-11-11 21:53–21:58 +08:00）：`pnpm e2e` 连跑两遍均 **33/33**（各 1.3m，中间无 bootstrap；快照 id 0x0–0x3 → 0x4–0x7 连续）；杀掉 8555 后重跑自动 bootstrap 并再次 33/33；两遍前后 8545 的 `block-number` 969→969、`nonce 0x7099…` 69→69、`anvil_getAutomine` true→true、pid 13323 不变。操作见 [e2e/README.md](../e2e/README.md)。
2. **首屏包体（修复后复核）**：门禁 `scripts/check-bundle.mjs`（level-9）实测 prod **158.3 kB**、dev **159.2 kB** gzip（2026-11-12 `airdropInfo` 重构后；迁移前 159.2–159.3 / 160.0–160.1）；Vite 自身报数更高（统计口径不同）。dev 与 prod 的差异来自**部署数据压缩率**，不是 dev-only 代码：两者 raw 约 530 kB，部署 JSON 的 anvil 真实地址比零地址占位更难压缩，测试网横幅/dev 标识是两个变体共有的真实 UI。门禁因此给 dev 显式 **+1 kB 数据豁免**（dev 目标 161 kB，硬限 200 仍适用；prod 仍按 160 kB），不再输出无法行动的 WARN。后续 prod 不得超 160、dev 不得超 161。
3. **三处真机（390×844）体验缺陷**：① 主按钮被固定底栏遮挡——[`swap-form.png`](product/screenshots/swap-form.png) 里「兑换」只剩上沿；② 小数位不统一——`mint-form.png` 显示 `99,998,199.99`（2 位）、`swap-form.png` `19.938012`（6 位）、`airdrop-eligible.png` `100,000,000`（0 位）；③ 6 字标题被截——`airdrop-eligible.png` 页头「铸造空投…」。
4. **地址确定性已收敛（冲突已解决）**：clean bootstrap 从 deployer nonce 0 开始，地址确定；bootstrap 期间 automine，导出块高也确定（§6 有两次 sha256 相同的证明命令）。只有「已用过的链」会得到另一组地址，所以 `make bootstrap` 现在拒绝复用任何运行中的链，`export.py` 还会拒绝 nonce 首笔不为 0 的 broadcast。`m0-scope` 与 ADR-0004 已按「deterministic-from-clean」统一；操作上仍只消费 `pnpm sync:anvil` 生成物，绝不硬编码、绝不手设 nonce。
5. **ABI 必须 generate-then-commit（已补齐）**：core `out/`、dex `build/` 都被各自仓库 gitignore（core `.gitignore:1`、dex `.gitignore:1`），本仓也忽略 `out/`。`pnpm sync:anvil` 生成 `src/config/abis/*.ts`（含 `airdrop-distributor.ts`）、`src/config/abis/manifest.json`（core/action/group-chat/libs/dex/anvil/periphery/tools 的 HEAD、导出块高/时间、每合约条目数）与快照；`pnpm abis:check` 在有 `../anvil/export` 时逐字节校验，缺失时明确跳过。不要把 `abi` 手改后再提交。
6. **合约问题清单已过基线**：`docs/contract-issues/README.md` 审计基线 `core@43d5344`，而 core HEAD 已是 **`72a1604`**（CI-004 在该提交标为已修复）。13 条中 12 Open / 1 修复，需按新 HEAD 复核；[CI-001](contract-issues/001-no-member-round-index.md) 仍是 M1 Blocker。
7. **空投快照必须与链上根一致**：导出/内置快照的 `merkleRoot`=`0x046a5d53…c6c404`（10 个账户），页面用 `airdropInfo(创世代币).merkleRoot` 校验；不一致时按「空投资格暂时读不到」+「重试」处理，不显示数字。创世 `airdropInfo(创世代币).snapshotUri` 永久为空是设计（CI-017），不是错误。
8. **test/prod 地址簿为空**：两份 JSON 各 24 个零地址，现在发布会得到「未配置」界面；地址只能来自合约仓 `script/network/`，不得把 anvil 地址抄过去。
9. **Pages 缓存**：`index.html` 最多陈旧 600 s、旧哈希 chunk 会 404；只能靠 build id 比对 + `vite:preloadError` 兜底；不启用 PWA。
10. **构建运行时**：不要用 DSH 自带 Node 跑 `pnpm install/build`（rollup 原生二进制 code-signature 失败，见 §3.3）。
11. **Pages 上的 dev 构建只能做 UI/文案预览**：HTTPS 页面不能访问回环 RPC（2026-11-12 复现的 Chromium 报错：`Permission was denied for this request to access the 'loopback' address space`，目标 `http://127.0.0.1:8545/`，来源 `https://love20bsc.github.io`）；交互测试必须用 localhost 本地服务（`pnpm dev`，如 <http://localhost:5180>），或换成可访问的链。界面已对该组合显示一次性可关闭说明（`src/app/shell/rpc-blocked-notice.tsx`），不再误报「网络可能不稳」。

## 7. 下一步（按顺序）

| # | 事项 | 完成标志 |
| --- | --- | --- |
| 1 | ✅ 包体保持预算内 | prod gate ≤160 kB（复核 158.3 kB）；dev ≤161 kB（复核 159.2 kB，含 `check-bundle.mjs` 显式 1 kB 部署数据豁免）；不引入 WalletConnect 字节 |
| 2 | 修三处真机体验：底栏遮挡主按钮、小数位统一、6 字标题不截断 | 按 390×844 重出 `product/screenshots/` 对照图，主按钮完整可见、金额精度有统一规则 |
| 3 | ✅ E2E 独立链隔离 | 自动化链 8555（`pnpm e2e` 自举/复用，8545 硬拒绝）；按文件快照/回滚；连跑两遍均 **33/33** 且 8545 前后不变（§6.1） |
| 4 | 写 M0 验收报告 | 按 [m0-ux-spec](product/m0-ux-spec.md) §6 的 14 步 + 四个阻塞点逐条附证据（截图/交易哈希/命令输出） |
| 5 | 发布到 interface-test | 先解决 test 地址来源（合约仓当前只有 `anvil31337_dev` 参数，前端 test 簿仍全 0）→ 干净工作区 + CI 绿 → `pnpm release-to-interface-test`；线上 build id 对应发布 commit |
| 6 | 之后才是 M1（治理：推举/投票/激励铸造） | CI-001 解除并有 view 级枚举方案；prod 仓 `LOVE20BSC/interface` 到时才创建 |

## 8. 如何接手（最短路径）

1. **读什么**：先 [ADR-0001](adr/0001-stack-and-static-hosting.md)→[0004](adr/0004-anvil-local-chain.md)（0002 环境/发布、0004 起链最关键），再本文件，再 [m0-ux-spec](product/m0-ux-spec.md)；改文案前读 [GLOSSARY](../GLOSSARY.md)。
2. **起链**：`make -C ../anvil bootstrap`；`cast chain-id --rpc-url http://127.0.0.1:8545` 应为 31337；收链 `make -C ../anvil stop`。同一时刻只允许一条链。
3. **跑测试**：`pnpm install` → `pnpm typecheck && pnpm lint && pnpm test`；`pnpm e2e` 跑 52 条，首次需干净链，之后可按文件快照/回滚重复跑（见 [e2e/README.md](../e2e/README.md)）。
4. **改 UI 的纪律**：文案只进 `shared/config/copy.ts`；组件内禁止中文字面量；缓存只走 `shared/lib/cache.ts`；地址/chainId 只从环境包来；禁止硬编码费率；金额与倒计时必须标「约/预计」；不调 `tokenURI`、不读事件日志。
5. **改 ABI/地址**：先 clean bootstrap，再 `pnpm sync:anvil` 生成并提交；不手改、不把 `out/`/`build/` 带进仓，不为了匹配旧地址簿调 nonce。漂移门禁 `pnpm abis:check`。
6. **提交纪律**：显式 `git add <path>`（不要 `git add -A`）；已推送 commit 禁止 amend；不提交 `dist*/`、`.research/`、`.build-id`、`.env`。
7. **发布纪律**：只接受 fast-forward；`pnpm release-to-interface-test` 会检查干净工作区、CI 绿、目标 `main` 是祖先；拒绝 force、拒绝网页 merge。
8. **不确定就写「待核实」**：不要发明地址、费率、文案或合约能力；`../core`、`../action`、`../anvil` 等兄弟仓只读。

## 9. 文档索引

`.research/` 是本地只读输入且被 gitignore，干净 checkout 里没有这些文件；交接时需单独拷贝。

| 文档 | 回答什么问题 |
| --- | --- |
| [STATUS.md](STATUS.md) | 本文件：当前做到哪、怎么接手、下一步 |
| [ADR-0001](adr/0001-stack-and-static-hosting.md) | 为什么是这套栈、Pages 六条硬约束如何落到架构、包体门禁口径 |
| [ADR-0002](adr/0002-three-environment-injection.md) | 三环境如何注入、ABI 流水线、单命令 fast-forward 发布、仓库名选环境 |
| [ADR-0003](adr/0003-identity-and-connect-button.md) | 连接按钮三面板、身份三元组与枚举、缓存命名空间、社区切换语义 |
| [ADR-0004](adr/0004-anvil-local-chain.md) | `make bootstrap` 做什么、fresh/nonce 0 守卫、seed 顺序、8545 端口策略、`pnpm sync:anvil` 单向同步与确定性证明 |
| [m0-scope](product/m0-scope.md) | M0 交付 6 项、明确不做什么、依赖/验收、仍待确认的假设 |
| [m0-ux-spec](product/m0-ux-spec.md) | 应用外壳与 5 个页面的交互、横切规范、§6 验收脚本 |
| [contract-issues/README](contract-issues/README.md) | 13 条合约侧问题的索引、严重级别定义、修复流程与基线 |
| [CI-001](contract-issues/001-no-member-round-index.md) | 无按 `memberId` 的轮次/行动索引（Blocker，M1 阻塞） |
| [CI-002](contract-issues/002-reward-quote-linear-scan.md) | 激励报价线性扫描本轮全部提案（High） |
| [CI-003](contract-issues/003-created-round-not-exposed.md) | `createdRound` 未暴露，流水线/倒计时拿不到（High） |
| [CI-004](contract-issues/004-member-nft-test-prefix-mismatch.md) | Test 前缀报价/查重与铸造不一致（已修复 core@72a1604） |
| [CI-005](contract-issues/005-no-onboarding-path.md) | 没币用户入网路径缺失（High） |
| [CI-006](contract-issues/006-claim-amounts-are-live.md) | 待铸造金额现算会变甚至归零（High） |
| [CI-007](contract-issues/007-round-not-started-inconsistent.md) | 「轮次未开始」三种不一致答复（Medium） |
| [CI-008](contract-issues/008-no-phase-timing-view.md) | 无阶段时间/偏移视图，倒计时要在 TS 重算（Medium） |
| [CI-009](contract-issues/009-verifier-surface-gaps.md) | 验证者侧没有按人索引（Medium） |
| [CI-010](contract-issues/010-address-book-not-discoverable.md) | 地址簿不可链上发现，错地址静默返回 0（Medium） |
| [CI-011](contract-issues/011-silent-zero-ambiguity.md) | 静默 0 / 歧义 0：分不清「没有」与「未开始」（Medium） |
| [CI-012](contract-issues/012-name-homoglyph-spoofing.md) | 名称同形可伪造身份（Medium） |
| [CI-013](contract-issues/013-member-nft-no-token-uri.md) | MemberNFT 无 `tokenURI`，钱包里是空白 NFT（Low） |
| [GLOSSARY](../GLOSSARY.md) | 界面中文的硬约束、一词一义、易混对（写文案前必读） |
| [delivery-2026-11-14](product/delivery-2026-11-14.md) | 本轮五页 + anvil 外围合约接入的交付索引：三线证据、门禁、人工验收路径、已知限制 |
| [three-line-verification](product/three-line-verification.md) | 三线校验规范（理论线 → 合约线 → 前端线，理论线为基准） |
| [README](../README.md) | 栈、命令、分层、环境注入、连接按钮、存储/错误、i18n、托管、stub 清单 |
| [.research/protocol-contracts.md](../.research/protocol-contracts.md) | core/action/group-chat 前端可用面与合约事实清单 |
| [.research/domain-model.md](../.research/domain-model.md) | 领域术语、Phase/Round 语义、角色与对象关系 |
| [.research/dex-and-anvil.md](../.research/dex-and-anvil.md) | dex/anvil 现状与本地 bootstrap 必须补什么 |
| [.research/libs-and-artifacts.md](../.research/libs-and-artifacts.md) | libs/compatibility/cache 的产物与 ABI 生成策略 |
| [.research/membernft-identity.md](../.research/membernft-identity.md) | MemberNFT 实现、身份发现与持有人枚举 |
| [.research/network-and-token-acquisition.md](../.research/network-and-token-acquisition.md) | 网络配置、买币/空投、phase 时序等集成事实 |
| [.research/static-hosting-and-ux.md](../.research/static-hosting-and-ux.md) | Pages 实测约束与消费级 dApp UX 基准 |
| [.research/tkm-connect-and-nav.md](../.research/tkm-connect-and-nav.md) | 参考实现的连接按钮、底栏与桌面外壳 |
| [.research/tkm-funnel-pages.md](../.research/tkm-funnel-pages.md) | 参考实现四个漏斗页的结构与文案 |

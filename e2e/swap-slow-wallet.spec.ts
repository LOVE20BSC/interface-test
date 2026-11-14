import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPublicClient, http, parseAbi } from 'viem';
import { anvilRpc, isolateChain } from './chain';
import { CHAIN_HEX, connect, installWallet, type WalletStubSend } from './wallet-stub';

/**
 * 兑换 · 慢钱包回归（owner 2026-11-14）
 *
 * 真实浏览器里，每次刷新后的第一笔兑换都会先显示「这笔交易还卡在钱包里」，点
 * 「重新提交」才上链 —— e2e 里复现不出来，因为注入钱包的 `eth_sendTransaction`
 * 直连 anvil、延迟极低，而且 app 首笔发送把 nonce 完全交给钱包。
 *
 * 这里用三个慢钱包条件把它固化：
 * 1. `sendDelayMs`：钱包弹窗确认 3 s 后才返回 hash（真实 MetaMask 的 3–8 s）；
 * 2. `anvil_setAutomine(false)` + 延迟 `anvil_mine`：hash 已知后 receipt 先返回
 *    null 三轮以上，等价真实链上「已广播、还没打包」；
 * 3. `staleNonceOffset`：钱包自己的 nonce 追踪比链上多 1 —— 这正是「卡在钱包里」
 *    （nonceGap）描述的状态。
 *
 * 修复后：首笔也要 pin 链上 nonce，慢钱包一次成功；回执关闭后第二笔真实成交。
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
) as {
  chainId: number;
  rpcUrls: string[];
  nativeCurrency: { symbol: string; decimals: number };
  addresses: { weth: `0x${string}` };
};

const RPC_URL = process.env.E2E_ANVIL_RPC ?? deployment.rpcUrls[0] ?? 'http://127.0.0.1:8555';
const NATIVE = deployment.nativeCurrency.symbol;
const WETH = deployment.addresses.weth;
const WRAPPED_SYMBOL = 'TestWETH';

// anvil account #5: 10000 ETH, untouched by the swap fixtures (which use #3/#4).
const ACCOUNT = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc';

const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)']);

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 240_000 });

// Same chain-global snapshot/revert isolation as the other specs.
isolateChain();

interface StubState {
  readonly rpcUrl: string;
  readonly chainHex: string;
  readonly account: string;
  readonly sends: WalletStubSend[];
}

async function stubState(page: Page): Promise<StubState> {
  return (await page.evaluate(() => {
    const raw = (window as unknown as { __walletStub?: StubState }).__walletStub;
    if (raw === undefined) throw new Error('wallet stub not installed');
    return raw;
  })) as StubState;
}

async function writesSent(page: Page): Promise<number> {
  return (await stubState(page)).sends.length;
}

let miningDisabled = false;

/**
 * The bootstrap chain mines every second (`interval mining enabled`). Turning both
 * interval mining and automine off keeps a submitted transaction in the pool, so
 * `eth_getTransactionReceipt` really returns null for several polls — the slow
 * chain the owner sees while the wallet has already broadcast.
 */
async function disableMining(): Promise<void> {
  await anvilRpc('anvil_setIntervalMining', [0]);
  await anvilRpc('anvil_setAutomine', [false]);
  miningDisabled = true;
}

async function mine(): Promise<void> {
  await anvilRpc('anvil_mine', []);
}

test.afterAll(async () => {
  // The snapshot revert restores state, not necessarily the mining mode, so put
  // the chain back the way the suite expects it (1 s interval mining).
  if (miningDisabled) {
    await anvilRpc('anvil_setAutomine', [true]);
    await anvilRpc('anvil_setIntervalMining', [1]);
  }
});

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
}

async function wethBalance(): Promise<bigint> {
  return publicClient.readContract({
    address: WETH,
    abi: ERC20,
    functionName: 'balanceOf',
    args: [ACCOUNT],
  });
}

async function latestNonce(): Promise<number> {
  return publicClient.getTransactionCount({ address: ACCOUNT, blockTag: 'latest' });
}

async function openWrapForm(page: Page): Promise<void> {
  await page.goto(`/swap?symbol=TestLOVE20&from=${NATIVE}&to=${WRAPPED_SYMBOL}`);
  await connect(page);
  await expect(page.getByTestId('swap-from-token')).toContainText(NATIVE, { timeout: 20_000 });
  await expect(page.getByTestId('swap-to-token')).toContainText(WRAPPED_SYMBOL);
}

async function fillWrapAmount(page: Page, amount: string): Promise<void> {
  await page.getByTestId('swap-from-amount').fill(amount);
  await expect(page.getByTestId('swap-to-amount')).toContainText(`${amount} ${WRAPPED_SYMBOL}`, {
    timeout: 20_000,
  });
  await expect(page.getByTestId('swap-submit')).toBeEnabled({ timeout: 20_000 });
}

async function receiptHash(page: Page): Promise<`0x${string}`> {
  const hash = (await page.getByTestId('swap-receipt-hash').innerText()).trim();
  expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
  return hash as `0x${string}`;
}

test('慢钱包 + 钱包 nonce 领先链上（修复前首笔的真实状态）：卡在钱包里，重新提交带链上 nonce 才上链', async ({
  page,
}) => {
  await disableMining();
  // ignorePinnedNonce: 首笔仍然由钱包决定 nonce（修复前行为），把钱包侧那笔 stale
  // nonce 原样提交；「重新提交」的显式 nonce 会被尊重（与 MetaMask 一致）。
  await installWallet(page, ACCOUNT, CHAIN_HEX, {
    sendDelayMs: 3_000,
    staleNonceOffset: 1,
    ignorePinnedNonce: true,
  });

  await openWrapForm(page);
  await fillWrapAmount(page, '0.01');

  const nonceBefore = await latestNonce();
  const startedAt = Date.now();
  await page.getByTestId('swap-submit').click();

  // The recovery card can only appear once the 10 s grace window proves the gap
  // is real; the stale-nonce transaction sits in the pool for the whole time.
  const recovery = page.getByTestId('tx-watch-recovery');
  await expect(recovery).toBeVisible({ timeout: 40_000 });
  await expect(recovery).toContainText('这笔交易还卡在钱包里');
  const gapElapsedMs = Date.now() - startedAt;

  const first = (await stubState(page)).sends[0];
  expect(first).toBeDefined();
  if (first === undefined) return;
  // 修复后 app 首笔也 pin 了链上 nonce（这是修复），但钱包的 stale nonce 覆盖了它。
  expect(first.pinnedNonce).toBe(nonceBefore);
  expect(first.usedNonce).toBe(nonceBefore + 1);

  // Chain-side evidence: accepted into the pool at nonce N+1, not mined.
  const queued = await publicClient.getTransaction({ hash: first.hash as `0x${string}` });
  expect(queued.nonce).toBe(nonceBefore + 1);
  const minedBeforeResubmit = await publicClient
    .getTransactionReceipt({ hash: first.hash as `0x${string}` })
    .catch(() => null);
  expect(minedBeforeResubmit).toBeNull();
  await shot(page, 'swap-slow-wallet-nonce-gap.png');

  // 「重新提交」 pins the on-chain nonce, which is what makes it mine.
  const balanceBefore = await wethBalance();
  await recovery.getByRole('button', { name: '重新提交' }).click();
  await expect.poll(() => writesSent(page), { timeout: 30_000 }).toBe(2);
  const second = (await stubState(page)).sends[1];
  expect(second?.pinnedNonce).toBe(nonceBefore);
  expect(second?.usedNonce).toBeNull();

  await mine();
  await expect(page.getByRole('heading', { name: '兑换完成' })).toBeVisible({ timeout: 30_000 });
  const resubmitted = await receiptHash(page);
  expect(resubmitted).toBe(second?.hash);
  const receipt = await publicClient.getTransactionReceipt({ hash: resubmitted });
  expect(receipt.status).toBe('success');
  await expect.poll(wethBalance, { timeout: 15_000 }).toBeGreaterThan(balanceBefore);

  console.log(
    `swap slow wallet (stale nonce): firstSend nonce=${String(first.pinnedNonce)}→wallet ${String(
      first.usedNonce,
    )} queued; recovery card after ${gapElapsedMs}ms; resubmit=${second?.hash} pinned=${String(
      second?.pinnedNonce,
    )} receipt=${resubmitted} block=${receipt.blockNumber}`,
  );
});

test('慢钱包首笔一次成功：3 s 钱包延迟 + receipt 先返回 null，不出现「卡在钱包里」、不需要重新提交', async ({
  page,
}) => {
  await disableMining();
  await installWallet(page, ACCOUNT, CHAIN_HEX, { sendDelayMs: 3_000, staleNonceOffset: 1 });

  await openWrapForm(page);
  await fillWrapAmount(page, '0.02');

  const nonceBefore = await latestNonce();
  const balanceBefore = await wethBalance();
  await page.getByTestId('swap-submit').click();

  // Hash known after the simulated wallet confirmation; the receipt is still null.
  await expect(page.getByTestId('tx-watch-pending')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => writesSent(page), { timeout: 20_000 }).toBe(1);

  const state = await stubState(page);
  expect(state.sends).toHaveLength(1);
  const send = state.sends[0];
  expect(send).toBeDefined();
  if (send === undefined) return;
  // 修复的核心：首笔发送就带上链上 nonce，钱包的 stale nonce 不会再被使用。
  expect(send.pinnedNonce).toBe(nonceBefore);
  expect(send.usedNonce).toBeNull();
  // Wallet and app must watch the same chain endpoint (same chain, same RPC).
  expect(state.rpcUrl).toBe(RPC_URL);
  expect(state.chainHex).toBe(CHAIN_HEX);
  expect(await latestNonce()).toBe(nonceBefore);

  // Several receipt polls return null (slow chain). The app must never claim the
  // nonce-gap 「卡在钱包里」 dead end and must never need a second send.
  //
  // With the suite's short build-time deadline (VITE_TX_DEADLINE_MS=4000, see
  // scripts/e2e-chain.mjs) a 5 s wait legitimately crosses the deadline, so the
  // only card allowed here is the calm `slow` note (「这笔交易还没有被确认」).
  // Production uses the 90 s default, where this window stays 确认中 — asserting
  // "no card at all" would only be testing the e2e build's deadline, not the fix.
  await page.waitForTimeout(5_000);
  const recovery = page.getByTestId('tx-watch-recovery');
  if ((await recovery.count()) > 0) {
    await expect(recovery).toContainText('这笔交易还没有被确认');
    await expect(recovery).not.toContainText('这笔交易还卡在钱包里');
    await expect(recovery).not.toContainText('这笔交易已经被替换或取消');
  }
  await expect.poll(() => writesSent(page)).toBe(1);
  await expect(page.getByRole('heading', { name: '兑换完成' })).toHaveCount(0);
  await shot(page, 'swap-slow-wallet-pending.png');

  await mine();
  await expect(page.getByRole('heading', { name: '兑换完成' })).toBeVisible({ timeout: 30_000 });
  const hash = await receiptHash(page);
  expect(hash).toBe(send.hash);
  const receipt = await publicClient.getTransactionReceipt({ hash });
  expect(receipt.status).toBe('success');
  expect(receipt.transactionHash).toBe(hash);
  await expect(page.getByTestId('tx-watch-recovery')).toHaveCount(0);
  await expect.poll(wethBalance, { timeout: 15_000 }).toBe(balanceBefore + 20_000_000_000_000_000n);
  await shot(page, 'swap-slow-wallet-receipt.png');

  console.log(
    `swap slow wallet (fixed): send pinned=${String(send.pinnedNonce)} walletDelay=3000ms ` +
      `tx=${hash} block=${receipt.blockNumber} no recovery card, no resubmit`,
  );
});

test('回执关闭后第二次兑换真实成交：按钮 enabled，第二笔上链并拿到 receipt', async ({ page }) => {
  await disableMining();
  await installWallet(page, ACCOUNT, CHAIN_HEX, { sendDelayMs: 3_000, staleNonceOffset: 1 });

  await openWrapForm(page);
  await fillWrapAmount(page, '0.03');
  const balanceBefore = await wethBalance();

  await page.getByTestId('swap-submit').click();
  await expect(page.getByTestId('tx-watch-pending')).toBeVisible({ timeout: 20_000 });
  await mine();
  await expect(page.getByRole('heading', { name: '兑换完成' })).toBeVisible({ timeout: 30_000 });
  const firstHash = await receiptHash(page);

  // 知道了 collapses the receipt into the success strip and must release every
  // send guard (owner 2026-11-14: 回执关闭后再点兑换没反应).
  await page.getByRole('button', { name: '知道了' }).click();
  await expect(page.getByTestId('swap-success-strip')).toBeVisible();
  await expect(page.getByTestId('swap-from-amount')).toBeVisible({ timeout: 20_000 });

  await fillWrapAmount(page, '0.04');
  await expect(page.getByTestId('swap-submit')).toBeEnabled();
  const sendsBefore = await writesSent(page);
  expect(sendsBefore).toBe(1);

  await page.getByTestId('swap-submit').click();
  // The second 兑换 must really submit a second transaction, not silently return.
  await expect.poll(() => writesSent(page), { timeout: 20_000 }).toBe(sendsBefore + 1);
  await expect(page.getByTestId('tx-watch-pending')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId('tx-watch-recovery')).toHaveCount(0);
  await mine();

  await expect(page.getByRole('heading', { name: '兑换完成' })).toBeVisible({ timeout: 30_000 });
  const secondHash = await receiptHash(page);
  expect(secondHash).not.toBe(firstHash);
  const secondReceipt = await publicClient.getTransactionReceipt({ hash: secondHash });
  expect(secondReceipt.status).toBe('success');
  const firstReceipt = await publicClient.getTransactionReceipt({ hash: firstHash });
  expect(secondReceipt.blockNumber).toBeGreaterThan(firstReceipt.blockNumber);

  // Both wraps really landed: WETH grew by 0.03 + 0.04.
  await expect.poll(wethBalance, { timeout: 15_000 }).toBe(balanceBefore + 70_000_000_000_000_000n);
  await shot(page, 'swap-second-swap-receipt.png');

  console.log(
    `swap consecutive: first=${firstHash} second=${secondHash} ` +
      `blocks=${firstReceipt.blockNumber}→${secondReceipt.blockNumber} ` +
      `weth=${balanceBefore}→${balanceBefore + 70_000_000_000_000_000n}`,
  );
});

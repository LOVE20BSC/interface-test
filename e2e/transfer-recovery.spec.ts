import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPublicClient, http, parseAbi } from 'viem';
import { ANVIL_RPC, anvilRpc, isolateChain } from './chain';
import { connect, installWallet } from './wallet-stub';

/**
 * 代币转账 · D1/D2/D4/D7 回归（QA 缺陷 `docs/product/reviews/transfer.md`）
 *
 * D1 是本次修复的核心：提交 → 立即刷新 → 在途卡恢复、主按钮不可再发 → 链上只
 * 一笔（刷新前 QA 实测收款方双倍到账）。另外三条：
 * - D2：恢复卡出现后主按钮必须禁用并说明原因，只能从卡里「重新提交」继续；
 * - D4：刷新后恢复成功条（金额 + 可复制哈希），但不再弹回执；
 * - D7：`memberName` 慢 RPC 下，身份确认块在名字到达前不出现、不能勾选/提交。
 *
 * 运行方式与套件其它 spec 相同：`pnpm e2e -- --grep "代币转账"`（`scripts/e2e-chain.mjs`
 * 会把 `VITE_TX_DEADLINE_MS` 设为 4 秒；若直接 `playwright test`，恢复卡要等 90 秒，
 * D2 用例会超时——请用 `pnpm e2e`）。
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
) as {
  nativeCurrency: { symbol: string };
  addresses: { firstTokenAddress: `0x${string}` };
};

const RPC_URL = process.env.E2E_ANVIL_RPC ?? ANVIL_RPC;
const SYMBOL = 'TestLOVE20';
const TOKEN = deployment.addresses.firstTokenAddress;
const QUERY = `?symbol=${SYMBOL}`;
const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');

// anvil 固定账户：各自余额互不重叠，避免用例之间互相影响。
const SENDER = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'; // #4, 99,999,099.99 TestLOVE20
const ZERO_TOKEN_ACCOUNT = '0x976EA74026E726554dB657fA54763abd0C3a0aa9'; // #6, 0 TestLOVE20
const RECIPIENT = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'; // #7
const OUTSIDER = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f'; // #8, 0 TestLOVE20

const publicClient = createPublicClient({ transport: http(RPC_URL) });
const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)']);

test.use({
  permissions: ['clipboard-read', 'clipboard-write'],
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 240_000 });

isolateChain();

let miningDisabled = false;

async function disableMining(): Promise<void> {
  await anvilRpc('anvil_setIntervalMining', [0]);
  await anvilRpc('anvil_setAutomine', [false]);
  miningDisabled = true;
}

async function mine(): Promise<void> {
  await anvilRpc('anvil_mine', []);
}

test.afterAll(async () => {
  if (miningDisabled) {
    await anvilRpc('anvil_setAutomine', [true]);
    await anvilRpc('anvil_setIntervalMining', [1]);
  }
});

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: resolve(SHOTS, name), animations: 'disabled' });
}

interface StubState {
  readonly sends: Array<{ hash: string }>;
}

async function stubState(page: Page): Promise<StubState> {
  return (await page.evaluate(() => {
    const raw = (window as unknown as { __walletStub?: StubState }).__walletStub;
    if (raw === undefined) throw new Error('wallet stub not installed');
    return raw;
  })) as StubState;
}

type Hex = `0x${string}`;

async function tokenBalance(address: string): Promise<bigint> {
  return publicClient.readContract({
    address: TOKEN,
    abi: ERC20,
    functionName: 'balanceOf',
    args: [address as Hex],
  });
}

async function latestNonce(address: string): Promise<number> {
  return publicClient.getTransactionCount({ address: address as Hex, blockTag: 'latest' });
}

async function openTransfer(page: Page, account: string): Promise<void> {
  await installWallet(page, account);
  await page.goto(`/transfer${QUERY}`);
  await connect(page);
}

async function selectToken(page: Page, symbol: string): Promise<void> {
  await page.getByTestId('transfer-token').click();
  const option = page.getByTestId(`transfer-token-option-${symbol}`);
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await expect(page.getByTestId('transfer-token')).toContainText(symbol);
}

async function fillTransfer(page: Page, amount: string, recipient: string): Promise<void> {
  await page.getByTestId('transfer-amount').fill(amount);
  await page.getByTestId('transfer-recipient').fill(recipient);
}

async function selectRecipientMode(page: Page, label: string, mode: string): Promise<void> {
  const trigger = page.getByTestId('transfer-recipient-mode');
  if ((await trigger.innerText()).includes(label)) return;
  await trigger.click();
  await page.getByTestId(`transfer-mode-${mode}`).click();
  await expect(trigger).toContainText(label);
}

test('D7 慢 RPC：链上名字未返回前身份确认块不出现、不能勾选或提交', async ({ page }) => {
  // memberName(uint256) = 0xe92ced07；只延迟这一个 selector，ownerOf 正常返回。
  await page.route(RPC_URL, async (route) => {
    const body = route.request().postData() ?? '';
    if (body.includes('e92ced07')) {
      await new Promise((done) => setTimeout(done, 6_000));
    }
    await route.continue();
  });

  await openTransfer(page, SENDER);
  await selectToken(page, SYMBOL);
  await selectRecipientMode(page, '按身份 NFT ID', 'member');
  await fillTransfer(page, '0.1', '#2');

  // ownerOf 已经回来（读取行消失/名字读取行出现），但名字还在路上：门禁保持关闭。
  await expect(page.getByTestId('transfer-identity-name-reading')).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByTestId('transfer-identity-name-reading')).toHaveText(
    '正在读取身份名字…',
  );
  await expect(page.getByTestId('transfer-identity-summary')).toHaveCount(0);
  await expect(page.getByTestId('transfer-identity-ack')).toHaveCount(0);
  await expect(page.getByTestId('transfer-submit')).toBeDisabled();
  await shot(page, 'transfer-d7-name-pending.png');

  // 名字到达后才出现确认块，勾选后 CTA 才可用。
  const summary = page.getByTestId('transfer-identity-summary');
  await expect(summary).toBeVisible({ timeout: 20_000 });
  await expect(summary).toContainText('身份 NFT #2 Testdev-member-1');
  await page.getByTestId('transfer-identity-ack').check();
  await expect(page.getByTestId('transfer-submit')).toBeEnabled();
  await shot(page, 'transfer-d7-name-arrived.png');
});

test('D3 余额读取失败：主按钮禁用并说明「余额暂时读不到，稍后重试。」', async ({ page }) => {
  // 只让 balanceOf 失败（其余 RPC 放行）：页面必须承认余额未知，不能假装可提交。
  await page.route(RPC_URL, async (route) => {
    const body = route.request().postData() ?? '';
    if (body.includes('70a08231')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32000, message: 'qa: balance read failed' },
        }),
      });
      return;
    }
    await route.continue();
  });

  await openTransfer(page, SENDER);
  await selectToken(page, SYMBOL);
  await expect(page.getByTestId('transfer-balance')).toHaveText('余额暂时读不到', {
    timeout: 20_000,
  });
  await fillTransfer(page, '0.1', RECIPIENT);

  await expect(page.getByTestId('transfer-submit')).toBeDisabled();
  await expect(page.getByTestId('transfer-submit-note')).toContainText('余额暂时读不到，稍后重试。');
  await shot(page, 'transfer-d3-balance-unreadable.png');
});

test('D5 余额为 0：全部禁用，不产生注定非法的 0 金额', async ({ page }) => {
  await openTransfer(page, ZERO_TOKEN_ACCOUNT);
  await selectToken(page, SYMBOL);
  await expect(page.getByTestId('transfer-balance')).toHaveText('0', { timeout: 20_000 });

  await expect(page.getByTestId('transfer-max')).toBeDisabled();
  await page.getByTestId('transfer-max').click({ force: true });
  await expect(page.getByTestId('transfer-amount')).toHaveValue('');
  await expect(page.getByTestId('transfer-amount-error')).toHaveCount(0);
  await expect(page.getByTestId('transfer-submit')).toBeDisabled();
});

test('D4 完成后刷新：成功条与哈希恢复，不再重复弹回执', async ({ page }) => {
  const balanceBefore = await tokenBalance(RECIPIENT);
  await openTransfer(page, SENDER);
  await selectToken(page, SYMBOL);
  await fillTransfer(page, '0.1', RECIPIENT);
  await page.getByTestId('transfer-submit').click();

  await expect(page.getByTestId('transfer-receipt-amount')).toHaveText(`0.1 ${SYMBOL}`, {
    timeout: 30_000,
  });
  const hash = (await page.getByTestId('transfer-receipt-hash').innerText()).trim();
  expect(hash).toMatch(/^0x[0-9a-fA-F]{64}$/);

  await page.getByRole('button', { name: '知道了' }).click();
  await expect(page.getByTestId('transfer-success-strip')).toBeVisible();
  await expect.poll(() => tokenBalance(RECIPIENT)).toBe(balanceBefore + 100_000_000_000_000_000n);

  // 刷新：成功条回来说明这一笔，哈希可核对；回执 sheet 绝不能再次弹出。
  await page.reload();
  await connect(page);
  await expect(page.getByTestId('transfer-success-strip')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('transfer-success-strip-amount')).toHaveText(
    `已转出 0.1 ${SYMBOL}`,
  );
  await expect(page.getByTestId('transfer-success-strip-hash')).toHaveText(hash);
  await expect(page.getByTestId('transfer-receipt-amount')).toHaveCount(0);
  await shot(page, 'transfer-d4-strip-after-reload.png');
});

test('D2 恢复卡：主按钮禁用并说明，只能从卡里「重新提交」继续（不再静默）', async ({ page }) => {
  // 第一次 eth_sendTransaction 返回一个链上不存在的合法哈希，10s（e2e 构建为 4s）后
  // 进入 dropped 恢复卡；之后的真实发送放行。
  let sendRequests = 0;
  await page.route(RPC_URL, async (route) => {
    const raw = route.request().postData() ?? '';
    if (raw.includes('"eth_sendTransaction"') && sendRequests === 0) {
      sendRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: `0x${'ab'.repeat(31)}01`,
        }),
      });
      return;
    }
    await route.continue();
  });

  await openTransfer(page, SENDER);
  await selectToken(page, SYMBOL);
  await fillTransfer(page, '0.1', RECIPIENT);
  await page.getByTestId('transfer-submit').click();
  await expect(page.getByTestId('tx-watch-pending')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('tx-watch-recovery')).toBeVisible({ timeout: 40_000 });
  await shot(page, 'transfer-d2-recovery-card.png');

  const sendsBefore = (await stubState(page)).sends.length;
  expect(sendsBefore).toBe(1);
  // D2 修复：主按钮不再是「可点但静默」——它被禁用，并指向恢复卡。
  await expect(page.getByTestId('transfer-submit')).toBeDisabled();
  await expect(page.getByTestId('transfer-submit-note')).toContainText(
    '上面这笔还没有结果，请先用上面的「重新提交」或「重新查询」处理。',
  );
  await page.getByTestId('transfer-submit').click({ force: true });
  await page.waitForTimeout(1_500);
  expect((await stubState(page)).sends.length).toBe(sendsBefore);

  // 真正能继续的是恢复卡里的「重新提交」：它带链上 nonce 重发并成功出回执。
  const balanceBefore = await tokenBalance(RECIPIENT);
  await page.getByTestId('tx-watch-recovery').getByRole('button', { name: '重新提交' }).click();
  await expect.poll(() => stubState(page).then((state) => state.sends.length), {
    timeout: 30_000,
  }).toBe(sendsBefore + 1);
  await expect(page.getByTestId('transfer-receipt-amount')).toHaveText(`0.1 ${SYMBOL}`, {
    timeout: 30_000,
  });
  await expect.poll(() => tokenBalance(RECIPIENT)).toBe(balanceBefore + 100_000_000_000_000_000n);
});

test('D1 提交后立即刷新：在途卡恢复、不能再发，链上只有一笔', async ({ page }) => {
  // 先冻结出块：刷新窗口里交易必须仍在池中，pending 卡才是真实状态（与慢链一致）。
  await disableMining();
  await installWallet(page, SENDER);
  await page.goto(`/transfer${QUERY}`);
  await connect(page);
  await selectToken(page, SYMBOL);

  const balanceBefore = await tokenBalance(OUTSIDER);
  const nonceBefore = await latestNonce(SENDER);
  await fillTransfer(page, '1', OUTSIDER);
  await page.getByTestId('transfer-submit').click();

  const pending = page.getByTestId('tx-watch-pending');
  await expect(pending).toBeVisible({ timeout: 20_000 });
  const send = (await stubState(page)).sends[0];
  expect(send).toBeDefined();
  if (send === undefined) return;
  const hash = send.hash as `0x${string}`;
  expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
  // pending 卡上写的是同一个哈希，缩路口径沿用产品既有 `shortenAddress(hash, 10, 8)`：
  // 前缀是 `0x` + 10 位（共 12 个字符），后缀 8 位。刷新前留证。
  await expect(pending).toContainText(`${hash.slice(0, 12)}…${hash.slice(-8)}`);
  await shot(page, 'transfer-d1-pending-before-reload.png');

  // 关键动作：pending 可见时立刻刷新。
  await page.reload();
  await connect(page);

  // 修复：刷新后恢复同一笔的在途卡，继续 watch 同一个哈希。
  await expect(page.getByTestId('tx-watch-pending')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('tx-watch-pending')).toContainText(
    `${hash.slice(0, 12)}…${hash.slice(-8)}`,
  );
  // 在途/已成交时禁止新提交：金额与收款方也一起锁住。
  await expect(page.getByTestId('transfer-submit')).toBeDisabled();
  await expect(page.getByTestId('transfer-submit-note')).toContainText(
    '这笔转账还在确认中，确认后可以再转下一笔。',
  );
  await expect(page.getByTestId('transfer-amount')).toBeDisabled();
  await expect(page.getByTestId('transfer-recipient')).toBeDisabled();
  // 刷新后的页面没有发出任何新交易（新注入钱包的 sends 为空，链上 nonce 不变）。
  expect((await stubState(page)).sends.length).toBe(0);
  expect(await latestNonce(SENDER)).toBe(nonceBefore);
  await shot(page, 'transfer-d1-pending-after-reload.png');

  // 强制点一下（模拟用户不甘心）：按钮 disabled，不会发出第二笔。
  await page.getByTestId('transfer-submit').click({ force: true });
  await page.waitForTimeout(1_000);
  expect((await stubState(page)).sends.length).toBe(0);
  expect(await latestNonce(SENDER)).toBe(nonceBefore);

  // 出块：恢复 watcher 拿到回执，只出现这一笔的回执。
  await mine();
  await expect(page.getByTestId('transfer-receipt-amount')).toHaveText(`1 ${SYMBOL}`, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('transfer-receipt-hash')).toHaveText(hash);

  // 链上证据：收款方只 +1，发送方 nonce 只 +1 —— 一笔就是一笔。
  await expect.poll(() => tokenBalance(OUTSIDER)).toBe(balanceBefore + 1_000_000_000_000_000_000n);
  expect(await latestNonce(SENDER)).toBe(nonceBefore + 1);

  await page.getByRole('button', { name: '知道了' }).click();
  await expect(page.getByTestId('transfer-success-strip-amount')).toHaveText(`已转出 1 ${SYMBOL}`);
  await shot(page, 'transfer-d1-single-transfer-receipt.png');
});

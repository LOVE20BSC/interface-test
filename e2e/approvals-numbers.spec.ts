import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createPublicClient, encodeFunctionData, http, parseAbi } from 'viem';
import { ANVIL_RPC, anvilRpc, isolateChain } from './chain';
import { ACCOUNTS, connect, installWallet } from './wallet-stub';

/**
 * 应用·代币授权 前端线（三线校验 §3）:
 * `docs/product/three-line/approvals.md` §1 的理论值必须逐字出现在页面上。
 *
 * 断言只读页面文字（不读合约再拼答案）；链上夹具只依赖 clean bootstrap 的固定
 * 初始状态 + 测试自己通过 anvil unlocked 账户预置的 allowance。用例 C/E/F/G
 * 的「具体额度」是夹具预置的（页面只提供长期授权/撤销两种写值），其余用例走
 * 真实页面按钮。每个用例都从同一个文件级快照出发。
 */

const deployment = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/config/deployments/anvil31337_dev.json'), 'utf8'),
) as {
  addresses: {
    firstTokenAddress: `0x${string}`;
    router: `0x${string}`;
    stake: `0x${string}`;
    vote: `0x${string}`;
    submit: `0x${string}`;
    mint: `0x${string}`;
  };
};

const TOKEN = deployment.addresses.firstTokenAddress;
const ROUTER = deployment.addresses.router;
const STAKE = deployment.addresses.stake;
const VOTE = deployment.addresses.vote;
const SUBMIT = deployment.addresses.submit;
const MINT = deployment.addresses.mint;

const SYMBOL = 'TestLOVE20';
const SHOTS = resolve(process.cwd(), 'docs/product/screenshots');

// anvil #1: 99,799,100 TestLOVE20 (theory line §0). #5 is the custom spender EOA.
const WALLET = ACCOUNTS.withIdentity;
const CUSTOM_SPENDER = ACCOUNTS.eligible;

// Theory line §1 constants (deliberately re-typed here, never imported from the page).
const UNLIMITED_THRESHOLD = 2n ** 255n;
const CONCRETE = 1234567890123456789n;
const CUSTOM_AMOUNT = 2500000000000000000n;
const CONCRETE_TEXT = `1.234567 ${SYMBOL}`;
const BOUNDARY_TEXT = `57,896,044,618,658,097,711,785,492,504,343,953,926,634,992,332,820,282,019,728.792003 ${SYMBOL}`;
const BELOW_MINIMUM_TEXT = `< 0.000001 ${SYMBOL}`;

const ERC20 = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
const rpcClient = createPublicClient({ transport: http(ANVIL_RPC) });

/** Same rule as `shared/lib/format.ts#shortenAddress(a, 6, 4)`, re-typed here. */
function shortAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}

/** 10 address-book spenders render on a clean bootstrap (one row each). */
const KNOWN_SPENDER_COUNT = 10;

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});

test.describe.configure({ mode: 'serial', timeout: 240_000 });

// Snapshot the dedicated verification chain (E2E_ANVIL_RPC, default 8555; this task
// runs it against 8567). Every test below reverts back to this state afterwards.
isolateChain();

/** Pre-seed an allowance through the anvil unlocked account (a chain fixture). */
async function seedAllowance(spender: `0x${string}`, amount: bigint): Promise<void> {
  const data = encodeFunctionData({
    abi: ERC20,
    functionName: 'approve',
    args: [spender, amount],
  });
  const hash = await anvilRpc<`0x${string}`>('eth_sendTransaction', [
    { from: WALLET, to: TOKEN, data },
  ]);
  await rpcClient.waitForTransactionReceipt({ hash });
}

async function selectTestToken(page: Page): Promise<void> {
  const trigger = page.getByTestId('approvals-token');
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  // TokenPicker closes itself when an external selection lands (e.g. the page's
  // default token resolving after a reload). Opening the picker before the page owns
  // a token would be closed again with the option list gone, so wait for the resolved
  // balance row (`TestLOVE20 余额 …`) before opening it.
  await expect(page.getByTestId('approvals-balance')).toHaveText(/^\S+ 余额/, {
    timeout: 20_000,
  });
  await trigger.click();
  const option = page.getByTestId(`approvals-token-option-${SYMBOL}`);
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await expect(trigger).toContainText(SYMBOL);
}

async function openApprovals(page: Page): Promise<void> {
  await installWallet(page, WALLET);
  await page.goto('/approvals');
  await connect(page);
  await selectTestToken(page);
  await expect(page.getByTestId('approvals-balance')).toHaveText(`${SYMBOL} 余额 99,799,100`, {
    timeout: 20_000,
  });
}


/** Built-in TestWETH from the committed dev address book (D4 uses its address). */
const WETH = '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9';

const RPC_ABORT_PATTERN = new RegExp(
  `^${ANVIL_RPC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
);

/**
 * D2: the shared wallet stub has no "user rejects" knob, so the spec patches the
 * injected provider at runtime and rejects the next `eth_sendTransaction` with the
 * EIP-1193 code 4001 the app maps to 「你在钱包里点了取消，这次授权没有改动。」.
 * `restoreSend` puts the real provider back so the retry can really mine.
 */
async function rejectNextSend(page: Page): Promise<void> {
  await page.evaluate(() => {
    const holder = window as unknown as {
      ethereum: { request: (args: unknown) => Promise<unknown> };
      __approvalsOriginalRequest?: (args: unknown) => Promise<unknown>;
    };
    const provider = holder.ethereum;
    holder.__approvalsOriginalRequest = provider.request.bind(provider);
    provider.request = async (args: unknown) => {
      if ((args as { method?: string }).method === 'eth_sendTransaction') {
        const error = new Error('User rejected the request.') as Error & { code?: number };
        error.code = 4001;
        throw error;
      }
      return holder.__approvalsOriginalRequest?.(args);
    };
  });
}

async function restoreSend(page: Page): Promise<void> {
  await page.evaluate(() => {
    const holder = window as unknown as {
      ethereum: { request: (args: unknown) => Promise<unknown> };
      __approvalsOriginalRequest?: (args: unknown) => Promise<unknown>;
    };
    if (holder.__approvalsOriginalRequest !== undefined) {
      holder.ethereum.request = holder.__approvalsOriginalRequest;
      delete holder.__approvalsOriginalRequest;
    }
  });
}

test.describe('代币授权 前端线（理论线 §1）', () => {
  test('精度字样：默认社区代币 18 位不出现「精度」', async ({ page }) => {
    await openApprovals(page);

    // 全局精度显示统一 (owner 2026-11-14: 「只有18位不显示精度，其他都要显示」):
    // TestLOVE20 是 18 位，代币行不得再写「精度 18 位」。非 18 位显示那一半
    // 需要链上有非 18 位代币才能断言，随「待链恢复后统一跑」补。
    await expect(page.getByTestId('approvals-decimals')).toHaveCount(0);
    await expect(page.getByText(/精度/)).toHaveCount(0);
  });

  test('用例 A/B/D 未授权 → 长期授权 → 撤销，回执可关闭且状态不丢', async ({ page }) => {
    await openApprovals(page);

    const amount = page.getByTestId('approvals-amount-router');
    const unlimitedButton = page.getByTestId('approvals-unlimited-router');
    await expect(amount).toHaveText('未授权', { timeout: 20_000 });
    await expect(page.getByTestId('approvals-amount-stake')).toHaveText('未授权');
    await expect(page.getByTestId('approvals-revoke-router')).toBeDisabled();
    await expect(unlimitedButton).toBeEnabled();
    await expect(unlimitedButton).toHaveText('长期授权');

    // B: 长期授权，写 maxUint256 → 行金额显示 长期授权；按钮转只读的「已长期授权」。
    await unlimitedButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('把「兑换路由」设为长期授权？');
    await expect(page.getByTestId('approvals-confirm-next')).toHaveText('长期授权');
    await page.getByTestId('approvals-confirm-submit').click();
    await expect(amount).toHaveText('长期授权', { timeout: 30_000 });
    await expect(unlimitedButton).toHaveText('已长期授权');
    await expect(unlimitedButton).toBeDisabled();

    const strip = page.getByTestId('approvals-success-strip');
    await expect(strip).toContainText('已把「兑换路由」设为长期授权');
    await expect(page.getByTestId('approvals-success-strip-hash')).toHaveText(
      /^0x[0-9a-fA-F]{64}$/,
    );
    await page.getByRole('button', { name: '知道了' }).click();
    await expect(strip).toHaveCount(0);
    // 关闭回执后不丢已提交状态：列表仍是撤销后的链上真值。
    await expect(amount).toHaveText('长期授权');
    await expect(page).toHaveURL(/\/approvals(\?.*)?$/);

    // D: 撤销，写 0 → 页面显示 未授权；按钮回到可点的「长期授权」。
    await page.getByTestId('approvals-revoke-router').click();
    await expect(dialog).toContainText('撤销「兑换路由」的授权？');
    await expect(page.getByTestId('approvals-confirm-next')).toHaveText('未授权');
    await page.getByTestId('approvals-confirm-submit').click();
    await expect(amount).toHaveText('未授权', { timeout: 30_000 });
    await expect(page.getByTestId('approvals-revoke-router')).toBeDisabled();
    await expect(unlimitedButton).toHaveText('长期授权');
    await expect(unlimitedButton).toBeEnabled();
  });

  test('用例 C/E/F 具体额度截断、阈值边界与最小可见额度', async ({ page }) => {
    await seedAllowance(STAKE, CONCRETE);
    await seedAllowance(VOTE, UNLIMITED_THRESHOLD - 1n);
    await seedAllowance(SUBMIT, UNLIMITED_THRESHOLD);
    await seedAllowance(MINT, 1n);

    await openApprovals(page);

    await expect(page.getByTestId('approvals-amount-stake')).toHaveText(CONCRETE_TEXT, {
      timeout: 20_000,
    });
    // E1: 2^255 − 1 仍是具体额度，显示按 6 位小数截断。
    await expect(page.getByTestId('approvals-amount-vote')).toHaveText(BOUNDARY_TEXT);
    // E2: 2^255 起算长期授权；按钮文案为只读的「已长期授权」。
    await expect(page.getByTestId('approvals-amount-submit')).toHaveText('长期授权');
    await expect(page.getByTestId('approvals-unlimited-submit')).toBeDisabled();
    await expect(page.getByTestId('approvals-unlimited-submit')).toHaveText('已长期授权');
    // F: 1 wei 不能显示成 0（会被误读为未授权）。
    await expect(page.getByTestId('approvals-amount-mint')).toHaveText(BELOW_MINIMUM_TEXT);

    // D: 从具体额度撤销到 0。
    await page.getByTestId('approvals-revoke-stake').click();
    await page.getByTestId('approvals-confirm-submit').click();
    await expect(page.getByTestId('approvals-amount-stake')).toHaveText('未授权', {
      timeout: 30_000,
    });
  });

  test('用例 G 自定义地址：无额度提示、长期授权、撤销与非法输入', async ({ page }) => {
    await openApprovals(page);

    const input = page.getByTestId('approvals-spender');
    await input.fill(CUSTOM_SPENDER);
    const customAmount = page.getByTestId('approvals-custom-amount');
    await expect(customAmount).toHaveText('这个地址没有授权额度。', { timeout: 20_000 });
    await expect(page.getByTestId('approvals-custom-revoke')).toBeDisabled();

    // G3: 自定义地址走页面「长期授权」，确认后按钮转只读的「已长期授权」。
    await page.getByTestId('approvals-custom-unlimited').click();
    await page.getByTestId('approvals-confirm-submit').click();
    await expect(customAmount).toHaveText('长期授权', { timeout: 30_000 });
    await expect(page.getByTestId('approvals-custom-unlimited')).toHaveText('已长期授权');
    await expect(page.getByTestId('approvals-custom-unlimited')).toBeDisabled();

    await page.getByTestId('approvals-custom-revoke').click();
    await page.getByTestId('approvals-confirm-submit').click();
    await expect(customAmount).toHaveText('这个地址没有授权额度。', { timeout: 30_000 });

    // 非法地址即时提示，且不再展示额度块。
    await input.fill('0x1234');
    await expect(page.getByTestId('approvals-spender-error')).toHaveText(
      '这是一个无效的地址，需要 0x 开头的 40 位地址。',
    );
    await expect(customAmount).toHaveCount(0);

    await input.fill('0x0000000000000000000000000000000000000000');
    await expect(page.getByTestId('approvals-spender-error')).toHaveText('授权地址不能是零地址。');
  });

  test('用例 G2 自定义地址已有具体额度：显示 2.5 TestLOVE20', async ({ page }) => {
    await seedAllowance(CUSTOM_SPENDER, CUSTOM_AMOUNT);
    await openApprovals(page);

    await page.getByTestId('approvals-spender').fill(CUSTOM_SPENDER);
    await expect(page.getByTestId('approvals-custom-amount')).toHaveText(`2.5 ${SYMBOL}`, {
      timeout: 20_000,
    });
    await expect(page.getByTestId('approvals-custom-revoke')).toBeEnabled();
  });

  test('默认长期授权偏好：勾选后写入本地存储，刷新后仍为勾选', async ({ page }) => {
    await openApprovals(page);
    const preference = page.getByTestId('approvals-preference');
    await expect(preference).not.toBeChecked();

    await preference.check();
    await page.reload();
    await connect(page);
    await selectTestToken(page);
    await expect(page.getByTestId('approvals-preference')).toBeChecked();
  });

  test('页面顺序 ①→④、列表全展开、地址点击复制、无「推荐」字样', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApprovals(page);

    // 页面上下文（代币选择 + 余额）在四块之上，四块严格按 owner 2026-11-14 的顺序向下。
    const blockIds = [
      'approvals-block-preference',
      'approvals-block-guide',
      'approvals-block-custom',
      'approvals-block-known',
    ] as const;
    /** Document-relative top of a test id (immune to the scroll changes of later clicks). */
    const docTop = (testId: string): Promise<number> =>
      page.getByTestId(testId).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top + window.scrollY;
      });

    const blocks: Record<string, number> = {};
    for (const id of blockIds) {
      await page.getByTestId(id).scrollIntoViewIfNeeded();
      blocks[id] = await docTop(id);
    }
    expect(await docTop('approvals-token')).toBeLessThan(
      blocks['approvals-block-preference'] ?? NaN,
    );
    expect(blocks['approvals-block-preference']).toBeLessThan(
      blocks['approvals-block-guide'] ?? NaN,
    );
    expect(blocks['approvals-block-guide']).toBeLessThan(blocks['approvals-block-custom'] ?? NaN);
    expect(blocks['approvals-block-custom']).toBeLessThan(blocks['approvals-block-known'] ?? NaN);

    // ④ 常用合约列表全部展开：10 行都在、没有折叠容器、每行地址直接可见。
    const rows = page.locator('[data-testid^="approvals-row-"]');
    await expect(rows).toHaveCount(KNOWN_SPENDER_COUNT);
    await expect(page.locator('[data-testid^="approvals-row-"] details')).toHaveCount(0);
    await expect(page.locator('[data-testid^="approvals-address-"]')).toHaveCount(
      KNOWN_SPENDER_COUNT,
    );
    const routerAddress = page.getByTestId('approvals-address-router');
    await expect(routerAddress).toBeVisible();
    await expect(routerAddress).toContainText(shortAddress(ROUTER));
    await expect(routerAddress).toHaveAttribute('title', ROUTER);

    // 地址点击复制：按钮给「已复制」反馈，剪贴板里是完整地址。
    await routerAddress.click();
    await expect(routerAddress).toContainText('已复制');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(ROUTER);

    // owner: 不要显示「推荐」两个字。
    await expect(page.locator('body')).not.toContainText('推荐');
  });

  test('D1 默认代币：首次进入与刷新后都默认选中社区代币 TestLOVE20', async ({ page }) => {
    // 不手动选代币：社区目录首次加载结束后必须自己选中社区代币，而不是余额 0 的包装原生币。
    await installWallet(page, WALLET);
    await page.goto('/approvals');
    await connect(page);

    const trigger = page.getByTestId('approvals-token');
    await expect(trigger).toContainText(SYMBOL, { timeout: 20_000 });
    await expect(trigger).not.toContainText('TestWETH');
    await expect(page.getByTestId('approvals-balance')).toHaveText(`${SYMBOL} 余额 99,799,100`, {
      timeout: 20_000,
    });

    // F5 刷新后同样默认社区代币（不残留 TestWETH）。
    await page.reload();
    await connect(page);
    await expect(page.getByTestId('approvals-token')).toContainText(SYMBOL, { timeout: 20_000 });
    await expect(page.getByTestId('approvals-token')).not.toContainText('TestWETH');
    await expect(page.getByTestId('approvals-balance')).toHaveText(`${SYMBOL} 余额 99,799,100`, {
      timeout: 20_000,
    });
  });

  test('D2 取消签名：确认弹层内可见取消反馈，关闭后错误条仍在，重试可成功', async ({ page }) => {
    await openApprovals(page);
    await rejectNextSend(page);

    const amount = page.getByTestId('approvals-amount-router');
    const unlimitedButton = page.getByTestId('approvals-unlimited-router');
    await unlimitedButton.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('把「兑换路由」设为长期授权？');
    await page.getByTestId('approvals-confirm-submit').click();

    // 反馈必须在弹层内可见（旧实现只有被遮罩挡住的页面底部错误条）。
    const sheetError = page.getByTestId('approvals-confirm-error');
    await expect(sheetError).toBeVisible({ timeout: 20_000 });
    await expect(sheetError).toContainText('你在钱包里点了取消，这次授权没有改动。');
    await expect(sheetError).toContainText('这次没有产生交易');
    // 弹层不消失、额度没被改动、按钮恢复可点（可重试）。
    await expect(dialog).toBeVisible();
    await expect(amount).toHaveText('未授权');
    await expect(page.getByTestId('approvals-confirm-submit')).toBeEnabled();

    // 关闭弹层后页面底部错误条仍可见。
    await page.getByTestId('approvals-confirm-cancel').click();
    await expect(page.getByTestId('approvals-confirm')).toHaveCount(0);
    await expect(page.getByTestId('approvals-error')).toContainText(
      '你在钱包里点了取消，这次授权没有改动。',
    );

    // 恢复钱包后重试真的能落链。
    await restoreSend(page);
    await unlimitedButton.click();
    await page.getByTestId('approvals-confirm-submit').click();
    await expect(amount).toHaveText('长期授权', { timeout: 30_000 });
  });

  test('D3 RPC 不可用：网络读不到态 + 重新读取，不误报「没有代币」', async ({ page }) => {
    await page.route(RPC_ABORT_PATTERN, (route) => route.abort());
    await installWallet(page, WALLET);
    await page.goto('/approvals');
    await connect(page);

    const networkError = page.getByTestId('approvals-block-network-error');
    await expect(networkError).toBeVisible({ timeout: 40_000 });
    await expect(networkError).toContainText('暂时读不到网络数据');
    await expect(page.getByTestId('approvals-balance')).toHaveText('余额暂时读不到');
    await expect(page.getByTestId('approvals-network-retry')).toBeEnabled();
    // 网络故障不得被写成「没有代币」并引导用户去添加代币。
    await expect(page.locator('body')).not.toContainText('还没有可以查看的代币');
    await expect(page.locator('body')).not.toContainText('先在代币选择里添加一个 ERC20 代币地址');

    // 网络恢复后点「重新读取」自愈，不需要刷新页面。
    await page.unroute(RPC_ABORT_PATTERN);
    await page.getByTestId('approvals-network-retry').click();
    await expect(page.getByTestId('approvals-block-network-error')).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByTestId('approvals-token')).toContainText(SYMBOL, { timeout: 30_000 });
    await expect(page.getByTestId('approvals-balance')).toHaveText(`${SYMBOL} 余额 99,799,100`, {
      timeout: 30_000,
    });
    // 授权额度块也真的读出来了（D2 用例可能已把 router 设为长期授权，这里只要求行可见）。
    await expect(page.getByTestId('approvals-amount-router')).toBeVisible({ timeout: 30_000 });
  });

  test('D4 自定义代币按地址去重：添加内置 TestWETH 不再出现第二个同名项', async ({ page }) => {
    await openApprovals(page);
    const trigger = page.getByTestId('approvals-token');

    await trigger.click();
    await page.getByTestId('approvals-token-custom-address').fill(WETH);
    await page.getByRole('button', { name: '添加代币' }).click();

    // 已在目录里 → 直接选中内置项（包装原生币），余额按该代币读。
    await expect(trigger).toContainText('TestWETH', { timeout: 20_000 });
    await expect(page.getByTestId('approvals-balance')).toHaveText('TestWETH 余额 0', {
      timeout: 20_000,
    });

    // 选择器里 TestWETH 只有一个（旧实现是两个同名项），并说明已在包装原生币分组。
    await trigger.click();
    await expect(page.getByTestId('approvals-token-option-TestWETH')).toHaveCount(1);
    await expect(page.getByTestId('approvals-token-custom-duplicate')).toContainText(
      'TestWETH 已经在「包装原生币」里，不用重复添加。',
    );
  });
});

/**
 * 验收截图：390×844 与 1280×800、浅色与深色，覆盖 列表态（全部展开 + 地址可复制）/
 * 撤销确认 / 自定义地址。主题通过 `love20:theme`（bootstrap 在首帧前读取）切换，每个
 * 组合都是一次真实加载。列表态滚到「常用合约」块，因为这一块现在是页尾的第 ④ 块，
 * 首屏只看到 ①/②。
 */
test.describe('代币授权 验收截图', () => {
  const VIEWPORTS = [
    { key: 'mobile', width: 390, height: 844 },
    { key: 'desktop', width: 1280, height: 800 },
  ] as const;
  const THEMES = ['light', 'dark'] as const;

  async function prepare(page: Page, theme: 'light' | 'dark', width: number, height: number) {
    await page.setViewportSize({ width, height });
    await page.addInitScript((nextTheme: string) => {
      window.localStorage.setItem('love20:theme', nextTheme);
    }, theme);
    await page.goto('/approvals');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await connect(page);
    await selectTestToken(page);
    await expect(page.getByTestId('approvals-amount-router')).toHaveText('长期授权', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('approvals-amount-stake')).toHaveText(CONCRETE_TEXT);
  }

  async function shoot(page: Page, name: string): Promise<void> {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({
      path: resolve(SHOTS, `approvals-${name}.png`),
      animations: 'disabled',
      fullPage: false,
    });
  }

  test('列表态 / 撤销确认 / 自定义地址截图', async ({ page }) => {
    // Deterministic three-state list: router 长期授权, stake 具体额度, others 未授权.
    await seedAllowance(ROUTER, 2n ** 256n - 1n);
    await seedAllowance(STAKE, CONCRETE);
    await seedAllowance(CUSTOM_SPENDER, CUSTOM_AMOUNT);
    await installWallet(page, WALLET);

    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await prepare(page, theme, viewport.width, viewport.height);

        // ④ 常用合约列表：全部展开、每行地址直接可见、点击复制。
        // 用固定偏移滚（而不是 scrollIntoView start），避免块标题被吸顶页头盖住。
        await page.getByTestId('approvals-block-known').evaluate((element) => {
          const top = element.getBoundingClientRect().top + window.scrollY;
          window.scrollTo({ top: Math.max(0, top - 88) });
        });
        await shoot(page, `list-${theme}-${viewport.key}`);

        await page.getByTestId('approvals-revoke-router').click();
        await expect(page.getByTestId('approvals-confirm')).toBeVisible();
        await shoot(page, `confirm-${theme}-${viewport.key}`);
        await page.getByTestId('approvals-confirm-cancel').click();
        await expect(page.getByTestId('approvals-confirm')).toHaveCount(0);

        await page.getByTestId('approvals-spender').fill(CUSTOM_SPENDER);
        await expect(page.getByTestId('approvals-custom-amount')).toHaveText(`2.5 ${SYMBOL}`);
        await page
          .getByTestId('approvals-custom-amount')
          .evaluate((element) => element.scrollIntoView({ block: 'center' }));
        await shoot(page, `custom-${theme}-${viewport.key}`);
      }
    }
  });
});

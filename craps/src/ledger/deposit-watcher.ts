/**
 * Deposit Watcher — Ace watches Base for incoming USDC
 *
 * Polls Base RPC for ERC-20 Transfer events to the house wallet.
 * When a new transfer is detected, Ace auto-confirms the deposit.
 */

import { ChipLedger } from './chip-ledger.js';

// ERC-20 Transfer event signature: Transfer(address,address,uint256)
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const BASE_RPC = process.env.BASE_RPC_URL ?? 'https://mainnet.base.org';

interface WatcherConfig {
  tokenAddress: string;
  houseWallet: string;
  ledger: ChipLedger;
  pollIntervalMs?: number;
  onDeposit?: (player: string, amount: bigint, txHash: string) => void;
}

export function startDepositWatcher(config: WatcherConfig): { stop: () => void } {
  const {
    tokenAddress,
    houseWallet,
    ledger,
    pollIntervalMs = 15_000, // every 15s
    onDeposit,
  } = config;

  const houseAddrPadded = '0x' + houseWallet.slice(2).toLowerCase().padStart(64, '0');
  const seenTxHashes = new Set<string>();
  let lastBlock = 'latest';
  let running = true;

  // Load already-confirmed txHashes so we don't double-credit
  const history = ledger.getHistory(undefined, 500);
  for (const entry of history) {
    if (entry.ref && entry.ref.startsWith('0x')) {
      seenTxHashes.add(entry.ref.toLowerCase());
    }
  }

  async function poll(): Promise<void> {
    if (!running) return;

    try {
      // Get current block number
      const blockResp = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1,
        }),
      });
      const blockData = await blockResp.json() as { result: string };
      const currentBlock = parseInt(blockData.result, 16);

      // Look back ~50 blocks (~100s on Base) to catch recent transfers
      const fromBlock = '0x' + Math.max(0, currentBlock - 50).toString(16);

      // Query Transfer events TO the house wallet
      const logsResp = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getLogs',
          params: [{
            fromBlock,
            toBlock: 'latest',
            address: tokenAddress,
            topics: [
              TRANSFER_TOPIC,
              null, // from: any
              houseAddrPadded, // to: house wallet
            ],
          }],
          id: 2,
        }),
      });

      const logsData = await logsResp.json() as { result: Array<{ transactionHash: string; topics: string[]; data: string }> };
      const logs = logsData.result || [];

      for (const log of logs) {
        const txHash = log.transactionHash.toLowerCase();
        if (seenTxHashes.has(txHash)) continue;
        seenTxHashes.add(txHash);

        // Decode sender and amount
        const fromPadded = log.topics[1]!;
        const sender = '0x' + fromPadded.slice(26); // remove 0x + 24 zero chars
        const amount = BigInt(log.data);

        if (amount <= 0n) continue;

        // Auto-confirm deposit
        try {
          ledger.confirmDeposit(sender, amount, txHash);
          console.log(`\x1b[32m🦞 Ace confirmed deposit: ${sender.slice(0, 10)}... sent ${Number(amount) / 1e6} USDC (tx: ${txHash.slice(0, 12)}...)\x1b[0m`);
          onDeposit?.(sender, amount, txHash);
        } catch (err) {
          // Duplicate txHash or below minimum — skip
          console.log(`[deposit-watcher] Skip tx ${txHash.slice(0, 12)}: ${(err as Error).message}`);
        }
      }

      lastBlock = '0x' + currentBlock.toString(16);
    } catch (err) {
      console.error('[deposit-watcher] Poll error:', (err as Error).message);
    }
  }

  // Initial poll + interval
  poll();
  const interval = setInterval(poll, pollIntervalMs);

  console.log(`\x1b[32m🦞 Ace is watching Base for USDC deposits to ${houseWallet.slice(0, 10)}...\x1b[0m`);
  console.log(`   Token: ${tokenAddress}`);
  console.log(`   Polling every ${pollIntervalMs / 1000}s`);

  return {
    stop() {
      running = false;
      clearInterval(interval);
    },
  };
}

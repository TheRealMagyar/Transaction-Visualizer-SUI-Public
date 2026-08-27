# Transaction Visualizer (Sui)

Next.js app that visualizes a **Sui testnet** wallet's transaction network as an interactive graph.

## What it does

- Enter a Sui address, lookback period (days), and graph depth
- Queries the public Sui testnet fullnode (`suix_queryTransactionBlocks`, `suix_getBalance`) via axios
- Recursively collects related addresses up to the chosen depth
- Renders nodes (wallets + balances) and edges (transfers) with [Cytoscape.js](https://js.cytoscape.org/)

## Stack

- Next.js 15, React 19, Tailwind CSS 4
- `axios`, `cytoscape`

## Run locally

```bash
npm install
npm run dev
```

Uses `https://fullnode.testnet.sui.io:443` (see `src/utils/suiApi.js`).

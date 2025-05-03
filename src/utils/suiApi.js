import axios from "axios";

const SUI_API_URL = "https://fullnode.testnet.sui.io:443";

// Fetch transactions
export async function getTransactions(address, startTime, endTime) {
  try {
    // Query with FromAddress filter
    const fromResponse = await axios.post(SUI_API_URL, {
      jsonrpc: "2.0",
      id: 1,
      method: "suix_queryTransactionBlocks",
      params: [
        {
          filter: { FromAddress: address },
          options: {
            showInput: true,
            showEffects: true,
            showBalanceChanges: true,
          },
        },
        null,
        50,
        true,
      ],
    });

    // Query with ToAddress filter
    const toResponse = await axios.post(SUI_API_URL, {
      jsonrpc: "2.0",
      id: 1,
      method: "suix_queryTransactionBlocks",
      params: [
        {
          filter: { ToAddress: address },
          options: {
            showInput: true,
            showEffects: true,
            showBalanceChanges: true,
          },
        },
        null,
        50,
        true,
      ],
    });

    console.log(
      "getTransactions FromAddress API response:",
      JSON.stringify(fromResponse.data, null, 2)
    );
    console.log(
      "getTransactions ToAddress API response:",
      JSON.stringify(toResponse.data, null, 2)
    );

    if (fromResponse.data.error) {
      throw new Error(
        `FromAddress API error: ${fromResponse.data.error.message}`
      );
    }
    if (toResponse.data.error) {
      throw new Error(`ToAddress API error: ${toResponse.data.error.message}`);
    }

    // Combine transactions, avoiding duplicates
    const fromTransactions = fromResponse.data.result?.data || [];
    const toTransactions = toResponse.data.result?.data || [];
    const allTransactions = [...fromTransactions, ...toTransactions].filter(
      (tx, index, self) =>
        index === self.findIndex((t) => t.digest === tx.digest)
    );

    return allTransactions.map((tx) => {
      const balanceChanges = tx.balanceChanges || [];
      let amount = 0;
      let from = tx.transaction?.data?.sender || "";
      let to = tx.transaction?.data?.recipient || ""; // Empty to is allowed

      if (balanceChanges.length > 0) {
        for (const change of balanceChanges) {
          if (change.coinType === "0x2::sui::SUI") {
            const changeAmount = Number(change.amount);
            if (change.owner?.AddressOwner === address) {
              amount = Math.abs(changeAmount);
              if (changeAmount < 0) {
                from = address;
                to =
                  balanceChanges.find((c) => c.owner?.AddressOwner !== address)
                    ?.owner?.AddressOwner ||
                  tx.transaction?.data?.recipient ||
                  "";
              } else if (changeAmount > 0) {
                from =
                  balanceChanges.find((c) => c.owner?.AddressOwner !== address)
                    ?.owner?.AddressOwner ||
                  tx.transaction?.data?.sender ||
                  "";
                to = address;
              }
            }
          }
        }
      } else {
        amount = tx.transaction?.data?.gasData?.price || 0;
        console.warn("No balanceChanges, using fallback data:", tx);
      }

      const transaction = {
        from,
        to,
        amount,
        digest: tx.digest,
        timestampMs: tx.timestampMs || Date.now(),
        balanceChanges,
        effects: tx.effects,
        input: tx.transaction?.data,
      };

      console.log(
        "Processed transaction:",
        JSON.stringify(transaction, null, 2)
      );
      return transaction;
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    throw error;
  }
}

// Fetch balance
export async function getBalance(address) {
  try {
    const response = await axios.post(SUI_API_URL, {
      jsonrpc: "2.0",
      id: 1,
      method: "suix_getBalance",
      params: [address, "0x2::sui::SUI"],
    });

    console.log(
      "getBalance API response:",
      JSON.stringify(response.data, null, 2)
    );

    const balance = response.data.result?.totalBalance;
    const numericBalance = isNaN(Number(balance)) ? 0 : Number(balance);
    return numericBalance;
  } catch (error) {
    console.error(`Error fetching balance (${address}):`, error);
    return 0;
  }
}

// Recursive transaction collection
export async function collectTransactions(address, depth, startTime, endTime) {
  const visited = new Set();
  const nodes = new Map();
  const edges = new Map(); // Deduplicate edges by digest

  async function fetchTransactions(currentAddress, currentDepth) {
    if (
      currentDepth > depth ||
      visited.has(currentAddress) ||
      !currentAddress
    ) {
      return;
    }
    visited.add(currentAddress);

    try {
      const transactions = await getTransactions(
        currentAddress,
        startTime,
        endTime
      );
      const balance = await getBalance(currentAddress);

      nodes.set(currentAddress, {
        id: currentAddress,
        balance,
        tokenBalances: [],
      });

      for (const tx of transactions) {
        const source = tx.from;
        const target = tx.to || tx.from; // Use from if to is empty
        const amount = tx.amount;

        if (source && amount >= 0) {
          const edgeId = tx.digest || `${source}-${target}-${tx.timestampMs}`;
          if (!edges.has(edgeId)) {
            edges.set(edgeId, {
              source,
              target,
              amount,
              digest: tx.digest,
              timestampMs: tx.timestampMs,
              balanceChanges: tx.balanceChanges,
              effects: tx.effects,
              input: tx.input,
            });
          }

          if (source !== currentAddress) {
            await fetchTransactions(source, currentDepth + 1);
          }
          if (target !== currentAddress && target !== source && target !== "") {
            await fetchTransactions(target, currentDepth + 1);
          }
        } else {
          console.warn("Skipped transaction (invalid source or amount):", tx);
        }
      }
    } catch (error) {
      console.error(
        `Error collecting transactions (${currentAddress}):`,
        error
      );
      nodes.set(currentAddress, {
        id: currentAddress,
        balance: 0,
        tokenBalances: [],
      });
    }
  }

  await fetchTransactions(address, 0);

  const result = {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
  };

  console.log("collectTransactions result:", JSON.stringify(result, null, 2));
  return result;
}

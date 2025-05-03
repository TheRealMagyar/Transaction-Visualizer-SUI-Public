"use client";

import React, { useState, useMemo, useCallback } from "react";
import TransactionGraph from "./components/TransactionGraph";
import { collectTransactions } from "../utils/suiApi";

export default function Home() {
  const [address, setAddress] = useState("");
  const [days, setDays] = useState(30);
  const [depth, setDepth] = useState(2);
  const [graphData, setGraphData] = useState({
    nodes: [],
    edges: [],
    mainAddress: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Wallet address validation
  const validateAddress = (addr) => {
    if (!addr || typeof addr !== "string") return false;
    return /^0x[0-9a-fA-F]+$/.test(addr.trim());
  };

  // Data validation
  const validateGraphData = (nodes, edges, mainAddress) => {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      console.warn("Invalid data structure: nodes or edges is not an array.");
      return false;
    }

    const invalidNodes = nodes.filter(
      (node) => !node?.id || typeof node.balance === "undefined"
    );
    const invalidEdges = edges.filter(
      (edge) =>
        !edge?.source ||
        !edge?.target ||
        edge.source === edge.target ||
        typeof edge.amount === "undefined"
    );

    if (invalidNodes.length > 0) {
      console.warn("Invalid nodes:", invalidNodes);
      return false;
    }
    if (invalidEdges.length > 0) {
      console.warn("Invalid edges:", invalidEdges);
    }

    const nodeIds = new Set(nodes.map((node) => node.id));
    const invalidEdgeReferences = edges.filter(
      (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
    );
    if (invalidEdgeReferences.length > 0) {
      console.warn(
        "Edges with invalid node references:",
        invalidEdgeReferences
      );
      return false;
    }

    if (typeof mainAddress !== "string" || mainAddress.trim() === "") {
      console.warn("Invalid mainAddress:", mainAddress);
      return false;
    }

    return true;
  };

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setLoading(true);
      setError(null);
      setGraphData({ nodes: [], edges: [], mainAddress: "" });

      const trimmedAddress = address.trim();
      if (!validateAddress(trimmedAddress)) {
        setError(
          "Invalid wallet address. Please enter a valid Sui testnet address (e.g., 0x123...)."
        );
        setLoading(false);
        return;
      }

      try {
        const endTime = Date.now();
        const startTime = endTime - days * 24 * 60 * 60 * 1000;
        const data = await collectTransactions(
          trimmedAddress,
          depth,
          startTime,
          endTime
        );

        console.log(
          "collectTransactions response:",
          JSON.stringify(data, null, 2)
        );

        // Validate the data
        if (!validateGraphData(data.nodes, data.edges, trimmedAddress)) {
          setError(
            "The received data is partially invalid. Only the wallet balance will be displayed if available."
          );
        }

        if (!data.nodes.length) {
          setError(
            "No data found for the provided wallet address. Check the address, time range, or depth."
          );
        } else {
          setGraphData({
            nodes: data.nodes,
            edges: data.edges,
            mainAddress: trimmedAddress,
          });
          if (data.nodes.length === 1 && !data.edges.length) {
            setError(
              "No transactions found for the provided wallet address within the specified time range, but the balance is displayed."
            );
          }
        }
      } catch (err) {
        setError(
          `Error fetching data: ${err.message}. Check the address or network connection.`
        );
        console.error("Error in handleSubmit:", err);
      } finally {
        setLoading(false);
      }
    },
    [address, days, depth]
  );

  // Deep memoization for stability
  const memoizedGraphData = useMemo(() => {
    console.log("memoizedGraphData updated:", {
      nodesLength: graphData.nodes.length,
      edgesLength: graphData.edges.length,
      mainAddress: graphData.mainAddress,
    });
    return {
      nodes: graphData.nodes,
      edges: graphData.edges,
      mainAddress: graphData.mainAddress,
    };
  }, [
    JSON.stringify(graphData.nodes),
    JSON.stringify(graphData.edges),
    graphData.mainAddress,
  ]);

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Sui Transaction Visualizer</h1>
      <p>
        Enter a Sui testnet wallet address to visualize the transaction network.
      </p>
      <form onSubmit={handleSubmit} style={{ marginBottom: "20px" }}>
        <div style={{ margin: "10px 0" }}>
          <label>Wallet Address: </label>
          <input
            type="text"
            placeholder="E.g., 0x123..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ padding: "5px", width: "300px" }}
            required
          />
        </div>
        <div style={{ margin: "10px 0" }}>
          <label>Lookback Period (days): </label>
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: "5px", width: "100px" }}
            min="1"
            max="90"
            required
          />
        </div>
        <div style={{ margin: "10px 0" }}>
          <label>Depth: </label>
          <input
            type="number"
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            style={{ padding: "5px", width: "100px" }}
            min="1"
            max="5"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "8px 16px",
            backgroundColor: loading ? "#ccc" : "#007bff",
            color: "white",
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Loading..." : "Visualize"}
        </button>
      </form>
      {error && <p style={{ color: "red", maxWidth: "600px" }}>{error}</p>}
      {memoizedGraphData.nodes.length > 0 ? (
        <TransactionGraph
          nodes={memoizedGraphData.nodes}
          edges={memoizedGraphData.edges}
          mainAddress={memoizedGraphData.mainAddress}
        />
      ) : (
        <p>No data to display. Please enter a valid address and try again.</p>
      )}
    </div>
  );
}

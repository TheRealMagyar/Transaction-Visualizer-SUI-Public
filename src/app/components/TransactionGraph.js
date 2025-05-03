import React, { useEffect, useRef, useState, useMemo } from "react";
import cytoscape from "cytoscape";

function TransactionGraph({ nodes, edges, mainAddress }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const layoutRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [error, setError] = useState(null);
  const [showLoopTransactions, setShowLoopTransactions] = useState(false);
  const isMountedRef = useRef(true);

  // Memoization of validated nodes
  const validNodes = useMemo(() => {
    if (!Array.isArray(nodes)) {
      console.warn("nodes is not an array, returning an empty array.");
      return [];
    }
    const invalidNodes = nodes.filter(
      (node) => !node?.id || typeof node.balance === "undefined"
    );
    if (invalidNodes.length > 0) {
      console.warn("Invalid nodes:", invalidNodes);
    }
    return nodes
      .filter((node) => {
        const isValid =
          node?.id &&
          typeof node.id === "string" &&
          (typeof node.balance === "number" ||
            (typeof node.balance === "string" && !isNaN(Number(node.balance))));
        if (!isValid) {
          console.warn("Invalid node, skipping:", node);
        }
        return isValid;
      })
      .map((node) => ({
        data: {
          id: node.id,
          balance: Number(node.balance) || 0,
          tokenBalances: Array.isArray(node.tokenBalances)
            ? node.tokenBalances
            : [],
          label: `${node.id.slice(0, 6)}...\nBalance: ${(
            Number(node.balance) / 1e9
          ).toFixed(2)} SUI`,
          isMain: node.id === mainAddress,
        },
      }));
  }, [nodes, mainAddress]);

  // Memoization of validated edges
  const validEdges = useMemo(() => {
    if (!Array.isArray(edges)) {
      console.warn("edges is not an array, returning an empty array.");
      return [];
    }
    const nodeIds = new Set(validNodes.map((node) => node.data.id));
    const invalidEdges = edges.filter(
      (edge) => !edge?.source || !nodeIds.has(edge.source)
    );
    const loopEdges = edges.filter(
      (edge) => edge?.source === (edge?.target || edge.source)
    );
    console.log(
      "Number of loop transactions (including empty to fields):",
      loopEdges.length,
      "Loop transactions:",
      JSON.stringify(loopEdges, null, 2)
    );

    if (invalidEdges.length > 0) {
      console.warn("Invalid edges (missing or invalid source):", invalidEdges);
    }

    return edges
      .filter((edge) => {
        const target = edge.target || edge.source;
        const isValid =
          edge?.source &&
          target &&
          nodeIds.has(edge.source) &&
          nodeIds.has(target) &&
          (typeof edge.amount === "number" ||
            (typeof edge.amount === "string" && !isNaN(Number(edge.amount))));
        if (!isValid) {
          console.warn("Invalid edge:", edge);
          return false;
        }
        return (
          showLoopTransactions || (edge.source !== target && edge.target !== "")
        );
      })
      .map((edge, index) => {
        const target = edge.target || edge.source;
        const isLoop = edge.source === target || edge.target === "";
        return {
          data: {
            id: edge.digest
              ? `${edge.digest}-${index}`
              : `${edge.source}-${target}-${index}`,
            source: edge.source,
            target,
            amount: Number(edge.amount) || 0,
            label: `${(Number(edge.amount) / 1e9).toFixed(2)} SUI${
              isLoop
                ? edge.target === ""
                  ? " (Empty address, Loop)"
                  : " (Loop)"
                : ""
            }`,
            digest: edge.digest,
            timestampMs: edge.timestampMs,
            balanceChanges: Array.isArray(edge.balanceChanges)
              ? edge.balanceChanges
              : [],
            effects: edge.effects,
            input: edge.input,
          },
        };
      });
  }, [edges, validNodes, showLoopTransactions]);

  // Button event handler
  const toggleLoopTransactions = () => {
    setShowLoopTransactions((prev) => {
      const newState = !prev;
      console.log(
        "Loop transactions state:",
        newState ? "Enabled" : "Disabled"
      );
      return newState;
    });
  };

  useEffect(() => {
    console.log("TransactionGraph useEffect running, inputs:", {
      nodes: JSON.stringify(nodes, null, 2),
      edges: JSON.stringify(edges, null, 2),
      mainAddress,
      nodesLength: nodes?.length,
      edgesLength: edges?.length,
      validNodesLength: validNodes.length,
      validEdgesLength: validEdges.length,
      showLoopTransactions,
    });

    isMountedRef.current = true;

    if (!containerRef.current) {
      const errorMsg = "The container element was not found.";
      console.warn(errorMsg);
      setError(errorMsg);
      return;
    }

    if (!Array.isArray(nodes) || !Array.isArray(edges)) {
      const errorMsg = "Nodes or edges are not arrays.";
      console.warn(errorMsg);
      setError(errorMsg);
      return;
    }

    if (!validNodes.length) {
      const errorMsg = "No valid nodes available for graph rendering.";
      console.warn(errorMsg);
      setError(errorMsg);
      return;
    }

    let cyInstance = null;
    try {
      cyInstance = cytoscape({
        container: containerRef.current,
        elements: [...validNodes, ...validEdges],
        style: [
          {
            selector: "node",
            style: {
              "background-color": "#007bff",
              label: "data(label)",
              width: "mapData(balance, 0, 10000000000, 20, 100)",
              height: "mapData(balance, 0, 10000000000, 20, 100)",
              "text-wrap": "wrap",
              "text-valign": "center",
              "text-halign": "center",
              color: "#fff",
              "font-size": "10px",
              "text-outline-color": "#000",
              "text-outline-width": 1,
            },
          },
          {
            selector: "node[isMain = true]",
            style: {
              "background-color": "#00ff00",
            },
          },
          {
            selector: "edge",
            style: {
              width: "mapData(amount, 0, 1000000000, 2, 8)",
              "line-color": "#ccc",
              "target-arrow-color": "#ccc",
              "target-arrow-shape": "triangle",
              label: "data(label)",
              "font-size": "8px",
              color: "#333",
              "text-outline-color": "#fff",
              "text-outline-width": 1,
              "curve-style": "bezier",
            },
          },
          {
            selector: "edge[source = target], edge[target = '']",
            style: {
              "line-color": "#ff0000",
              "target-arrow-color": "#ff0000",
            },
          },
        ],
      });

      if (cyInstance) {
        cyRef.current = cyInstance;
        console.log("Cytoscape successfully initialized.");
      }

      const layoutConfig = {
        name: validNodes.length === 1 ? "grid" : "cose",
        fit: true,
        padding: 30,
        nodeRepulsion: 10000,
        idealEdgeLength: 50,
        animationDuration: 500,
        animate: validNodes.length !== 1,
      };
      layoutRef.current = cyInstance.layout(layoutConfig);
      layoutRef.current.run();
      console.log("Layout executed:", layoutConfig);

      const nodeTapHandler = (evt) => {
        if (!isMountedRef.current || !cyRef.current || !containerRef.current) {
          console.warn(
            "Component unmounted or cyRef/containerRef null, node tap event skipped."
          );
          return;
        }
        setTimeout(() => {
          if (!isMountedRef.current || !cyRef.current) return;
          console.log("Node tap event:", evt.target.data());
          const node = evt.target;
          cyRef.current
            .nodes()
            .filter((n) => !n.data("isMain"))
            .style({ "background-color": "#007bff" });
          cyRef.current.edges().style({ "line-color": "#ccc" });
          if (!node.data("isMain")) {
            node.style({ "background-color": "#ff4500" });
          }
          node.connectedEdges().style({ "line-color": "#ff4500" });
          setSelectedNode(node.data());
          setSelectedEdge(null);
        }, 10);
      };

      const edgeTapHandler = (evt) => {
        if (!isMountedRef.current || !cyRef.current || !containerRef.current) {
          console.warn(
            "Component unmounted or cyRef/containerRef null, edge tap event skipped."
          );
          return;
        }
        setTimeout(() => {
          if (!isMountedRef.current || !cyRef.current) return;
          console.log("Edge tap event:", evt.target.data());
          const edge = evt.target;
          cyRef.current
            .nodes()
            .filter((n) => !n.data("isMain"))
            .style({ "background-color": "#007bff" });
          cyRef.current.edges().style({ "line-color": "#ccc" });
          edge.style({ "line-color": "#ff4500" });
          setSelectedEdge(edge.data());
          setSelectedNode(null);
        }, 10);
      };

      cyInstance.on("tap", "node", nodeTapHandler);
      cyInstance.on("tap", "edge", edgeTapHandler);

      const mouseUpHandler = (evt) => {
        if (!isMountedRef.current || !cyRef.current || !containerRef.current) {
          console.warn(
            "Mouseup event skipped, component unmounted or cyRef/containerRef null."
          );
          return;
        }
        console.log("Global mouseup event:", evt);
      };
      containerRef.current.addEventListener("mouseup", mouseUpHandler);

      cyInstance.on("layoutstart", () => {
        console.log("Layout animation started.");
      });
      cyInstance.on("layoutstop", () => {
        console.log("Layout animation stopped.");
      });

      return () => {
        console.log("TransactionGraph cleanup running.");
        isMountedRef.current = false;
        if (cyRef.current && containerRef.current) {
          try {
            if (layoutRef.current) {
              layoutRef.current.stop();
              console.log("Layout stopped.");
            }
            cyRef.current.off("tap", "node", nodeTapHandler);
            cyRef.current.off("tap", "edge", edgeTapHandler);
            cyRef.current.off("layoutstart");
            cyRef.current.off("layoutstop");
            containerRef.current.removeEventListener("mouseup", mouseUpHandler);
            cyRef.current.destroy();
            console.log("Cytoscape successfully destroyed.");
          } catch (error) {
            console.error("Error during Cytoscape cleanup:", error);
          }
          cyRef.current = null;
          layoutRef.current = null;
        }
      };
    } catch (error) {
      console.error("Error during Cytoscape initialization:", error);
      setError("An error occurred while initializing the graph.");
      return;
    }
  }, [validNodes, validEdges, mainAddress]);

  return (
    <div style={{ display: "flex", width: "100%", flexDirection: "column" }}>
      {error ? (
        <div style={{ color: "red", padding: "20px" }}>{error}</div>
      ) : (
        <>
          <div style={{ marginBottom: "10px" }}>
            <button
              onClick={toggleLoopTransactions}
              style={{
                padding: "8px 16px",
                backgroundColor: showLoopTransactions ? "#ff4500" : "#007bff",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              {showLoopTransactions
                ? "Disable Loop Transactions"
                : "Enable Loop Transactions"}
            </button>
          </div>
          <div style={{ display: "flex", width: "100%" }}>
            <div
              ref={containerRef}
              style={{
                width: "70%",
                height: "600px",
                border: "1px solid #ccc",
                backgroundColor: "#f9f9f9",
              }}
            />
            <div
              style={{
                width: "30%",
                height: "600px",
                padding: "10px",
                border: "1px solid #ccc",
                backgroundColor: "#fff",
                overflowY: "auto",
              }}
            >
              {selectedEdge ? (
                <div className="p-4 rounded-lg">
                  <h3 className="text-black">Selected Transaction</h3>
                  <p>
                    <strong>Transaction ID (Digest):</strong>{" "}
                    {selectedEdge.digest || "N/A"}
                  </p>
                  <p>
                    <strong>Amount:</strong>{" "}
                    {(selectedEdge.amount / 1e9).toFixed(2)} SUI
                  </p>
                  <p>
                    <strong>Sender:</strong> {selectedEdge.source}
                  </p>
                  <p>
                    <strong>Recipient:</strong> {selectedEdge.target}
                  </p>
                  <p>
                    <strong>Timestamp:</strong>{" "}
                    {selectedEdge.timestampMs
                      ? new Date(
                          Number(selectedEdge.timestampMs)
                        ).toLocaleString()
                      : "N/A"}
                  </p>
                  <p>
                    <strong>Balance Changes:</strong>
                  </p>
                  {Array.isArray(selectedEdge.balanceChanges) &&
                  selectedEdge.balanceChanges.length > 0 ? (
                    <ul>
                      {selectedEdge.balanceChanges.map((change, index) => (
                        <li key={change.coinType || index}>
                          {change.coinType}: {change.amount} (
                          {change.owner?.AddressOwner || "Unknown owner"})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No balance changes.</p>
                  )}
                  <p>
                    <strong>Effects:</strong>{" "}
                    {selectedEdge.effects?.status?.status || "N/A"}
                  </p>
                  <div>
                    <strong>Input:</strong>
                    {selectedEdge.input ? (
                      <pre className="mt-2 bg-gray-100 p-2 rounded">
                        {JSON.stringify(selectedEdge.input, null, 2)}
                      </pre>
                    ) : (
                      <span> N/A</span>
                    )}
                  </div>
                </div>
              ) : selectedNode ? (
                <div className="p-4 rounded-lg">
                  <h3 className="text-black">Selected Wallet</h3>
                  <p>
                    <strong>Address:</strong> {selectedNode.id}
                  </p>
                  <p>
                    <strong>Balance:</strong>{" "}
                    {(selectedNode.balance / 1e9).toFixed(2)} SUI
                  </p>
                  <p>
                    <strong>Held Tokens:</strong>
                  </p>
                  {(() => {
                    console.log(
                      "selectedNode.tokenBalances:",
                      selectedNode.tokenBalances
                    ); // Debug log
                    if (!Array.isArray(selectedNode.tokenBalances)) {
                      console.warn(
                        "tokenBalances is not an array:",
                        selectedNode.tokenBalances
                      );
                      return <p>Invalid token data.</p>;
                    }
                    if (selectedNode.tokenBalances.length === 0) {
                      return <p>No held tokens.</p>;
                    }
                    const validTokens = selectedNode.tokenBalances.filter(
                      (token) => {
                        const isValid =
                          token &&
                          typeof token === "object" &&
                          (typeof token.coinType === "string" ||
                            token.coinType === null) &&
                          (typeof token.totalBalance === "number" ||
                            (typeof token.totalBalance === "string" &&
                              !isNaN(Number(token.totalBalance))));
                        if (!isValid) {
                          console.warn("Invalid token object:", token);
                        }
                        return isValid;
                      }
                    );
                    if (validTokens.length === 0) {
                      console.warn(
                        "No valid token objects in tokenBalances:",
                        selectedNode.tokenBalances
                      );
                      return <p>No valid tokens found.</p>;
                    }
                    return (
                      <ul>
                        {validTokens.map((token, index) => (
                          <li key={token.coinType || `token-${index}`}>
                            {token.coinType || "Unknown Token"}:{" "}
                            {(Number(token.totalBalance) || 0).toFixed(2)} token
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              ) : (
                <p>Click on a wallet or transaction to view details.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default TransactionGraph;

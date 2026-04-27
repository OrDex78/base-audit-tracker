"use client";

import { useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { ConnectWallet } from "@coinbase/onchainkit/wallet";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { keccak256, toBytes } from "viem";
import { lookupRegistry, auditRegistry } from "@/lib/auditRegistry";
import type { RegistryEntry } from "@/lib/auditRegistry";
import { computeRiskSignals } from "@/lib/riskSignals";
import type { TokenSecurity } from "@/lib/riskSignals";

const CONTRACT_ADDRESS = "0xD060A6B3f065216c1D92B3F29ef67D65eCe06567";
const CONTRACT_ABI = [
  {
    name: "submitFinding",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "findingHash", type: "bytes32" },
      { name: "severity", type: "uint8" },
      { name: "target", type: "string" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    name: "totalFindings",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "getResearcherFindings",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "researcher", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
] as const;

const SEVERITY_LABELS = ["Low", "Medium", "High", "Critical"];
const SEVERITY_COLORS = ["#22c55e", "#f59e0b", "#f97316", "#ef4444"];

interface SearchResult {
  address: string;
  isVerified?: boolean;
  contractName?: string;
  compiler?: string;
  error?: boolean;
  registry?: RegistryEntry | null;
  goplus?: TokenSecurity | null;
  riskScore?: number;
  riskLabel?: string;
  confidence?: "High" | "Medium" | "Low";
  positiveSignals?: string[];
  warningSignals?: string[];
}

export default function App() {
  const { setFrameReady, isFrameReady } = useMiniKit();
  const { address, chainId, isConnected } = useAccount();
  const { writeContract, data: writeHash, isPending, isSuccess } = useWriteContract();

  const [tab, setTab] = useState<"search" | "submit" | "leaderboard">("search");
  const [searchAddress, setSearchAddress] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitForm, setSubmitForm] = useState<{target: string; description: string; severity: number}>({
    target: "",
    description: "",
    severity: 2,
  });
  const [submitted, setSubmitted] = useState(false);
  // Timestamp form state
  const [targetAddress, setTargetAddress] = useState("");
  const [findingTitle, setFindingTitle] = useState("");
  const [privateNotes, setPrivateNotes] = useState("");
  const [generatedHash, setGeneratedHash] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [txHash, setTxHash] = useState("");

  const { data: totalFindings } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "totalFindings",
  });

  const { data: myFindings } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getResearcherFindings",
    args: address ? [address] : undefined,
  });

  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [setFrameReady, isFrameReady]);

  useEffect(() => {
    if (isSuccess) {
      setSubmitted(true);
      if (writeHash) setTxHash(writeHash);
    }
  }, [isSuccess, writeHash]);

  const searchContract = async (addr?: string) => {
    const target = addr || searchAddress;
    if (!target || target.length < 42) return;
    if (addr) setSearchAddress(addr);
    setSearching(true);
    setSearchResult(null);
    try {
      const [ethRes, gpRes] = await Promise.allSettled([
        fetch(`/api/check-contract?address=${target}`).then(r => r.json()),
        fetch(`/api/token-security?address=${target}`).then(r => r.json()),
      ]);

      const ethOk = ethRes.status === "fulfilled" && !ethRes.value.error;
      const ethData = ethOk ? ethRes.value : null;
      const gpData = gpRes.status === "fulfilled" && !gpRes.value.error ? gpRes.value as TokenSecurity : null;

      const reg = lookupRegistry(target);

      // If both APIs failed and no registry, show error
      if (!ethData && !gpData && !reg) {
        setSearchResult({ address: target, error: true });
      } else {
        const verified = ethData ? !!ethData.isVerified : false;
        const compiler = ethData?.compiler || "Unavailable";
        const contractName = reg?.displayName
          || ethData?.contractName
          || (gpData?.tokenName ? `${gpData.tokenName}${gpData.tokenSymbol ? ` (${gpData.tokenSymbol})` : ""}` : null)
          || "Unknown Contract";
        const signals = computeRiskSignals(verified, compiler, reg, gpData);
        if (!ethData) {
          signals.warningSignals.push("Source verification unavailable");
          signals.score = Math.max(0, signals.score - 5);
          // Recalculate label
          if (signals.score >= 80) signals.label = "Stronger public signals";
          else if (signals.score >= 60) signals.label = "Moderate public signals";
          else if (signals.score >= 40) signals.label = "Limited public signals";
          else if (signals.score >= 20) signals.label = "Weak public signals";
          else signals.label = "High-risk signals";
        }
        setSearchResult({
          address: ethData?.address || target,
          isVerified: verified,
          contractName,
          compiler,
          registry: reg,
          goplus: gpData,
          riskScore: signals.score,
          riskLabel: signals.label,
          confidence: signals.confidence,
          positiveSignals: signals.positiveSignals,
          warningSignals: signals.warningSignals,
        });
      }
    } catch {
      setSearchResult({ address: target, error: true });
    }
    setSearching(false);
  };

  const registryCount = Object.keys(auditRegistry).length;

  const EXAMPLE_CONTRACTS = [
    { label: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    { label: "Aerodrome Router", address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" },
    { label: "BugRegistry", address: "0xD060A6B3f065216c1D92B3F29ef67D65eCe06567" },
  ];

  const handleSubmit = () => {
    if (!submitForm.target || !submitForm.description) return;
    const hash = keccak256(
      toBytes(`${submitForm.target}:${submitForm.description}`)
    );
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "submitFinding",
      args: [hash, submitForm.severity, submitForm.target],
    });
  };

  const generateHash = () => {
    const trimmedTitle = findingTitle.trim();
    const trimmedNotes = privateNotes.trim();
    if (!targetAddress || !trimmedTitle || !trimmedNotes) {
      alert("Please fill in all fields before generating hash");
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(targetAddress)) {
      alert("Invalid contract address");
      return;
    }
    const hashInput = `${targetAddress.toLowerCase()}|${submitForm.severity}|${trimmedTitle}|${trimmedNotes}`;
    const hash = keccak256(toBytes(hashInput));
    setGeneratedHash(hash);
    setCopyStatus("");
  };

  const copyHash = async () => {
    if (!generatedHash) return;
    try {
      await navigator.clipboard.writeText(generatedHash);
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus(""), 2000);
    } catch {
      setCopyStatus("Failed");
    }
  };

  const submitGeneratedHash = () => {
    if (!isConnected || chainId !== base.id || !generatedHash || !/^0x[a-fA-F0-9]{40}$/.test(targetAddress)) return;
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: "submitFinding",
      chainId: base.id,
      args: [generatedHash as `0x${string}`, submitForm.severity, targetAddress],
    });
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#fff",
      fontFamily: "'Inter', sans-serif",
      maxWidth: "420px",
      margin: "0 auto",
      padding: "16px",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        <div style={{ fontSize: "28px", marginBottom: "4px" }}>🛡️</div>
        <h1 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 4px" }}>
          Base Audit Tracker
        </h1>
        <p style={{ fontSize: "12px", color: "#666", margin: 0 }}>
          Check Base contract risk signals and timestamp findings onchain
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        background: "#111",
        borderRadius: "12px",
        padding: "4px",
        marginBottom: "20px",
        gap: "4px",
      }}>
        {(["search", "submit", "leaderboard"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "600",
              background: tab === t ? "#2563eb" : "transparent",
              color: tab === t ? "#fff" : "#666",
              transition: "all 0.2s",
            }}
          >
            {t === "search" ? "🔍 Search" : t === "submit" ? "⏱️ Timestamp" : "🏆 Stats"}
          </button>
        ))}
      </div>

      {/* Search Tab */}
      {tab === "search" && (
        <div>
          {/* Intro Panel */}
          <div style={{
            background: "#111",
            borderRadius: "12px",
            padding: "14px 16px",
            marginBottom: "14px",
            border: "1px solid #1e3a5f",
          }}>
            <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>Base Contract Risk Signal Report</div>
            <div style={{ fontSize: "11px", color: "#666", lineHeight: "1.5" }}>
              Paste any Base contract to check source verification, GoPlus token signals, indexed security records, and risk level.
            </div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <input
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
              placeholder="Enter contract address (0x...)"
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #222",
                background: "#111",
                color: "#fff",
                fontSize: "13px",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            onClick={() => searchContract()}
            disabled={searching}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
              marginBottom: "16px",
            }}
          >
            {searching ? "Searching..." : "Check Contract"}
          </button>

          {/* Example buttons — show when no result */}
          {!searchResult && !searching && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", color: "#444", marginBottom: "8px" }}>TRY AN EXAMPLE</div>
              <div style={{ display: "flex", gap: "8px" }}>
                {EXAMPLE_CONTRACTS.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => searchContract(ex.address)}
                    style={{
                      flex: 1,
                      padding: "8px 4px",
                      borderRadius: "8px",
                      border: "1px solid #222",
                      background: "#111",
                      color: "#888",
                      fontSize: "11px",
                      cursor: "pointer",
                      fontWeight: "500",
                    }}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Indexed Security Reports — show above when no result */}
          {!searchResult && !searching && (
            <div style={{ marginBottom: "16px" }}>
              <p style={{ fontSize: "12px", color: "#444", marginBottom: "8px" }}>
                INDEXED SECURITY REPORTS ({registryCount})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {Object.entries(auditRegistry).map(([addr, entry]) => {
                  const rc = entry.risk === "Low" ? "#22c55e" : entry.risk === "High" ? "#ef4444" : "#f59e0b";
                  return (
                    <div
                      key={addr}
                      onClick={() => searchContract(addr)}
                      style={{
                        background: "#111",
                        borderRadius: "12px",
                        padding: "12px 16px",
                        border: "1px solid #1e3a5f",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: "600" }}>{entry.displayName}</div>
                        <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>{entry.category}</div>
                      </div>
                      <span style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "20px",
                        background: `${rc}22`,
                        color: rc,
                      }}>
                        {entry.risk}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: "11px", color: "#333", marginTop: "10px", textAlign: "center" }}>
                Lightweight security registry for Base contracts.
              </p>
            </div>
          )}

          {searchResult && !searchResult.error && (() => {
            const hasRegistry = !!searchResult.registry;
            const riskColor = searchResult.registry?.risk === "Low" ? "#22c55e"
              : searchResult.registry?.risk === "High" ? "#ef4444"
              : hasRegistry ? "#f59e0b" : "#666";
            const riskLabel = searchResult.registry?.risk || "Unknown";
            const score = searchResult.riskScore ?? 0;
            const scoreColor = score >= 65 ? "#22c55e" : score >= 35 ? "#f59e0b" : "#ef4444";
            const categoryLabel = searchResult.registry?.category || "Unknown";
            const auditLabel = searchResult.registry?.auditStatus || "No indexed audit";
            const confColor = searchResult.confidence === "High" ? "#22c55e"
              : searchResult.confidence === "Medium" ? "#f59e0b" : "#666";
            const notesLabel = searchResult.registry?.notes
              || (searchResult.isVerified
                ? "This contract is verified on Base, but this app has not indexed a public audit or security profile for it yet."
                : undefined);
            const hasTax = searchResult.goplus?.buyTax || searchResult.goplus?.sellTax;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Risk Signal Score */}
                <div style={{
                  background: "#111",
                  borderRadius: "12px",
                  padding: "16px",
                  border: `1px solid ${scoreColor}33`,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px", letterSpacing: "0.5px" }}>RISK SIGNAL SCORE</div>
                  <div style={{ fontSize: "32px", fontWeight: "700", color: scoreColor }}>
                    {score}<span style={{ fontSize: "16px", color: "#555" }}>/100</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>
                    {searchResult.riskLabel}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "8px" }}>
                    <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "20px", background: `${confColor}22`, color: confColor }}>
                      Confidence: {searchResult.confidence}
                    </span>
                  </div>
                  <div style={{ fontSize: "10px", color: "#444", marginTop: "8px", fontStyle: "italic" }}>
                    Based on indexed public signals. Not a full audit.
                  </div>
                </div>

                {/* Profile Card */}
                <div style={{
                  background: "#111",
                  borderRadius: "12px",
                  padding: "16px",
                  border: `1px solid ${searchResult.isVerified ? "#22c55e33" : "#ef444433"}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "600" }}>
                      {searchResult.contractName}
                    </span>
                    <span style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "20px",
                      background: searchResult.isVerified ? "#22c55e22" : "#ef444422",
                      color: searchResult.isVerified ? "#22c55e" : "#ef4444",
                    }}>
                      {searchResult.isVerified ? "\u2713 Verified" : "\u2717 Unverified"}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", wordBreak: "break-all", marginBottom: "10px" }}>
                    {searchResult.address}
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: "#2563eb22", color: "#2563eb" }}>
                      {categoryLabel}
                    </span>
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: `${riskColor}22`, color: riskColor }}>
                      Risk: {riskLabel}
                    </span>
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: searchResult.goplus?.available ? "#22c55e22" : "#66666622", color: searchResult.goplus?.available ? "#22c55e" : "#666" }}>
                      GoPlus: {searchResult.goplus?.available ? "Available" : "Unavailable"}
                    </span>
                  </div>

                  <div style={{ fontSize: "11px", color: "#555", marginBottom: "4px" }}>
                    <span style={{ color: "#666" }}>Audit:</span> {auditLabel}
                  </div>
                  {searchResult.compiler !== "Unknown" && (
                    <div style={{ fontSize: "11px", color: "#555", marginBottom: "4px" }}>
                      <span style={{ color: "#666" }}>Compiler:</span> {searchResult.compiler}
                    </div>
                  )}
                  {hasTax && (
                    <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                      {searchResult.goplus?.buyTax && (
                        <div style={{ fontSize: "11px", color: "#555" }}>
                          <span style={{ color: "#666" }}>Buy tax:</span> {(parseFloat(searchResult.goplus.buyTax) * 100).toFixed(1)}%
                        </div>
                      )}
                      {searchResult.goplus?.sellTax && (
                        <div style={{ fontSize: "11px", color: "#555" }}>
                          <span style={{ color: "#666" }}>Sell tax:</span> {(parseFloat(searchResult.goplus.sellTax) * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  )}
                  {notesLabel && (
                    <div style={{ fontSize: "11px", color: "#555", marginTop: "6px", fontStyle: "italic" }}>
                      {notesLabel}
                    </div>
                  )}
                </div>

                {/* Positive Signals */}
                {searchResult.positiveSignals && searchResult.positiveSignals.length > 0 && (
                  <div style={{
                    background: "#111",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    border: "1px solid #22c55e33",
                  }}>
                    <div style={{ fontSize: "11px", color: "#22c55e", marginBottom: "6px", fontWeight: "600" }}>POSITIVE SIGNALS</div>
                    {searchResult.positiveSignals.map((s: string, i: number) => (
                      <div key={i} style={{ fontSize: "12px", color: "#888", marginBottom: "3px", display: "flex", gap: "6px", alignItems: "center" }}>
                        <span style={{ fontSize: "9px", fontWeight: "700", color: "#22c55e", background: "#22c55e22", padding: "1px 5px", borderRadius: "4px" }}>OK</span> {s}
                      </div>
                    ))}
                  </div>
                )}

                {/* Warning Signals */}
                {searchResult.warningSignals && searchResult.warningSignals.length > 0 ? (
                  <div style={{
                    background: "#111",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    border: "1px solid #ef444433",
                  }}>
                    <div style={{ fontSize: "11px", color: "#ef4444", marginBottom: "6px", fontWeight: "600" }}>WARNING SIGNALS</div>
                    {searchResult.warningSignals.map((s: string, i: number) => (
                      <div key={i} style={{ fontSize: "12px", color: "#999", marginBottom: "3px", display: "flex", gap: "6px", alignItems: "center" }}>
                        <span style={{ fontSize: "9px", fontWeight: "700", color: "#ef4444", background: "#ef444422", padding: "1px 5px", borderRadius: "4px" }}>WARN</span> {s}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    background: "#111",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    border: "1px solid #22c55e33",
                  }}>
                    <div style={{ fontSize: "12px", color: "#22c55e" }}>No major warnings found in indexed public signals.</div>
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: "8px" }}>
                  {searchResult.registry?.reportUrl && (
                    <a
                      href={searchResult.registry.reportUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        flex: 1,
                        padding: "8px",
                        borderRadius: "8px",
                        border: "1px solid #333",
                        background: "transparent",
                        color: "#aaa",
                        fontSize: "12px",
                        textAlign: "center",
                        textDecoration: "none",
                        cursor: "pointer",
                      }}
                    >
                      View Report / Source
                    </a>
                  )}
                  <button
                    onClick={() => {
                      setTab("submit");
                      setSubmitForm({ ...submitForm, target: searchResult.address });
                      setTargetAddress(searchResult.address);
                      setGeneratedHash("");
                      setSubmitted(false);
                    }}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: "8px",
                      border: "1px solid #2563eb",
                      background: "transparent",
                      color: "#2563eb",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Report a Finding
                  </button>
                </div>

                {/* Indexed Security Reports — below result */}
                <div style={{ marginTop: "10px" }}>
                  <p style={{ fontSize: "12px", color: "#444", marginBottom: "8px" }}>
                    INDEXED SECURITY REPORTS ({registryCount})
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {Object.entries(auditRegistry).map(([addr, entry]) => {
                      const rc = entry.risk === "Low" ? "#22c55e" : entry.risk === "High" ? "#ef4444" : "#f59e0b";
                      return (
                        <div
                          key={addr}
                          onClick={() => searchContract(addr)}
                          style={{
                            background: "#111",
                            borderRadius: "12px",
                            padding: "12px 16px",
                            border: "1px solid #1e3a5f",
                            cursor: "pointer",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: "600" }}>{entry.displayName}</div>
                            <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>{entry.category}</div>
                          </div>
                          <span style={{
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: "20px",
                            background: `${rc}22`,
                            color: rc,
                          }}>
                            {entry.risk}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {searchResult?.error && (
            <div style={{
              background: "#111",
              borderRadius: "12px",
              padding: "16px",
              border: "1px solid #333",
              color: "#666",
              fontSize: "13px",
              textAlign: "center",
            }}>
              Could not fetch contract data. Check the address and try again.
            </div>
          )}
        </div>
      )}

      {/* Submit Tab */}
      {tab === "submit" && (
        <div>
          <div style={{
            background: "#111",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
            border: "1px solid #1e3a5f",
          }}>
            <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "6px" }}>Timestamp a Finding</div>
            <div style={{ fontSize: "11px", color: "#666", lineHeight: "1.5", marginBottom: "8px" }}>
              Create onchain proof that you had a security finding at this time. The app hashes your details locally and submits only the hash.
            </div>
            <div style={{ fontSize: "10px", color: "#444", fontStyle: "italic" }}>
              This does not submit to a bug bounty. Do not publish sensitive details until responsible disclosure is complete.
            </div>
          </div>

          {submitted ? (
            <div style={{
              textAlign: "center",
              padding: "40px 20px",
            }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>OK</div>
              <h3 style={{ color: "#22c55e", marginBottom: "8px" }}>Timestamp Proof Created</h3>
              <p style={{ color: "#555", fontSize: "13px" }}>
                Your finding hash is now permanently timestamped onchain.
              </p>
              {txHash && (
                <div style={{ marginTop: "12px" }}>
                  <a
                    href={`https://basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: "12px",
                      color: "#2563eb",
                      textDecoration: "none",
                    }}
                  >
                    View on Basescan
                  </a>
                </div>
              )}
              <button
                onClick={() => {
                  setSubmitted(false);
                  setTargetAddress("");
                  setFindingTitle("");
                  setPrivateNotes("");
                  setGeneratedHash("");
                  setCopyStatus("");
                  setTxHash("");
                  setSubmitForm({ target: "", description: "", severity: 2 });
                }}
                style={{
                  marginTop: "16px",
                  padding: "10px 24px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Timestamp Another
              </button>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "6px" }}>
                  TARGET CONTRACT ADDRESS
                </label>
                <input
                  value={targetAddress}
                  onChange={(e) => {
                    setTargetAddress(e.target.value);
                    setGeneratedHash("");
                  }}
                  placeholder="0x..."
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid #222",
                    background: "#111",
                    color: "#fff",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "6px" }}>
                  SEVERITY
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {SEVERITY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSubmitForm({ ...submitForm, severity: i });
                        setGeneratedHash("");
                      }}
                      style={{
                        flex: 1,
                        padding: "8px 4px",
                        borderRadius: "8px",
                        border: `1px solid ${submitForm.severity === i ? SEVERITY_COLORS[i] : "#222"}`,
                        background: submitForm.severity === i ? `${SEVERITY_COLORS[i]}22` : "#111",
                        color: submitForm.severity === i ? SEVERITY_COLORS[i] : "#555",
                        fontSize: "11px",
                        cursor: "pointer",
                        fontWeight: submitForm.severity === i ? "600" : "400",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "6px" }}>
                  FINDING TITLE
                </label>
                <input
                  value={findingTitle}
                  onChange={(e) => {
                    setFindingTitle(e.target.value);
                    setGeneratedHash("");
                  }}
                  placeholder="Brief title of the finding"
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid #222",
                    background: "#111",
                    color: "#fff",
                    fontSize: "13px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "6px" }}>
                  PRIVATE NOTES
                </label>
                <textarea
                  value={privateNotes}
                  onChange={(e) => {
                    setPrivateNotes(e.target.value);
                    setGeneratedHash("");
                  }}
                  placeholder="Describe the issue privately. These notes are only used locally to generate a hash."
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid #222",
                    background: "#111",
                    color: "#fff",
                    fontSize: "13px",
                    resize: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                onClick={generateHash}
                disabled={!targetAddress || !findingTitle.trim() || !privateNotes.trim()}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "none",
                  background: !targetAddress || !findingTitle.trim() || !privateNotes.trim() ? "#333" : "#2563eb",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: (!targetAddress || !findingTitle.trim() || !privateNotes.trim()) ? "not-allowed" : "pointer",
                  marginBottom: "12px",
                }}
              >
                Generate Hash
              </button>

              {generatedHash && (
                <div style={{
                  background: "#111",
                  borderRadius: "10px",
                  padding: "12px",
                  marginBottom: "12px",
                  border: "1px solid #1e3a5f",
                }}>
                  <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px" }}>FINDING HASH</div>
                  <div style={{
                    fontSize: "10px",
                    color: "#888",
                    wordBreak: "break-all",
                    marginBottom: "8px",
                    fontFamily: "monospace",
                  }}>
                    {generatedHash}
                  </div>
                  <button
                    onClick={copyHash}
                    style={{
                      width: "100%",
                      padding: "6px",
                      borderRadius: "6px",
                      border: "1px solid #333",
                      background: "transparent",
                      color: "#888",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    {copyStatus || "Copy Hash"}
                  </button>
                  <div style={{ fontSize: "10px", color: "#444", marginTop: "8px", fontStyle: "italic" }}>
                    Only this hash is submitted onchain. Your title and notes are not stored by this app.
                  </div>
                </div>
              )}

              {!isConnected && (
                <>
                  <div style={{
                    background: "#111",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    marginBottom: "10px",
                    border: "1px solid #333",
                    color: "#777",
                    fontSize: "11px",
                    lineHeight: "1.4",
                  }}>
                    Connect your wallet when you are ready to submit the generated hash onchain.
                  </div>
                  <ConnectWallet
                    disconnectedLabel="Connect Wallet"
                    render={({ label, onClick, isLoading }) => (
                      <button
                        onClick={onClick}
                        style={{
                          width: "100%",
                          padding: "12px",
                          borderRadius: "10px",
                          border: "1px solid #2563eb",
                          background: "transparent",
                          color: "#2563eb",
                          fontSize: "14px",
                          fontWeight: "600",
                          cursor: "pointer",
                          marginBottom: "12px",
                        }}
                      >
                        {isLoading ? "Connecting..." : label}
                      </button>
                    )}
                  />
                </>
              )}

              {isConnected && chainId !== base.id && (
                <div style={{
                  background: "#111",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  marginBottom: "12px",
                  border: "1px solid #f59e0b55",
                  color: "#f59e0b",
                  fontSize: "11px",
                  lineHeight: "1.4",
                }}>
                  Switch your wallet network to Base before submitting onchain.
                </div>
              )}

              <button
                onClick={submitGeneratedHash}
                disabled={!isConnected || chainId !== base.id || !generatedHash || isPending}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "none",
                  background: (!isConnected || chainId !== base.id || !generatedHash || isPending) ? "#333" : "#2563eb",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: (!isConnected || chainId !== base.id || !generatedHash || isPending) ? "not-allowed" : "pointer",
                }}
              >
                {!isConnected
                  ? "Connect Wallet to Submit Onchain"
                  : chainId !== base.id
                    ? "Switch to Base to Submit"
                  : !generatedHash
                    ? "Generate Hash First"
                    : isPending
                      ? "Submitting..."
                      : "Submit Hash Onchain"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stats Tab */}
      {tab === "leaderboard" && (
        <div>
          <div style={{
            background: "#111",
            borderRadius: "12px",
            padding: "20px",
            textAlign: "center",
            marginBottom: "12px",
            border: "1px solid #1e3a5f",
          }}>
            <div style={{ fontSize: "36px", fontWeight: "700", color: "#2563eb" }}>
              {totalFindings?.toString() ?? "0"}
            </div>
            <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
              Total Findings Onchain
            </div>
          </div>

          {isConnected && (
            <div style={{
              background: "#111",
              borderRadius: "12px",
              padding: "20px",
              textAlign: "center",
              marginBottom: "12px",
              border: "1px solid #222",
            }}>
              <div style={{ fontSize: "28px", fontWeight: "700", color: "#22c55e" }}>
                {myFindings?.length ?? "0"}
              </div>
              <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
                Your Findings
              </div>
              <div style={{ fontSize: "11px", color: "#333", marginTop: "8px", wordBreak: "break-all" }}>
                {address}
              </div>
            </div>
          )}

          <div style={{
            background: "#111",
            borderRadius: "12px",
            padding: "16px",
            border: "1px solid #222",
          }}>
            <div style={{ fontSize: "12px", color: "#444", marginBottom: "12px" }}>
              CONTRACT
            </div>
            <div style={{ fontSize: "11px", color: "#555", wordBreak: "break-all", marginBottom: "8px" }}>
              {CONTRACT_ADDRESS}
            </div>
            <a
              href={`https://basescan.org/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: "12px",
                color: "#2563eb",
                textDecoration: "none",
              }}
            >
              View on Basescan →
            </a>
          </div>

          <div style={{
            marginTop: "12px",
            background: "#111",
            borderRadius: "12px",
            padding: "16px",
            border: "1px solid #222",
          }}>
            <div style={{ fontSize: "12px", color: "#444", marginBottom: "8px" }}>
              BUILT BY
            </div>
            <div style={{ fontSize: "13px", fontWeight: "600" }}>OrDex78</div>
            <a
              href="https://github.com/OrDex78/base-azul-audit"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "12px", color: "#2563eb", textDecoration: "none" }}
            >
              Base Azul Audit Report →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

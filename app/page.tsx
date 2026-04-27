"use client";

import { useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { keccak256, toBytes } from "viem";
import { lookupRegistry, computeSafetyScore, getRedFlags, auditRegistry } from "@/lib/auditRegistry";
import type { RegistryEntry } from "@/lib/auditRegistry";

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
  safetyScore?: number;
  redFlags?: string[];
}

export default function App() {
  const { setFrameReady, isFrameReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const { writeContract, isPending, isSuccess } = useWriteContract();

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
    if (isSuccess) setSubmitted(true);
  }, [isSuccess]);

  const searchContract = async () => {
    if (!searchAddress || searchAddress.length < 42) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const res = await fetch(
        `/api/check-contract?address=${searchAddress}`
      );
      const data = await res.json();
      if (data.error) {
        setSearchResult({ address: searchAddress, error: true });
      } else {
        const reg = lookupRegistry(data.address);
        const verified = !!data.isVerified;
        setSearchResult({
          address: data.address,
          isVerified: verified,
          contractName: reg?.displayName || data.contractName || "Unknown",
          compiler: data.compiler || "Unknown",
          registry: reg,
          safetyScore: computeSafetyScore(verified, reg),
          redFlags: getRedFlags(verified, reg),
        });
      }
    } catch {
      setSearchResult({ address: searchAddress, error: true });
    }
    setSearching(false);
  };

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
          Check Base contract risk and timestamp findings onchain
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
            {t === "search" ? "🔍 Search" : t === "submit" ? "📝 Submit" : "🏆 Stats"}
          </button>
        ))}
      </div>

      {/* Search Tab */}
      {tab === "search" && (
        <div>
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
            onClick={searchContract}
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

          {searchResult && !searchResult.error && (() => {
            const riskColor = searchResult.registry?.risk === "Low" ? "#22c55e"
              : searchResult.registry?.risk === "High" ? "#ef4444" : "#f59e0b";
            const riskLabel = searchResult.registry?.risk || "Unknown";
            const scoreColor = (searchResult.safetyScore ?? 0) >= 65 ? "#22c55e"
              : (searchResult.safetyScore ?? 0) >= 35 ? "#f59e0b" : "#ef4444";
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {/* Safety Score */}
                <div style={{
                  background: "#111",
                  borderRadius: "12px",
                  padding: "16px",
                  border: `1px solid ${scoreColor}33`,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px", letterSpacing: "0.5px" }}>SAFETY SCORE</div>
                  <div style={{ fontSize: "32px", fontWeight: "700", color: scoreColor }}>
                    {searchResult.safetyScore ?? 0}<span style={{ fontSize: "16px", color: "#555" }}>/100</span>
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
                      {searchResult.isVerified ? "✓ Verified" : "✗ Unverified"}
                    </span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#666", wordBreak: "break-all", marginBottom: "10px" }}>
                    {searchResult.address}
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                    {searchResult.registry && (
                      <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: "#2563eb22", color: "#2563eb" }}>
                        {searchResult.registry.category}
                      </span>
                    )}
                    <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: `${riskColor}22`, color: riskColor }}>
                      Risk: {riskLabel}
                    </span>
                  </div>

                  {searchResult.registry && (
                    <div style={{ fontSize: "11px", color: "#555", marginBottom: "4px" }}>
                      <span style={{ color: "#666" }}>Audit:</span> {searchResult.registry.auditStatus}
                    </div>
                  )}
                  {searchResult.compiler !== "Unknown" && (
                    <div style={{ fontSize: "11px", color: "#555", marginBottom: "4px" }}>
                      <span style={{ color: "#666" }}>Compiler:</span> {searchResult.compiler}
                    </div>
                  )}
                  {searchResult.registry?.notes && (
                    <div style={{ fontSize: "11px", color: "#555", marginTop: "6px", fontStyle: "italic" }}>
                      {searchResult.registry.notes}
                    </div>
                  )}
                </div>

                {/* Red Flags */}
                {searchResult.redFlags && searchResult.redFlags.length > 0 ? (
                  <div style={{
                    background: "#111",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    border: "1px solid #ef444433",
                  }}>
                    <div style={{ fontSize: "11px", color: "#ef4444", marginBottom: "6px", fontWeight: "600" }}>RED FLAGS</div>
                    {searchResult.redFlags.map((f, i) => (
                      <div key={i} style={{ fontSize: "12px", color: "#999", marginBottom: "4px" }}>
                        ⚠ {f}
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
                    <div style={{ fontSize: "12px", color: "#22c55e" }}>No major red flags indexed.</div>
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

          {/* Indexed Security Reports */}
          <div style={{ marginTop: "20px" }}>
            <p style={{ fontSize: "12px", color: "#444", marginBottom: "8px" }}>
              INDEXED SECURITY REPORTS
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {Object.entries(auditRegistry).map(([addr, entry]) => {
                const riskColor = entry.risk === "Low" ? "#22c55e" : entry.risk === "High" ? "#ef4444" : "#f59e0b";
                return (
                  <div
                    key={addr}
                    onClick={() => setSearchAddress(addr)}
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
                      <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
                        {entry.category}
                      </div>
                    </div>
                    <span style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "20px",
                      background: `${riskColor}22`,
                      color: riskColor,
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
        </div>
      )}

      {/* Submit Tab */}
      {tab === "submit" && (
        <div>
          {!isConnected ? (
            <div style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "#555",
            }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔒</div>
              <p>Connect your wallet to submit findings</p>
            </div>
          ) : submitted ? (
            <div style={{
              textAlign: "center",
              padding: "40px 20px",
            }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>✅</div>
              <h3 style={{ color: "#22c55e", marginBottom: "8px" }}>Finding Submitted!</h3>
              <p style={{ color: "#555", fontSize: "13px" }}>
                Your finding is now permanently timestamped onchain.
              </p>
              <button
                onClick={() => { setSubmitted(false); setSubmitForm({ target: "", description: "", severity: 2 }); }}
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
                Submit Another
              </button>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "6px" }}>
                  CONTRACT / PROTOCOL
                </label>
                <input
                  value={submitForm.target}
                  onChange={(e) => setSubmitForm({ ...submitForm, target: e.target.value })}
                  placeholder="0x... or protocol name"
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
                      onClick={() => setSubmitForm({ ...submitForm, severity: i })}
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

              <div style={{ marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", color: "#555", display: "block", marginBottom: "6px" }}>
                  DESCRIPTION (kept private — only hash stored onchain)
                </label>
                <textarea
                  value={submitForm.description}
                  onChange={(e) => setSubmitForm({ ...submitForm, description: e.target.value })}
                  placeholder="Describe the vulnerability..."
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

              <div style={{
                background: "#111",
                borderRadius: "10px",
                padding: "12px",
                marginBottom: "16px",
                border: "1px solid #1e3a5f",
                fontSize: "12px",
                color: "#555",
              }}>
                🔐 Only a keccak256 hash of your finding is stored onchain. The description stays private until you choose to disclose it.
              </div>

              <button
                onClick={handleSubmit}
                disabled={isPending || !submitForm.target || !submitForm.description}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "none",
                  background: isPending ? "#1e3a5f" : "#2563eb",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: isPending ? "not-allowed" : "pointer",
                }}
              >
                {isPending ? "Submitting..." : "Submit Finding Onchain"}
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
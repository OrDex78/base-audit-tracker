export interface RegistryEntry {
  displayName: string;
  category: string;
  risk: "Low" | "Medium" | "High";
  auditStatus: string;
  reportUrl: string;
  notes: string;
}

export const auditRegistry: Record<string, RegistryEntry> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": {
    displayName: "USDC on Base",
    category: "Stablecoin",
    risk: "Low",
    auditStatus: "Known major token",
    reportUrl: "https://www.circle.com/en/transparency",
    notes: "Official Circle USDC contract on Base.",
  },
  "0x940181a94a35a4569e4529a3cdfb74e38fd98631": {
    displayName: "AERO Token",
    category: "Token",
    risk: "Medium",
    auditStatus: "Public ecosystem contract",
    reportUrl:
      "https://basescan.org/address/0x940181a94A35A4569E4529A3CDfB74e38FD98631",
    notes: "Aerodrome token contract on Base.",
  },
  "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43": {
    displayName: "Aerodrome Router",
    category: "DEX Router",
    risk: "Medium",
    auditStatus: "Public ecosystem contract",
    reportUrl:
      "https://basescan.org/address/0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    notes:
      "High-value DeFi router. Users should verify transaction calldata before signing.",
  },
  "0xd060a6b3f065216c1d92b3f29ef67d65ece06567": {
    displayName: "BugRegistry",
    category: "Security Registry",
    risk: "Medium",
    auditStatus: "Self-published",
    reportUrl: "https://github.com/OrDex78/base-azul-audit",
    notes: "Onchain timestamp registry for security findings.",
  },
};

export function lookupRegistry(address: string): RegistryEntry | null {
  return auditRegistry[address.toLowerCase()] ?? null;
}

export function computeSafetyScore(
  isVerified: boolean,
  registry: RegistryEntry | null
): number {
  let score = 0;
  if (isVerified) score += 35;
  if (registry) {
    score += 30;
    if (registry.risk === "Low") score += 25;
    else if (registry.risk === "Medium") score += 10;
    else if (registry.risk === "High") score -= 10;
  }
  return Math.max(0, Math.min(100, score));
}

export function getRedFlags(
  isVerified: boolean,
  registry: RegistryEntry | null
): string[] {
  const flags: string[] = [];
  if (!isVerified) {
    flags.push("Source code is not verified.");
  }
  if (isVerified && !registry) {
    flags.push("No indexed audit or security record found.");
  }
  if (registry?.risk === "Medium") {
    flags.push(
      "Use caution: this contract may control important funds or permissions."
    );
  }
  if (registry?.risk === "High") {
    flags.push("High-risk contract. Review carefully before interaction.");
  }
  return flags;
}

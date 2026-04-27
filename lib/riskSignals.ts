import type { RegistryEntry } from "./auditRegistry";

export interface TokenSecurity {
  address: string;
  available: boolean;
  isOpenSource?: boolean | null;
  isProxy?: boolean | null;
  isMintable?: boolean | null;
  canTakeBackOwnership?: boolean | null;
  ownerChangeBalance?: boolean | null;
  hiddenOwner?: boolean | null;
  selfdestruct?: boolean | null;
  externalCall?: boolean | null;
  isHoneypot?: boolean | null;
  cannotSellAll?: boolean | null;
  buyTax?: string | null;
  sellTax?: string | null;
  isBlacklisted?: boolean | null;
  isWhitelisted?: boolean | null;
  holderCount?: string | null;
  lpHolderCount?: string | null;
  tokenName?: string | null;
  tokenSymbol?: string | null;
}

export interface RiskSignalResult {
  score: number;
  label: string;
  confidence: "High" | "Medium" | "Low";
  positiveSignals: string[];
  warningSignals: string[];
}

function isOldCompiler(compiler: string): boolean {
  return /v0\.[456]\./.test(compiler);
}

export function computeRiskSignals(
  isVerified: boolean,
  compiler: string,
  registry: RegistryEntry | null,
  goplus: TokenSecurity | null
): RiskSignalResult {
  let score = 50;
  const positiveSignals: string[] = [];
  const warningSignals: string[] = [];

  // Positive signals
  if (isVerified) {
    score += 15;
    positiveSignals.push("Source verified on Basescan");
  }
  if (registry) {
    score += 20;
    positiveSignals.push("Indexed security profile found");
  }
  if (goplus?.available && goplus.isOpenSource === true) {
    score += 10;
    positiveSignals.push("Open source according to GoPlus");
  }
  if (registry?.risk === "Low") {
    score += 10;
  }
  if (registry?.risk === "Medium") {
    score += 5;
  }
  if (goplus?.available) {
    positiveSignals.push("GoPlus token scan available");
  }

  // Negative signals
  if (!isVerified) {
    score -= 25;
    warningSignals.push("Source code is not verified");
  }
  if (goplus?.isHoneypot === true) {
    score -= 25;
    warningSignals.push("Honeypot risk detected");
  }
  if (goplus?.cannotSellAll === true) {
    score -= 20;
    warningSignals.push("Cannot sell all tokens");
  }
  if (goplus?.isBlacklisted === true) {
    score -= 15;
    warningSignals.push("Blacklist function detected");
  }
  if (goplus?.isWhitelisted === true) {
    score -= 15;
    warningSignals.push("Whitelist restriction detected");
  }
  if (goplus?.hiddenOwner === true) {
    score -= 15;
    warningSignals.push("Hidden owner detected");
  }
  if (goplus?.isMintable === true) {
    score -= 12;
    warningSignals.push("Mint function detected");
  }
  if (goplus?.canTakeBackOwnership === true) {
    score -= 10;
    warningSignals.push("Owner can regain ownership");
  }
  if (goplus?.ownerChangeBalance === true) {
    score -= 10;
    warningSignals.push("Owner can change balances");
  }
  if (goplus?.selfdestruct === true) {
    score -= 10;
    warningSignals.push("Selfdestruct detected");
  }
  if (goplus?.externalCall === true) {
    score -= 8;
    warningSignals.push("External call detected");
  }
  if (goplus?.isProxy === true && !registry) {
    score -= 8;
    warningSignals.push("Proxy contract without indexed profile");
  }
  if (isOldCompiler(compiler) && !registry) {
    score -= 8;
    warningSignals.push("Older Solidity compiler version");
  }
  if (!goplus?.available && !registry) {
    score -= 5;
    warningSignals.push("GoPlus token scan unavailable");
  }
  if (!registry) {
    warningSignals.push("No indexed audit or security profile");
  }

  score = Math.max(0, Math.min(100, score));

  let label: string;
  if (score >= 80) label = "Stronger public signals";
  else if (score >= 60) label = "Moderate public signals";
  else if (score >= 40) label = "Limited public signals";
  else if (score >= 20) label = "Weak public signals";
  else label = "High-risk signals";

  let confidence: "High" | "Medium" | "Low";
  if (registry && isVerified) {
    confidence = "High";
  } else if (isVerified && goplus?.available) {
    confidence = "Medium";
  } else {
    confidence = "Low";
  }

  return { score, label, confidence, positiveSignals, warningSignals };
}

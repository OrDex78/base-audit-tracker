import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: true, message: "Invalid address" },
      { status: 400 }
    );
  }

  const apiKey = process.env.BASESCAN_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: true, message: "Missing BASESCAN_API_KEY" },
      { status: 500 }
    );
  }
  const url = `https://api.etherscan.io/v2/api?chainid=8453&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "1" || !Array.isArray(data.result) || data.result.length === 0) {
      return NextResponse.json({
        address,
        isVerified: false,
        contractName: "Unknown",
        compiler: "Unknown",
        _debug: data.message || data.result || undefined,
      });
    }

    const entry = data.result[0];
    const isVerified = typeof entry.SourceCode === "string" && entry.SourceCode !== "";

    return NextResponse.json({
      address,
      isVerified,
      contractName: isVerified ? entry.ContractName || "Unknown" : "Unknown",
      compiler: entry.CompilerVersion || "Unknown",
    });
  } catch {
    return NextResponse.json(
      { error: true, message: "Failed to reach Basescan" },
      { status: 502 }
    );
  }
}

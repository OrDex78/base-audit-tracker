import { NextRequest, NextResponse } from "next/server";

function toBool(val: unknown): boolean | null {
  if (val === "1") return true;
  if (val === "0") return false;
  return null;
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: true, message: "Invalid address" },
      { status: 400 }
    );
  }

  const url = `https://api.gopluslabs.io/api/v1/token_security/8453?contract_addresses=${address}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const key = Object.keys(data.result || {})[0];
    if (!key || !data.result[key]) {
      return NextResponse.json({ address, available: false });
    }

    const r = data.result[key];

    return NextResponse.json({
      address,
      available: true,
      isOpenSource: toBool(r.is_open_source),
      isProxy: toBool(r.is_proxy),
      isMintable: toBool(r.is_mintable),
      canTakeBackOwnership: toBool(r.can_take_back_ownership),
      ownerChangeBalance: toBool(r.owner_change_balance),
      hiddenOwner: toBool(r.hidden_owner),
      selfdestruct: toBool(r.selfdestruct),
      externalCall: toBool(r.external_call),
      isHoneypot: toBool(r.is_honeypot),
      cannotSellAll: toBool(r.cannot_sell_all),
      buyTax: r.buy_tax ?? null,
      sellTax: r.sell_tax ?? null,
      isBlacklisted: toBool(r.is_blacklisted),
      isWhitelisted: toBool(r.is_whitelisted),
      holderCount: r.holder_count ?? null,
      lpHolderCount: r.lp_holder_count ?? null,
      tokenName: r.token_name ?? null,
      tokenSymbol: r.token_symbol ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: true, message: "Failed to reach GoPlus" },
      { status: 502 }
    );
  }
}

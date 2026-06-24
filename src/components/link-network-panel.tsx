"use client";

import { useState } from "react";
import { CHAINS } from "@/lib/chains";
import { useApp } from "./providers";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

// Self-contained "Link another network" flow. Connects a wallet, signs the user in with the
// connected address (proof of an address they already control on this listing), then takes a
// second signature for the NEW address and links it. Used on /submit and on the provider page.
//
// providerName  - the listing name the API matches the link against
// excludeChainId - the chain of the address the user is viewing (so it is not offered again)
export function LinkNetworkPanel({
  providerName,
  excludeChainId,
}: {
  providerName: string;
  excludeChainId?: number;
}) {
  const { t } = useApp();
  const options = CHAINS.filter((c) => c.chainId !== excludeChainId);
  const [linkChainId, setLinkChainId] = useState<number>(options[0]?.chainId ?? 19);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function signIn(addr: string) {
    // Establish a session as `addr` (must be an address that owns this listing).
    const nonceRes = await fetch("/api/auth/nonce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: addr, chainId: 14 }),
    });
    if (!nonceRes.ok) throw new Error(t("submit.err.noChallenge"));
    const { message } = await nonceRes.json();
    const signature = (await window.ethereum!.request({
      method: "personal_sign",
      params: [message, addr],
    })) as string;
    const verifyRes = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    if (!verifyRes.ok) {
      const body = await verifyRes.json().catch(() => ({}));
      throw new Error(body.error ?? t("submit.err.verifyFailed"));
    }
  }

  async function linkNetwork() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      if (!window.ethereum) throw new Error(t("submit.err.noWalletShort"));
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const linkAddr = accounts?.[0];
      if (!linkAddr) throw new Error(t("submit.err.noAccount"));

      // First prove an address that already owns this listing (opens a session), then prove the
      // new address. The connected wallet is used for both; the user is prompted to switch
      // accounts for the second signature if the new address differs.
      await signIn(linkAddr);

      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: linkAddr, chainId: linkChainId }),
      });
      if (!nonceRes.ok) throw new Error(t("submit.err.noChallenge"));
      const { message } = await nonceRes.json();
      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [message, linkAddr],
      })) as string;

      const res = await fetch("/api/provider/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature, name: providerName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          typeof body.error === "string" ? body.error : t("submit.err.linkFailed")
        );
      }
      const chainName =
        CHAINS.find((c) => c.chainId === linkChainId)?.name ?? t("submit.fallback.network");
      setMsg(t("submit.link.ok", { network: chainName }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("submit.err.linkFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-themed bg-elev/50 p-4 text-sm">
      <p className="font-medium">{t("submit.link.title")}</p>
      <p className="mt-1 text-muted">{t("submit.link.body")}</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">
          {t("submit.network")}
          <select
            value={linkChainId}
            onChange={(e) => setLinkChainId(Number(e.target.value))}
            className="mt-1 block rounded border border-themed bg-elev px-3 py-2 text-sm"
          >
            {options.map((c) => (
              <option key={c.chainId} value={c.chainId}>
                {c.name} ({t("submit.chainIdLabel")} {c.chainId})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={linkNetwork}
          disabled={busy}
          className="rounded-lg border border-beacon px-4 py-2 text-sm font-medium text-beacon transition hover:bg-beacon/10 disabled:opacity-50"
        >
          {busy ? t("submit.link.linking") : t("submit.link.button")}
        </button>
      </div>
      {err && <p className="mt-2 text-flare">{err}</p>}
      {msg && <p className="mt-2 text-emerald-400">{msg}</p>}
    </div>
  );
}

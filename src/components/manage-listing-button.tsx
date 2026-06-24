"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "./providers";
import { switchWalletChain } from "@/lib/chains";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

// Inline "Manage this listing" on the provider page: connect the wallet and sign in (opening a
// session), then route to /submit?manage=1, which detects the session and jumps straight to the
// edit form - skipping the otherwise near-empty connect screen.
export function ManageListingButton() {
  const { t } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function connectAndManage() {
    setErr("");
    setBusy(true);
    try {
      if (!window.ethereum) throw new Error(t("submit.err.noWalletShort"));
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const addr = accounts?.[0];
      if (!addr) throw new Error(t("submit.err.noAccount"));

      // Match the wallet network to the session challenge chain (Flare 14) for a consistent popup.
      await switchWalletChain(window.ethereum, 14);

      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr, chainId: 14 }),
      });
      if (!nonceRes.ok) throw new Error(t("submit.err.noChallenge"));
      const { message } = await nonceRes.json();
      const signature = (await window.ethereum.request({
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
      router.push("/submit?manage=1");
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("submit.err.verifyFailed"));
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={connectAndManage}
        disabled={busy}
        className="text-sm text-muted underline-offset-2 hover:text-beacon hover:underline disabled:opacity-50"
      >
        {busy ? t("detail.manageConnecting") : t("detail.manageListing")} &rarr;
      </button>
      {err && <p className="mt-1 text-xs text-flare">{err}</p>}
    </div>
  );
}

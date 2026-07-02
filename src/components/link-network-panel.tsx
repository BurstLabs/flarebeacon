"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CHAINS } from "@/lib/chains";
import { useWalletSign } from "@/lib/useWalletSign";
import { useApp } from "./providers";
import { apiErrorMessage } from "@/lib/i18n";

// Self-contained "Link another network" flow. Connects a wallet, signs the user in with the
// connected address (proof of an address they already control on this listing), then takes a
// second signature for the NEW address and links it. Used on /submit and on the provider page.
//
// providerName  - the listing name the API matches the link against
// excludeChainId - the chain of the address the user is viewing (so it is not offered again)
// addresses     - the listing's current addresses, so an owner can remove one (unlink)
export function LinkNetworkPanel({
  providerName,
  excludeChainId,
  addresses = [],
}: {
  providerName: string;
  excludeChainId?: number;
  addresses?: { chainId: number; chain: string; address: string; verified: boolean }[];
}) {
  const { t } = useApp();
  const router = useRouter();
  const connectAndSign = useWalletSign(t);
  // Only mainnet networks are listable (testnets have no verifiable on-chain entity data), and a
  // network already on this listing cannot be linked again - offer only the ones not yet present.
  const presentChainIds = new Set<number>([
    ...(excludeChainId != null ? [excludeChainId] : []),
    ...addresses.map((a) => a.chainId),
  ]);
  const options = CHAINS.filter((c) => c.mainnet && !presentChainIds.has(c.chainId));
  const [linkChainId, setLinkChainId] = useState<number>(options[0]?.chainId ?? 0);
  const [busy, setBusy] = useState(false); // a "link a new network" action is in progress
  const [verifyingKey, setVerifyingKey] = useState<string>(""); // which existing row is being verified
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [removing, setRemoving] = useState<string>("");

  async function signIn() {
    // Establish a session as the connected address (must be one that owns this listing; the server
    // enforces ownership). The session challenge is on Flare (14).
    const { message, signature } = await connectAndSign({ chainId: 14, action: "session" });
    const verifyRes = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    if (!verifyRes.ok) {
      const body = await verifyRes.json().catch(() => ({}));
      throw new Error(apiErrorMessage(t, body, "submit.err.verifyFailed"));
    }
  }

  // Submit a link/verify to the server with a fresh B-signature for `chainId`.
  async function postLink(chainId: number): Promise<Response> {
    const { message, signature } = await connectAndSign({ chainId, action: "link" });
    return fetch("/api/provider/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature, name: providerName }),
    });
  }

  // Core flow. VERIFY an existing row needs only a single signature from the target network. LINK a
  // NEW network additionally requires an owner session (proof you own THIS listing), so a stranger
  // can't attach their address to it by name. The happy path is still one signature: when the
  // provider is already managing the listing (came in via "Manage this listing"), the session exists
  // and the first attempt succeeds. Only if the server reports the caller is not a signed-in owner do
  // we ask them to sign in with an address already on the listing, then retry the B-signature. That
  // keeps the two-identity requirement clear ("owner, then the new address") without a silent
  // wallet-switch.
  async function proveAddress(chainId: number, mode: "link" | "verify" = "link") {
    setErr("");
    setMsg("");
    // Track loading on the control actually clicked, so the link button doesn't show "Linking..." when
    // a row's Verify is running, and vice versa.
    if (mode === "verify") setVerifyingKey(`${chainId}`);
    else setBusy(true);
    try {
      let res = await postLink(chainId);

      // New-network link with no owner session: the server asks us to prove ownership first. Guide the
      // user to sign in with an address ALREADY on the listing, then retry the new-address signature.
      if (mode === "link" && (res.status === 401 || res.status === 403)) {
        const body = await res.clone().json().catch(() => ({}));
        if (body?.code === "NOT_AUTHENTICATED" || body?.code === "NOT_LISTING_OWNER") {
          setMsg(t("submit.link.ownerStep"));
          await signIn(); // connect a wallet holding one of the listing's addresses, sign in
          setMsg("");
          res = await postLink(chainId); // now sign for the NEW address and link
        }
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(t, body, "submit.err.linkFailed"));
      }
      const chainName =
        CHAINS.find((c) => c.chainId === chainId)?.name ?? t("submit.fallback.network");
      setMsg(
        mode === "verify"
          ? t("submit.verify.ok", { network: chainName })
          : t("submit.link.ok", { network: chainName })
      );
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("submit.err.linkFailed"));
    } finally {
      setBusy(false);
      setVerifyingKey("");
    }
  }

  async function removeAddress(chainId: number, address: string) {
    setErr("");
    setMsg("");
    if (!window.confirm(t("submit.unlink.confirm", { address }))) return;
    setRemoving(`${chainId}-${address}`);
    try {
      // Prove ownership of the listing by signing in with a wallet that holds one of its addresses.
      await signIn();

      const res = await fetch("/api/provider/unlink", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chainId, address }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          apiErrorMessage(t, body, "submit.err.unlinkFailed")
        );
      }
      setMsg(t("submit.unlink.ok"));
      // If we're viewing the page AT the removed address, that URL no longer exists - navigate to a
      // surviving address's page instead of refreshing into a 404. Otherwise just refresh in place.
      const viewingRemoved =
        typeof window !== "undefined" &&
        window.location.pathname.toLowerCase().includes(address.toLowerCase());
      const survivor = addresses.find((a) => a.address.toLowerCase() !== address.toLowerCase());
      if (viewingRemoved && survivor) {
        router.push(`/provider/${survivor.address.toLowerCase()}`);
      } else {
        router.refresh();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("submit.err.unlinkFailed"));
    } finally {
      setRemoving("");
    }
  }

  return (
    <div className="rounded border border-themed bg-elev/50 p-4 text-sm">
      <p className="font-medium">{t("submit.link.title")}</p>
      {options.length === 0 ? (
        // Every listable (mainnet) network is already on this listing.
        <p className="mt-1 text-muted">{t("submit.link.allLinked")}</p>
      ) : (
        <>
          <p className="mt-1 text-muted">{t("submit.link.body")}</p>
          <p className="mt-2 text-xs text-faint">{t("submit.link.accountHint")}</p>
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
              onClick={() => proveAddress(linkChainId)}
              disabled={busy}
              className="rounded-lg border border-beacon px-4 py-2 text-sm font-medium text-beacon transition hover:bg-beacon/10 disabled:opacity-50"
            >
              {busy ? t("submit.link.linking") : t("submit.link.button")}
            </button>
          </div>
        </>
      )}
      {addresses.length > 1 && (
        <div className="mt-4 border-t border-themed pt-3">
          <p className="text-xs text-faint">{t("submit.unlink.heading")}</p>
          <ul className="mt-2 space-y-1">
            {addresses.map((a) => (
              <li
                key={`${a.chainId}-${a.address}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="min-w-0 flex items-center gap-2 truncate">
                  {/* Network + status, not the address: any of the entity's five role addresses can
                      verify/manage it, so a single address would be misleading here too. */}
                  <span className="font-medium">{a.chain}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      a.verified ? "bg-beacon/20 text-beacon" : "bg-elev text-faint"
                    }`}
                  >
                    {a.verified ? t("badge.verified") : t("badge.unverified")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {!a.verified && (
                    <button
                      type="button"
                      onClick={() => proveAddress(a.chainId, "verify")}
                      disabled={verifyingKey === `${a.chainId}` || busy}
                      className="text-xs text-beacon underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      {verifyingKey === `${a.chainId}`
                        ? t("submit.verify.verifying")
                        : t("submit.verify.button")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAddress(a.chainId, a.address)}
                    disabled={removing === `${a.chainId}-${a.address}`}
                    className="text-xs text-flare underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {removing === `${a.chainId}-${a.address}`
                      ? t("submit.unlink.removing")
                      : t("submit.unlink.button")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && <p className="mt-2 text-flare">{err}</p>}
      {msg && <p className="mt-2 text-emerald-400">{msg}</p>}
    </div>
  );
}

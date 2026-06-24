// Supported chains. chainId matches the standard provider list so feed entries stay interchangeable.

export interface ChainInfo {
  chainId: number;
  key: string;
  name: string;
  /** True for the production networks shown in wallets; testnets are opt-in. */
  mainnet: boolean;
  /** For wallet_addEthereumChain, so a sign popup can be switched to match the address's chain. */
  rpcUrl: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  explorerUrl: string;
}

export const CHAINS: ChainInfo[] = [
  {
    chainId: 14,
    key: "flare",
    name: "Flare",
    mainnet: true,
    rpcUrl: "https://flare-api.flare.network/ext/C/rpc",
    nativeCurrency: { name: "Flare", symbol: "FLR", decimals: 18 },
    explorerUrl: "https://flare-explorer.flare.network",
  },
  {
    chainId: 19,
    key: "songbird",
    name: "Songbird",
    mainnet: true,
    rpcUrl: "https://songbird-api.flare.network/ext/C/rpc",
    nativeCurrency: { name: "Songbird", symbol: "SGB", decimals: 18 },
    explorerUrl: "https://songbird-explorer.flare.network",
  },
  {
    chainId: 16,
    key: "coston",
    name: "Coston",
    mainnet: false,
    rpcUrl: "https://coston-api.flare.network/ext/C/rpc",
    nativeCurrency: { name: "Coston Flare", symbol: "CFLR", decimals: 18 },
    explorerUrl: "https://coston-explorer.flare.network",
  },
  {
    chainId: 114,
    key: "coston2",
    name: "Coston2",
    mainnet: false,
    rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
    nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
    explorerUrl: "https://coston2-explorer.flare.network",
  },
];

const BY_ID = new Map(CHAINS.map((c) => [c.chainId, c]));

export function getChain(chainId: number): ChainInfo | undefined {
  return BY_ID.get(chainId);
}

export function isSupportedChain(chainId: number): boolean {
  return BY_ID.has(chainId);
}

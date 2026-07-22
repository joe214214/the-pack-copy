import type { NextConfig } from "next";
import { networkInterfaces } from "os";

/**
 * Every non-internal IPv4 address of this machine, as dev origins.
 *
 * Next 16 blocks cross-origin requests to dev-only assets (`/_next/*`, the HMR
 * socket) from any origin other than the one the server booted on — localhost.
 * Opening the app from ANOTHER device on the LAN therefore loads the HTML but
 * not the client bundle, so React never hydrates: buttons do nothing and forms
 * fall back to a native submit (the page "flashes" and stays put).
 *
 * We enumerate the interfaces at startup instead of hardcoding an address
 * because the LAN IP changes with the network (office WiFi vs phone hotspot).
 * start-dev.bat restarts the server per launch, so a new IP is picked up then.
 */
function lanOrigins(): string[] {
  const out = new Set<string>();
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) out.add(a.address);
    }
  }
  return [...out];
}

const nextConfig: NextConfig = {
  // Dev-only setting; ignored in production builds.
  allowedDevOrigins: lanOrigins(),
};

export default nextConfig;

import { mergeConfig } from "vite";

import baseConfig from "./vite.config.ts";

// Fork-only config for running `vite` behind jupyter-server-proxy on a
// JupyterHub. Extends the standard config and:
//   - sets `base` to the proxied path so Vite's injected URLs
//     (`/@vite/client`, HMR websocket, module IDs) go through the proxy
//     instead of hitting the hub root
//   - binds to 0.0.0.0 so the hub proxy can reach the dev server
//   - disables the Vite 8 host allowlist (hub URL is not localhost)
// Invoke with: `npm run dev -- -c vite.jupyter.config.ts`
const port = 3000;
const servicePrefix = process.env.JUPYTERHUB_SERVICE_PREFIX ?? "/";
const base = `${servicePrefix}proxy/${port}/`;

export default mergeConfig(baseConfig, {
  base,
  server: {
    host: true,
    port,
    strictPort: true,
    allowedHosts: true,
  },
});

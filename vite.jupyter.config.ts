import { mergeConfig } from "vite";

import baseConfig from "./vite.config.ts";

// Fork-only companion to vite.config.ts. When running inside a
// JupyterHub single-user server it:
//   - sets `base` to the proxy path Vite is served at (via
//     jupyter-server-proxy's `absolute` mode) so Vite's injected URLs
//     (`/@vite/client`, HMR websocket, module IDs) resolve through the
//     hub proxy instead of the hub root
//   - binds to 0.0.0.0 so the hub proxy can reach the dev server
//   - disables the Vite 8 host allowlist (hub URL is not localhost)
// Detection is by JUPYTERHUB_SERVICE_PREFIX. Off-hub this file is a
// no-op that merges an empty object with the standard config, so it
// is safe to point `npm run dev` at it unconditionally.
//
// Access with the `absolute` variant, which preserves the full path
// instead of stripping the proxy prefix. The stripping variant causes
// a redirect loop with Vite's subpath `base`:
//   https://<hub-host>${JUPYTERHUB_SERVICE_PREFIX}proxy/absolute/3000/
const servicePrefix = process.env.JUPYTERHUB_SERVICE_PREFIX;
const port = 3000;

const overrides = servicePrefix
  ? {
      base: `${servicePrefix}proxy/absolute/${port}/`,
      server: {
        host: true,
        port,
        strictPort: true,
        allowedHosts: true,
      },
    }
  : {};

export default mergeConfig(baseConfig, overrides);

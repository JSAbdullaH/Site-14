import path from "path";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Lets iOS open /pair/XXXX links in the SITE14 app. VITE_IOS_APP_ID is "<TEAM ID>.<bundle id>",
// for example "ABCDE12345.sa.site14.tracker". Without it the file is not published.
function appleAppSiteAssociation(appId: string | undefined): Plugin {
  const fileName = ".well-known/apple-app-site-association";
  const body = appId?.trim()
    ? JSON.stringify({ applinks: { details: [{ appIDs: [appId.trim()], components: [{ "/": "/pair/*" }] }] } })
    : null;
  return {
    name: "apple-app-site-association",
    configureServer(server) {
      if (!body) return;
      server.middlewares.use(`/${fileName}`, (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(body);
      });
    },
    generateBundle() {
      if (body) this.emitFile({ type: "asset", fileName, source: body });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [react(), tailwindcss(), appleAppSiteAssociation(env.VITE_IOS_APP_ID)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:4000",
          changeOrigin: true,
        },
      },
    },
  };
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // listen on 0.0.0.0 so Tailscale / LAN can reach the dev server
    // Allow access via Tailscale (.ts.net) and any LAN host. Leading dot
    // matches the domain and all subdomains.
    allowedHosts: [".ts.net", ".local", "localhost"],
  },
});

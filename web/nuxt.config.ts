// The BillSplit front end. It is a client-rendered SPA: `nuxt generate` writes static files
// to .output/public, which the Worker serves as its static assets (see wrangler.jsonc).
export default defineNuxtConfig({
  compatibilityDate: "2026-09-01",
  ssr: false,
  modules: ["@nuxt/ui", "@nuxtjs/i18n"],
  css: ["~/assets/css/main.css"],
  devtools: { enabled: false },

  app: {
    head: {
      title: "BillSplit",
      htmlAttrs: { lang: "en" },
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "description", content: "Split group expenses with friends and see who owes whom." },
        { name: "theme-color", content: "#0f766e" },
        // Link previews. og:url and the canonical link are per page, added by the Worker (src/page-meta.ts).
        // The share image is rendered from design/og-image.html (see the comment there).
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "BillSplit" },
        { property: "og:title", content: "BillSplit" },
        { property: "og:description", content: "Split group expenses with friends and see who owes whom." },
        { property: "og:image", content: "https://billsplit.atlesque.dev/og-image.png" },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: "BillSplit: split group expenses with friends and see who owes whom." },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      link: [
        { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
        { rel: "manifest", href: "/manifest.webmanifest" },
      ],
    },
  },

  // System fonts, and icons bundled into the build instead of fetched from the Iconify API.
  ui: { fonts: false },
  icon: {
    provider: "none",
    fallbackToApi: false,
    clientBundle: {
      scan: true,
      // Icons Nuxt UI components use by default (selects, modals, toasts, checkboxes).
      icons: [
        "lucide:x", "lucide:check", "lucide:chevron-down", "lucide:chevron-up", "lucide:loader-circle",
        "lucide:minus", "lucide:plus", "lucide:info", "lucide:circle-alert", "lucide:circle-check",
        "lucide:circle-x", "lucide:triangle-alert", "lucide:sun", "lucide:moon", "lucide:monitor",
      ],
    },
  },

  i18n: {
    // URLs stay the same in every language (share links must keep working).
    strategy: "no_prefix",
    defaultLocale: "en",
    locales: [
      { code: "en", language: "en", name: "English", file: "en.json" },
      { code: "nl", language: "nl-NL", name: "Nederlands", file: "nl.json" },
    ],
    // The switcher's saved choice, else the browser language, else English.
    detectBrowserLanguage: { useCookie: true, cookieKey: "billsplit.lang", redirectOn: "all", alwaysRedirect: false, fallbackLocale: "en" },
  },

  // Only the SPA shell is written out; the Worker serves it for every non-asset path.
  nitro: { prerender: { crawlLinks: false, routes: ["/"] } },

  // `pnpm dev:web` runs Nuxt with hot reload and sends /api to `wrangler dev` on :8787.
  vite: {
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:8787",
          // The Worker refuses mutations whose Origin isn't its own.
          headers: { origin: "http://localhost:8787" },
        },
      },
    },
  },
});

// The Junk Desk palettes, defined in assets/css/main.css: navy primary, lime secondary, ink greys.
export default defineAppConfig({
  ui: {
    colors: { primary: "navy", secondary: "lime", success: "green", info: "sky", warning: "amber", error: "red", neutral: "ink" },
    // Blur the page behind a modal, so the dialog stands out from what's underneath.
    modal: { slots: { overlay: "backdrop-blur-sm" } },
  },
});

import { createRoot } from "react-dom/client";
import styles from "./styles.css?inline";
import { Widget, type WidgetConfig } from "./Widget";

export type { WidgetConfig };

/** Mounts the widget in a Shadow DOM so host-page CSS cannot leak in or out. */
export function init(config: WidgetConfig): { destroy(): void } {
  const host = document.createElement("div");
  host.setAttribute("data-support-widget", config.siteKey);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  const mount = document.createElement("div");
  shadow.append(style, mount);
  document.body.append(host);

  const root = createRoot(mount);
  root.render(<Widget config={config} />);
  return {
    destroy() {
      root.unmount();
      host.remove();
    },
  };
}

// Captured synchronously: currentScript is null once the script has finished running.
const script = document.currentScript as HTMLScriptElement | null;
const siteKey = script?.dataset.siteKey;
const apiUrl = script?.dataset.apiUrl;
if (siteKey && apiUrl) {
  const config: WidgetConfig = {
    siteKey,
    apiUrl,
    ...(script.dataset.title ? { title: script.dataset.title } : {}),
    ...(script.dataset.primaryColor ? { primaryColor: script.dataset.primaryColor } : {}),
  };
  if (document.body) init(config);
  else document.addEventListener("DOMContentLoaded", () => init(config), { once: true });
}

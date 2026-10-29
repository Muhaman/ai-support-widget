import { useState, type CSSProperties } from "react";
import { api as defaultApi, type ChatApi } from "./api";
import { ChatWindow } from "./components/ChatWindow";
import { Launcher } from "./components/Launcher";

export interface WidgetConfig {
  siteKey: string;
  apiUrl: string;
  title?: string;
  primaryColor?: string;
}

interface Props {
  config: WidgetConfig;
  api?: ChatApi;
}

const WINDOW_ID = "sw-window";

export function Widget({ config, api = defaultApi }: Props) {
  const [open, setOpen] = useState(false);
  const style = config.primaryColor ? ({ "--sw-primary": config.primaryColor } as CSSProperties) : undefined;

  return (
    <div className="sw-root" style={style}>
      {open && (
        <ChatWindow
          id={WINDOW_ID}
          siteKey={config.siteKey}
          apiUrl={config.apiUrl}
          title={config.title ?? "Support"}
          api={api}
          onClose={() => setOpen(false)}
        />
      )}
      <Launcher open={open} onToggle={() => setOpen((o) => !o)} controlsId={WINDOW_ID} />
    </div>
  );
}

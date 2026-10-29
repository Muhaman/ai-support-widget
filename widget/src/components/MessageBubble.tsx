interface Props {
  role: "user" | "assistant";
  text: string;
}

export function MessageBubble({ role, text }: Props) {
  return <div className={`sw-bubble sw-bubble--${role}`}>{text || "…"}</div>;
}

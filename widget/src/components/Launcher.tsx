interface Props {
  open: boolean;
  onToggle(): void;
  controlsId: string;
}

export function Launcher({ open, onToggle, controlsId }: Props) {
  return (
    <button
      type="button"
      className="sw-launcher"
      aria-expanded={open}
      aria-controls={controlsId}
      aria-label={open ? "Close support chat" : "Open support chat"}
      onClick={onToggle}
    >
      {open ? "×" : "\u{1F4AC}"}
    </button>
  );
}

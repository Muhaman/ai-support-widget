import { useState, type KeyboardEvent } from "react";

interface Props {
  disabled: boolean;
  onSend(text: string): void;
}

export function Composer({ disabled, onSend }: Props) {
  const [value, setValue] = useState("");
  const canSend = !disabled && value.trim().length > 0;

  const submit = (): void => {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <form
      className="sw-composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        className="sw-input"
        aria-label="Message"
        placeholder="Type your message"
        rows={1}
        maxLength={2000}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className="sw-send" disabled={!canSend}>
        Send
      </button>
    </form>
  );
}

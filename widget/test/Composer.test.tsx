import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "../src/components/Composer";

function setup(disabled = false) {
  const onSend = vi.fn();
  render(<Composer disabled={disabled} onSend={onSend} />);
  const input = screen.getByRole("textbox") as HTMLTextAreaElement;
  const send = screen.getByRole("button", { name: /send/i }) as HTMLButtonElement;
  return { onSend, input, send };
}

describe("Composer", () => {
  it("disables send for whitespace-only input", () => {
    const { input, send } = setup();
    expect(send.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "   \n " } });
    expect(send.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "hello" } });
    expect(send.disabled).toBe(false);
  });

  it("submits trimmed text on Enter and clears the field", () => {
    const { input, onSend } = setup();
    fireEvent.change(input, { target: { value: " hello " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(input.value).toBe("");
  });

  it("does not submit on Shift+Enter, leaving the newline to the textarea", () => {
    const { input, onSend } = setup();
    fireEvent.change(input, { target: { value: "hello" } });
    const notPrevented = fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(notPrevented).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not submit while disabled", () => {
    const { input, onSend } = setup(true);
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });
});

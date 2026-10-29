import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatApi } from "../src/api";
import { Widget } from "../src/Widget";

const api: ChatApi = {
  streamChat: async () => undefined,
  loadConversation: async () => null,
};

describe("Launcher", () => {
  it("toggles the chat window and updates aria-expanded", () => {
    render(<Widget config={{ siteKey: "pk_demo", apiUrl: "http://api.test" }} api={api} />);
    const launcher = screen.getByRole("button", { name: /support chat/i });

    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(launcher);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(launcher);
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

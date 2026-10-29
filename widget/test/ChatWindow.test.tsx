import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatStreamError, type ChatApi, type StreamArgs } from "../src/api";
import { ChatWindow } from "../src/components/ChatWindow";

const baseProps = { siteKey: "pk_demo", apiUrl: "http://api.test", title: "Support", onClose: () => undefined };

function send(text: string) {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
}

describe("ChatWindow", () => {
  it("renders streamed chunks as one assistant bubble", async () => {
    const api: ChatApi = {
      loadConversation: async () => null,
      streamChat: async (args: StreamArgs) => {
        args.onMeta("c1");
        args.onText("Hi");
        args.onText(" there");
      },
    };
    render(<ChatWindow {...baseProps} api={api} />);
    send("hello");
    expect(screen.getByText("hello")).toBeTruthy();
    expect(await screen.findByText("Hi there")).toBeTruthy();
  });

  it("shows a retry state when the stream fails and retries without a duplicate user bubble", async () => {
    let attempts = 0;
    const api: ChatApi = {
      loadConversation: async () => null,
      streamChat: async (args: StreamArgs) => {
        attempts += 1;
        if (attempts === 1) {
          args.onText("Par");
          throw new ChatStreamError("The connection closed before the reply finished.");
        }
        args.onText("Full answer");
      },
    };
    render(<ChatWindow {...baseProps} api={api} />);
    send("hello");
    fireEvent.click(await screen.findByRole("button", { name: /retry/i }));
    expect(await screen.findByText("Full answer")).toBeTruthy();
    expect(screen.getAllByText("hello")).toHaveLength(1);
    expect(screen.queryByText("Par")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces a human handoff when the server escalates", async () => {
    const api: ChatApi = {
      loadConversation: async () => null,
      streamChat: async (args: StreamArgs) => {
        args.onEscalated("t1");
        args.onText("A human will follow up.");
      },
    };
    render(<ChatWindow {...baseProps} api={api} />);
    send("talk to a person");
    expect(await screen.findByText(/human agent has been notified/i)).toBeTruthy();
  });
});

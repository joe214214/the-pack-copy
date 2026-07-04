import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export class NextSseTransport implements Transport {
  public sessionId: string;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage) => void;

  private controller?: ReadableStreamDefaultController;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async start(): Promise<void> {
    // start is called when server.connect() is invoked.
  }

  // Returns the web stream to be used in NextResponse
  createStream(endpointUrl: string): ReadableStream {
    return new ReadableStream({
      start: (controller) => {
        this.controller = controller;
        // Send the endpoint event immediately
        controller.enqueue(new TextEncoder().encode(`event: endpoint\ndata: ${endpointUrl}\n\n`));
      },
      cancel: () => {
        this.controller = undefined;
        if (this.onclose) this.onclose();
      }
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.controller) {
      throw new Error("Stream closed");
    }
    const data = JSON.stringify(message);
    this.controller.enqueue(new TextEncoder().encode(`event: message\ndata: ${data}\n\n`));
  }

  async close(): Promise<void> {
    if (this.controller) {
      try {
        this.controller.close();
      } catch (e) {}
      this.controller = undefined;
    }
    if (this.onclose) this.onclose();
  }

  // Called when the POST endpoint receives a message
  handlePostMessage(message: JSONRPCMessage) {
    if (this.onmessage) {
      this.onmessage(message);
    }
  }
}

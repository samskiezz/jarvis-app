
/**
 * Production contract for gRPC-Web / WebSocket Protobuf transport.
 * This reference implementation uses browser WebSocket and expects binary ArrayBuffer frames.
 * Actual Protobuf encode/decode is configured by /src/proto/graph_delta.proto.
 */
export type BinaryFrameHandler = (frame: ArrayBuffer) => void;

export class BinaryDeltaSocket {
  private socket: WebSocket | null = null;
  private queue: ArrayBuffer[] = [];

  constructor(private url: string, private onFrame: BinaryFrameHandler) {}

  connect() {
    this.socket = new WebSocket(this.url);
    this.socket.binaryType = 'arraybuffer';
    this.socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) this.onFrame(event.data);
    };
    this.socket.onopen = () => {
      for (const frame of this.queue.splice(0)) this.socket?.send(frame);
    };
  }

  send(frame: ArrayBuffer) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(frame);
    else this.queue.push(frame);
  }

  close() {
    this.socket?.close();
    this.socket = null;
  }
}

"use client";

import { useEffect, useRef, useState } from "react";
import { BuildSteps } from "@/components/chat/build-steps";

interface StreamingTextProps {
  stream: ReadableStream<Uint8Array>;
  onComplete?: (text: string) => void;
  onChunk?: () => void;
  className?: string;
}

/**
 * Reads a plain-text ReadableStream chunk by chunk and shows an animated
 * "build steps" indicator while the AI is generating. The raw code is never
 * rendered here — once the stream finishes, `onComplete` hands the full text
 * to the parent, which displays only the explanation (code stripped).
 *
 * The stream is consumed exactly once. Callbacks are stored in refs and the
 * reader is stored in a ref, so re-renders (and React StrictMode's double
 * effect invocation in dev) never try to lock the same ReadableStream twice —
 * which would throw "ReadableStreamDefaultReader constructor can only accept
 * readable streams that are not yet locked to a reader".
 */
export function StreamingText({
  stream,
  onComplete,
  onChunk,
  className,
}: StreamingTextProps) {
  const [text, setText] = useState("");
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null,
  );
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onChunkRef = useRef(onChunk);

  // Keep the latest callback identities without re-triggering the read effect.
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onChunkRef.current = onChunk;
  });

  useEffect(() => {
    // Already consuming this stream (e.g. StrictMode re-run) — bail out.
    if (readerRef.current) {
      return;
    }
    // Safety net: never lock a stream that is already locked elsewhere.
    if (stream.locked) {
      console.warn("StreamingText: stream is already locked, skipping read.");
      return;
    }

    const reader = stream.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();
    let acc = "";

    const read = async () => {
      let failed = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          acc += decoder.decode(value, { stream: true });
          setText(acc);
          onChunkRef.current?.();
        }
      } catch (error) {
        failed = true;
        console.error("Streaming error:", error);
      } finally {
        if (!completedRef.current) {
          completedRef.current = true;
          // If the generation failed/timed out before producing anything, hand
          // the parent an explicit message so the chat shows a clear error
          // bubble instead of an empty reply (which looks broken).
          const final =
            acc ||
            (failed
              ? "⚠️ Generation failed or timed out. The AI provider may be overloaded — please try again."
              : "");
          onCompleteRef.current?.(final);
        }
      }
    };

    void read();

    // Intentionally no cleanup that cancels the stream: the reader stays
    // attached so the stream is read exactly once, even across StrictMode's
    // mount/unmount/mount cycle in development.
  }, [stream]);

  return (
    <div className={className}>
      <BuildSteps text={text} />
    </div>
  );
}

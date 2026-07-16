import type { AssistantCommandResponse } from "@/types/assistant";

/**
 * Client-side parser for the assistant's SSE stream (Task C). Pure and
 * incremental so it is unit-testable: feed raw chunks in any split, get typed
 * events out; `assembleFinalText` proves the streamed deltas equal the final
 * non-streamed answer.
 */

export type AssistantStreamEvent =
  | { type: "delta"; text: string }
  | { type: "status"; key: string }
  | { type: "final"; data: AssistantCommandResponse }
  | { type: "error"; message?: string };

export function createAssistantStreamParser() {
  let buffer = "";
  return {
    /** Feeds one network chunk; returns every complete event it contained. */
    feed(chunk: string): AssistantStreamEvent[] {
      buffer += chunk;
      const events: AssistantStreamEvent[] = [];
      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex >= 0) {
        const frame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const dataLine = frame
          .split("\n")
          .find((line) => line.startsWith("data: "));
        if (dataLine) {
          try {
            const parsed = JSON.parse(dataLine.slice(6)) as AssistantStreamEvent;
            if (parsed && typeof parsed.type === "string") events.push(parsed);
          } catch {
            // malformed frame — skip, never crash the stream
          }
        }
        separatorIndex = buffer.indexOf("\n\n");
      }
      return events;
    },
  };
}

/** Concatenates delta events — must equal the final response text. */
export function assembleFinalText(events: AssistantStreamEvent[]): string {
  return events
    .filter((e): e is Extract<AssistantStreamEvent, { type: "delta" }> => e.type === "delta")
    .map((e) => e.text)
    .join("");
}

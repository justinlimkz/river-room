import { applyAction, decideBot, type HandState, type PokerAction } from "./poker-engine";

export type EngineRequest = { id: number; state: HandState; action?: PokerAction };
export type EngineResponse = { id: number; state?: HandState; error?: string };

self.onmessage = ({ data }: MessageEvent<EngineRequest>) => {
  try {
    const action = data.action ?? decideBot(data.state, data.state.currentActor);
    const state = applyAction(data.state, data.state.currentActor, action);
    self.postMessage({ id: data.id, state } satisfies EngineResponse);
  } catch {
    self.postMessage({ id: data.id, error: "The decision could not be processed. Your hand is unchanged. Retry the action or reload." } satisfies EngineResponse);
  }
};

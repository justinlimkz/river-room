// Public entry point for the River Room engine. Implementation lives in
// ./engine, layered so that lower modules never import higher ones:
//   types → cards → rules → board/profiles/context → preflop → ranges
//   → evaluation → bots → coach → game, with persistence beside rules.
// explain and timeline only read finished hands and reviews; nothing imports them.
export * from "./engine/types";
export * from "./engine/cards";
export * from "./engine/rules";
export * from "./engine/board";
export * from "./engine/profiles";
export * from "./engine/context";
export * from "./engine/preflop";
export * from "./engine/ranges";
export * from "./engine/evaluation";
export * from "./engine/bots";
export * from "./engine/coach";
export * from "./engine/game";
export * from "./engine/persistence";
export * from "./engine/explain";
export * from "./engine/timeline";

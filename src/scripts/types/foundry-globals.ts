declare global {

  export const game: foundryvtt.Game;
  export const Hooks: foundryvtt.Hooks;

  export function deepClone<T>(obj: T): T;

}

export {};
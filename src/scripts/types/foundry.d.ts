export {};

export interface Game {
  // [key: string]: any;
  i18n: {
    localize(key: string): string;
  }
  view: string;
  modules: Map<string, Module>;
  version?: string;
  /** @deprecated */
  data?: {
    version?: string;
  }
}

export interface Module {
  [key: string]: any;
  active: boolean;
}

export interface Hooks {
  on(hook: string, cb: (...args: any[]) => void): number;
  once: Hooks['on'];
}

declare global {

  export const game: Game;
  export const Hooks: Hooks;

  export function deepClone<T>(obj: T): T;

}
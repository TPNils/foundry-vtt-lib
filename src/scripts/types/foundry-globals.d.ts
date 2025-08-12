declare const game: foundryvtt.Game;
declare const Hooks: foundryvtt.Hooks;

 /** @deprecated */
declare const deepClone = foundry.utils.deepClone;

declare namespace foundry {
  declare namespace utils {
    declare function deepClone<T>(obj: T): T;
  }
}
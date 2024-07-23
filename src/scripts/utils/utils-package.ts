export namespace UtilsPackage {
  export interface Package {
    readonly id: string;
    readonly type: 'module' | 'system' | 'world';
  }
}

export class UtilsPackage {

  public static getCallerPackage(options: {who?: UtilsPackage.Who} = {}): UtilsPackage.Package {
    const stack = new Error().stack;
    // Line 0 = this method
    // Line 1 = the method who wan't to know it's caller
    // Line 2 = the caller
    const callerLine = stack.split('\n')[options.who ?? UtilsPackage.Who.CALLER];

    const match = /\/(worlds|systems|modules)\/([^\/]+)/.exec(callerLine);
    if (match) {
      return Object.freeze({
        id: match[2],
        type: match[1].replace(/s$/, '').toLowerCase() as UtilsPackage.Package['type'],
      })
    }
    return {id: 'world', type: 'world'};
  }

  public static requireInternalCaller(): void {
    const thisModule = UtilsPackage.getUtilsPackageModule();
    const caller = UtilsPackage.getCallerPackage({who: UtilsPackage.Who.CALLERS_CALLER});
    if (caller.type !== thisModule.type || caller.id !== thisModule.id) {
      throw new Error(`Only the ${thisModule.type} "${thisModule.id}" may execute this action. Found: ${caller.type} "${caller.id}"`);
    }
  }
  
  static #utilsPackageModule: UtilsPackage.Package;
  public static getUtilsPackageModule(): UtilsPackage.Package {
    if (UtilsPackage.#utilsPackageModule == null) {
      UtilsPackage.#utilsPackageModule = UtilsPackage.getCallerPackage({who: UtilsPackage.Who.NILS_LIB});
    }
    return UtilsPackage.#utilsPackageModule;
  }
  
}
export namespace UtilsPackage {
  export enum Who {
    NILS_LIB = 0,
    SELF = 1,
    CALLER = 2,
    CALLERS_CALLER = 3,
  }
}
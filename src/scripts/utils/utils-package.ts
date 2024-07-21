export namespace UtilsPackage {
  export interface Package {
    readonly id: string;
    readonly type: 'module' | 'system' | 'world';
  }
}

const verifiedStack = Symbol('verifiedStack');

export class UtilsPackage {

  public static getCallerPackage(options: {[verifiedStack]?: string} = {}): UtilsPackage.Package {
    const stack = options?.[verifiedStack] ?? new Error().stack;
    // Line 0 = UtilsPackage
    // Line 1 = the method who wan't to know it's caller
    // Line 2 = the caller
    const callerLine = stack.split('\n')[2];

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
    const caller = UtilsPackage.getCallerPackage({[verifiedStack]: new Error().stack});
    if (caller.type !== 'module' || caller.id !== 'nils-library') {
      throw new Error(`Only the module "nils-library" may execute this action. Found: ${caller.type} "${caller.id}"`);
    }
  }
  
}
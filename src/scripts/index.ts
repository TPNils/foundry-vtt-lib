import { UtilsCompare } from "./utils/utils-compare";
import { UtilsFoundry } from "./utils/utils-foundry";
import { UtilsHooks } from "./utils/utils-hooks";
import { UtilsLibWrapper } from "./utils/utils-lib-wrapper";
import { UtilsLog } from "./utils/utils-log";
import { UtilsPackage } from "./utils/utils-package";

class ModuleScope {

  public readonly utilsCompare: typeof UtilsCompare;
  public readonly utilsFoundry: typeof UtilsFoundry;
  public readonly utilsHooks: typeof UtilsHooks;
  public readonly utilsLibWrapper: UtilsLibWrapper;
  public readonly utilsLog: UtilsLog;

  constructor(pack: UtilsPackage.Package) {
    UtilsPackage.requireInternalCaller();

    this.utilsCompare = UtilsCompare;
    this.utilsFoundry = UtilsFoundry;
    this.utilsHooks = UtilsHooks;
    this.utilsLibWrapper = new UtilsLibWrapper(pack);
    this.utilsLog = new UtilsLog(pack);
  }

}

const scopes = new Map<string, ModuleScope>();

function getScope(caller: UtilsPackage.Package): ModuleScope {
  const key = `${caller.type}/${caller.id}`;
  if (!scopes.has(key)) {
    scopes.set(key, new ModuleScope(caller));
  }
  return scopes.get(key);
}

export function utilsCompare(): ModuleScope['utilsCompare'] {
  return getScope(UtilsPackage.getCallerPackage()).utilsCompare;
}

export function utilsFoundry(): ModuleScope['utilsFoundry'] {
  return getScope(UtilsPackage.getCallerPackage()).utilsFoundry;
}

export function utilsHooks(): ModuleScope['utilsHooks'] {
  return getScope(UtilsPackage.getCallerPackage()).utilsHooks;
}

export function utilsLibWrapper(): ModuleScope['utilsLibWrapper'] {
  return getScope(UtilsPackage.getCallerPackage()).utilsLibWrapper;
}

export function utilsLog(): ModuleScope['utilsLog'] {
  return getScope(UtilsPackage.getCallerPackage()).utilsLog;
}
import * as C from "./render-engine/component";
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
  public readonly component: (...args: Parameters<typeof C.Component>) => ReturnType<typeof C.Component>;
  public readonly attribute: typeof C.Attribute;
  public readonly bindEvent: typeof C.BindEvent;
  public readonly output: typeof C.Output;

  constructor(pack: UtilsPackage.Package) {
    UtilsPackage.requireInternalCaller();

    this.utilsCompare = UtilsCompare;
    this.utilsFoundry = UtilsFoundry;
    this.utilsHooks = UtilsHooks;
    this.utilsLibWrapper = new UtilsLibWrapper(pack);
    this.utilsLog = new UtilsLog(pack);

    this.component = (config: C.ComponentConfig | string) => {
      const tag = typeof config === 'string' ? config : config.tag;
      let isPrefixed = tag.toLowerCase().startsWith(`${pack.id}-`);
      if (!isPrefixed) {
        // abbreviated prefix
        // example: nils-library => nl | nils-lib | nlib
        const prefix = /^([^-]+)-/.exec(tag)?.[1];
        if (prefix?.length >= 2) {
          let index = 0;
          for (let char of prefix) {
            index = pack.id.indexOf(char, index);
            if (index === -1) {
              break;
            }
          }
          isPrefixed = index !== -1;
        }
      }
      if (!isPrefixed) {
        const examples = [
          'nlib-button',
          `${pack.id}-button`,
        ];
        const abbrExample = Array.from(pack.id.matchAll(/(?:^|[^a-z])([a-z])/gi));
        if (abbrExample.length >= 2) {
          examples.push(abbrExample.map(rgx => rgx[1]).join('') + '-button')
        }
        throw new Error(`Components need to be prefixed with the module name (${pack.id}) or an abbreviation of it (minimum 2 characters) followed by a minus "-". Example: ${examples.map(e => `"${e}"`).join(', ')}. Found: ${tag}`);
      }
      return Component(config);
    }
    this.attribute = Attribute;
    this.bindEvent = BindEvent;
    this.output = Output;
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

export function Component(...args: Parameters<typeof C.Component>): ReturnType<typeof C.Component> {
  return getScope(UtilsPackage.getCallerPackage()).component(...args);
}

export function Attribute(...args: Parameters<typeof C.Attribute>): ReturnType<typeof C.Attribute> {
  return getScope(UtilsPackage.getCallerPackage()).attribute(...args);
}

export function BindEvent(...args: Parameters<typeof C.BindEvent>): ReturnType<typeof C.BindEvent> {
  return getScope(UtilsPackage.getCallerPackage()).bindEvent(...args);
}

export function Output(...args: Parameters<typeof C.Output>): ReturnType<typeof C.Output> {
  return getScope(UtilsPackage.getCallerPackage()).output(...args);
}
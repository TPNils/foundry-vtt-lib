import { Stoppable } from "./stoppable.js";
import { UtilsHooks } from "./utils-hooks.js";
import { UtilsLog } from "./utils-log.js";
import { UtilsPackage } from "./utils-package.js";

declare namespace libWrapper {

  type Func<ARG extends any[] = any[]> = (original: (...ARG) => any, ...args: ARG) => any;

  /**
   * Register a new wrapper.
   * Important: If called before the 'init' hook, this method will fail.
   *
   * In addition to wrapping class methods, there is also support for wrapping methods on specific object instances, as well as class methods inherited from parent classes.
   * However, it is recommended to wrap methods directly in the class that defines them whenever possible, as inheritance/instance wrapping is less thoroughly tested and will incur a performance penalty.
   *
   * Triggers FVTT hook 'libWrapper.Register' when successful.
   *
   * @param {string} package_id  The package identifier, i.e. the 'id' field in your module/system/world's manifest.
   *
   * @param {string} target      A string containing the path to the function you wish to add the wrapper to, starting at global scope, for example 'SightLayer.prototype.updateToken'.
   *
   *   Since v1.8.0.0, the path can contain string array indexing.
   *   For example, 'CONFIG.Actor.sheetClasses.character["dnd5e.ActorSheet5eCharacter"].cls.prototype._onLongRest' is a valid path.
   *   It is important to note that indexing in libWrapper does not work exactly like in JavaScript:
   *     - The index must be a single string, quoted using the ' or " characters. It does not support e.g. numbers or objects.
   *     - Quotes i.e. ' and " can be escaped with a preceding '\'.
   *     - The character '\' can be escaped with a preceding '\'.
   *
   *   By default, libWrapper searches for normal methods or property getters only. To wrap a property's setter, append '#set' to the name, for example 'SightLayer.prototype.blurDistance#set'.
   *
   * @param {function} fn        Wrapper function. The first argument will be the next function in the chain, except for 'OVERRIDE' wrappers.
   *                             The remaining arguments will correspond to the parameters passed to the wrapped method.
   *
   * @param {string} type        [Optional] The type of the wrapper. Default is 'MIXED'.
   *
   *   The possible types are:
   *
   *   'WRAPPER' / libWrapper.WRAPPER:
   *     Use if your wrapper will *always* continue the chain.
   *     This type has priority over every other type. It should be used whenever possible as it massively reduces the likelihood of conflicts.
   *     Note that the library will auto-detect if you use this type but do not call the original function, and automatically unregister your wrapper.
   *
   *   'MIXED' / libWrapper.MIXED:
   *     Default type. Your wrapper will be allowed to decide whether it continue the chain or not.
   *     These will always come after 'WRAPPER'-type wrappers. Order is not guaranteed, but conflicts will be auto-detected.
   *
   *   'OVERRIDE' / libWrapper.OVERRIDE:
   *     Use if your wrapper will *never* continue the chain. This type has the lowest priority, and will always be called last.
   *     If another package already has an 'OVERRIDE' wrapper registered to the same method, using this type will throw a <libWrapper.LibWrapperAlreadyOverriddenError> exception.
   *     Catching this exception should allow you to fail gracefully, and for example warn the user of the conflict.
   *     Note that if the GM has explicitly given your package priority over the existing one, no exception will be thrown and your wrapper will take over.
   *
   * @param {Object} options [Optional] Additional options to libWrapper.
   *
   * @param {boolean} options.chain [Optional] If 'true', the first parameter to 'fn' will be a function object that can be called to continue the chain.
   *   Default is 'false' if type=='OVERRIDE', otherwise 'true'.
   *   First introduced in v1.3.6.0.
   *
   * @param {string} options.perf_mode [OPTIONAL] Selects the preferred performance mode for this wrapper. Default is 'AUTO'.
   *   It will be used if all other wrappers registered on the same target also prefer the same mode, otherwise the default will be used instead.
   *   This option should only be specified with good reason. In most cases, using 'AUTO' in order to allow the GM to choose is the best option.
   *   First introduced in v1.5.0.0.
   *
   *   The possible modes are:
   *
   *   'NORMAL' / libWrapper.PERF_NORMAL:
   *     Enables all conflict detection capabilities provided by libWrapper. Slower than 'FAST'.
   *     Useful if wrapping a method commonly modified by other packages, to ensure most issues are detected.
   *     In most other cases, this mode is not recommended and 'AUTO' should be used instead.
   *
   *   'FAST' / libWrapper.PERF_FAST:
   *     Disables some conflict detection capabilities provided by libWrapper, in exchange for performance. Faster than 'NORMAL'.
   *     Will guarantee wrapper call order and per-package prioritization, but fewer conflicts will be detectable.
   *     This performance mode will result in comparable performance to traditional non-libWrapper wrapping methods.
   *     Useful if wrapping a method called repeatedly in a tight loop, for example 'WallsLayer.testWall'.
   *     In most other cases, this mode is not recommended and 'AUTO' should be used instead.
   *
   *   'AUTO' / libWrapper.PERF_AUTO:
   *     Default performance mode. If unsure, choose this mode.
   *     Will allow the GM to choose which performance mode to use.
   *     Equivalent to 'FAST' when the libWrapper 'High-Performance Mode' setting is enabled by the GM, otherwise 'NORMAL'.
   */
  function register(
    packageId: string,
    target: string,
    fn: libWrapper.Func,
    type: 'WRAPPER' | 'MIXED' | 'OVERRIDE',
    options?: {
      chain?: boolean;
      perf_mode?: 'NORMAL' | 'FAST' | 'AUTO'
    }
  ): void;

  
  /**
   * Unregister an existing wrapper.
   *
   * Triggers FVTT hook 'libWrapper.Unregister' when successful.
   *
   * @param {string} package_id     The package identifier, i.e. the 'id' field in your module/system/world's manifest.
   *
   * @param {number|string} target  The target identifier, specifying which wrapper should be unregistered.
   *
   *   This can be either:
   *     1. A unique target identifier obtained from a previous 'libWrapper.register' call. This is the recommended option.
   *     2. A string containing the path to the function you wish to remove the wrapper from, starting at global scope, with the same syntax as the 'target' parameter to 'libWrapper.register'.
   *
   *   It is recommended to use option #1 if possible, in order to guard against the case where the class or object at the given path is no longer the same as when `libWrapper.register' was called.
   *
   *   Support for the unique target identifiers (option #1) was added in v1.11.0.0, with previous versions only supporting option #2.
   *
   * @param {function} fail         [Optional] If true, this method will throw an exception if it fails to find the method to unwrap. Default is 'true'.
   */
  function unregister(package_id: string, target: number | string, fail?: boolean);
}

let libWrapperResolve: () => void;
const libWrapperResolvePromise = new Promise<void>((resolve) => libWrapperResolve = resolve);

function isLibWrapperActive(): boolean {
  return game.modules.get('lib-wrapper')?.active === true;
}

function getGlobalProperty(key: string): any {
  if (!key) {
    return undefined;
  }
  const path = key.split('.');
  const rootPath = path.splice(0, 1)[0];
  let target: any;
  if (rootPath in globalThis) {
    target = globalThis[rootPath];
  } else if (/^[a-z][a-z0-9]*$/i.test(rootPath)) {
    // Some "global" variables are not in the globalThis scope
    target = eval(rootPath);
  } else {
    throw new Error(`Could not find the global variable ${rootPath} for key: ${key}`)
  }
  for (let prop of path) {
    target = target[prop];
    if (target == null) {
      return target
    }
  }
  return target;
}

interface FuncData {
  readonly id: number;
  readonly fn: libWrapper.Func;
  readonly type: 'WRAPPER' | 'MIXED' | 'OVERRIDE';
  readonly stoppable: Stoppable;
}

const utilsLog = new UtilsLog({id: 'nils-library', type: 'module'});
const modifiedFunctionsByTarget = new Map<string, ModifiedFunctionWrapper>();
class ModifiedFunctionWrapper {
  public originalFunction?: (...args: any[]) => any;
  public functions = new Map<number, FuncData>();
  #nextFnId = 0;

  private constructor(public readonly target: string) {}

  public add(fn: libWrapper.Func, module: string, type: 'WRAPPER' | 'MIXED' | 'OVERRIDE'): Stoppable {
    try {
      const id = this.#nextFnId++;
      this.functions.set(id, {
        fn,
        type,
        id,
        stoppable: {
          stop: () => {
            this.functions.delete(id);
            if (this.functions.size === 0) {
              if (isLibWrapperActive()) {
                libWrapper.unregister(module, this.target);
              } else {
                const parentTarget = this.target.split('.');
                const childProp = parentTarget.pop();
                const parent = getGlobalProperty(parentTarget.join('.'));
                parent[childProp] = this.originalFunction;
              }
              modifiedFunctionsByTarget.delete(this.target);
            }
          }
        }
      });
      if (type === 'OVERRIDE' && Array.from(this.functions.values()).find(fn => fn.type === 'OVERRIDE')) {
        throw new Error(`Can't have multiple overrides for target: ${type}`);
      }
      if (this.functions.size === 1) {
        if (isLibWrapperActive()) {
          libWrapper.register(module, this.target, this.createExecFunc(), 'MIXED');
        } else {
          const parentTarget = this.target.split('.');
          const childProp = parentTarget.pop();
          const parent = getGlobalProperty(parentTarget.join('.'));
          this.originalFunction = parent[childProp];
          const execFunc = this.createExecFunc();
          const that = this;
          parent[childProp] = function(...args: any[]) {
            return execFunc.call(this, that.originalFunction, ...args);
          }
        }
      }
      return this.functions.get(id).stoppable;
    } catch (e) {
      utilsLog.error(`Error occurred when trying to ${type} ${this.target}`);
      throw e;
    }
  }

  private createExecFunc(): libWrapper.Func {
    const that = this;
    return function (original: (...args: any[]) => any, ...args: any[]): any {
      const functionsByType = new Map<string, Function[]>();
      functionsByType.set('WRAPPER', []);
      functionsByType.set('MIXED', []);
      functionsByType.set('OVERRIDE', []);
      for (const fn of that.functions.values()) {
        functionsByType.get(fn.type).push(fn.fn);
      }

      const sortedFunctions = Array.from(that.functions.values()).sort(ModifiedFunctionWrapper.sortWrappedFunc);
      let index = 0;

      let originalFuncCalled = false;
      function doNext(...args: any[]): any {
        if (sortedFunctions.length === index) {
          originalFuncCalled = true;
          return original.apply(this, args)
        }
        const {fn} = sortedFunctions[index++];
        return fn.call(this, doNext.bind(this), ...args);
      }

      const validateLastCalled = () => {
        const lastExec = sortedFunctions[index-1];
        if (lastExec.type === 'WRAPPER' && !originalFuncCalled) {
          utilsLog.error(`${lastExec.type} did not call the wrapper for ${that.target}, that function will be unregistered.`);
          lastExec.stoppable.stop();
        }
      }
      
      let response: any;
      do {
        response = doNext.apply(this, args);
        
        if (response instanceof Promise) {
          return response.then(async () => {
            validateLastCalled();

            while (sortedFunctions.length < index && sortedFunctions[index].type === 'WRAPPER' && !originalFuncCalled) {
              response = await doNext.apply(this, args);
              validateLastCalled();
            }
            
            return response;
          });
        }
        validateLastCalled();
      } while (sortedFunctions.length >= index-1 && sortedFunctions[index-1].type === 'WRAPPER' && !originalFuncCalled)

      return response;
    }
  }

  public static get(target: string): ModifiedFunctionWrapper {
    try {
      if (!modifiedFunctionsByTarget.has(target)) {
        modifiedFunctionsByTarget.set(target, new ModifiedFunctionWrapper(target));
        modifiedFunctionsByTarget.get(target).originalFunction = getGlobalProperty(target);
      }
      return modifiedFunctionsByTarget.get(target);
    } catch (e) {
      utilsLog.error(`Error occurred when trying to get ${target}`);
      throw e;
    }
  }

  private static sortWrappedFunc(a: {type: 'WRAPPER' | 'MIXED' | 'OVERRIDE'}, b: {type: 'WRAPPER' | 'MIXED' | 'OVERRIDE'}): number {
    return ModifiedFunctionWrapper.typeToNr(a.type) - ModifiedFunctionWrapper.typeToNr(b.type);
  }

  private static typeToNr(type: 'WRAPPER' | 'MIXED' | 'OVERRIDE'): number {
    switch (type) {
      case 'WRAPPER': return 2;
      case 'MIXED': return 1;
      case 'OVERRIDE': return 0;
    }
    return 0;
  }

}

/**
 * lib-wrapper does not allow to register multiple overrides
 * This utility allows me to do this and also make lib-wrapper an optional dependency
 */
export class UtilsLibWrapper {

  readonly #package: UtilsPackage.Package;
  constructor(pack: UtilsPackage.Package) {
    UtilsPackage.requireInternalCaller();
    this.#package = pack;
  }

  /**
   *  Use if your wrapper will *always* continue the chain.
   *  This type has priority over every other type. It should be used whenever possible as it massively reduces the likelihood of conflicts.
   *  Note that the library will auto-detect if you use this type but do not call the original function, and automatically unregister your wrapper.
   */
  public wrapper(target: string, fn: libWrapper.Func): Promise<Stoppable> {
    return libWrapperResolvePromise.then(() => ModifiedFunctionWrapper.get(target).add(fn, this.#package.id, 'WRAPPER'));
  }

  /**
   * Default type. Your wrapper will be allowed to decide whether it continue the chain or not.
   * These will always come after 'WRAPPER'-type wrappers. Order is not guaranteed, but conflicts will be auto-detected.
   */
  public mixed(target: string, fn: libWrapper.Func): Promise<Stoppable> {
    return libWrapperResolvePromise.then(() => ModifiedFunctionWrapper.get(target).add(fn, this.#package.id, 'MIXED'));
  }

  /**
   * Use if your wrapper will *never* continue the chain. This type has the lowest priority, and will always be called last.
   * If another package already has an 'OVERRIDE' wrapper registered to the same method, using this type will throw a <libWrapper.LibWrapperAlreadyOverriddenError> exception.
   * Catching this exception should allow you to fail gracefully, and for example warn the user of the conflict.
   * Note that if the GM has explicitly given your package priority over the existing one, no exception will be thrown and your wrapper will take over.
   */
  public override(target: string, fn: libWrapper.Func): Promise<Stoppable> {
    return libWrapperResolvePromise.then(() => ModifiedFunctionWrapper.get(target).add(fn, this.#package.id, 'OVERRIDE'));
  }

}

Hooks.once('libWrapper.Ready', libWrapperResolve);
// fallback
UtilsHooks.ready(libWrapperResolve);

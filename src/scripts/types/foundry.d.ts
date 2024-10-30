declare namespace foundryvtt {
  export interface Game {
    [key: string]: any;
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
  
    readonly events: Hooks.HookedFunction[];
  
    /**
     * Register a callback handler which should be triggered when a hook is triggered.
     * @param hook          The unique name of the hooked event
     * @param fn            The callback function which should be triggered when the hook event occurs
     * @param options       Options which customize hook registration
     * @param options.once  Only trigger the hooked function once
     * @returns             An ID number of the hooked function which can be used to turn off the hook later
     */
    on(event: string, fn: Function, options?: {once: boolean}): number;
  
    /**
     * Register a callback handler for an event which is only triggered once the first time the event occurs.
     * An alias for Hooks.on with {once: true}
     * @param hook The unique name of the hooked event
     * @param fn   The callback function which should be triggered when the hook event occurs
     * @returns    An ID number of the hooked function which can be used to turn off the hook later
     */
    once(event: string, fn: Function): number;
    
    /**
     * Unregister a callback handler for a particular hook event
     * @param hook  The unique name of the hooked event
     * @param fn    The function, or ID number for the function, that should be turned off
     */
    off(hook: string, fn: Function | number): void;
    
  
    /**
     * Call all hook listeners in the order in which they were registered
     * Hooks called this way can not be handled by returning false and will always trigger every hook callback.
     *
     * @param hook  The hook being triggered
     * @param args  Arguments passed to the hook callback functions
     * @returns     Were all hooks called without execution being prevented?
     */
    callAll(hook: string, ...args: any[]): boolean;
  
    /**
     * Call hook listeners in the order in which they were registered.
     * Continue calling hooks until either all have been called or one returns false.
     *
     * Hook listeners which return false denote that the original event has been adequately handled and no further
     * hooks should be called.
     *
     * @param hook  The hook being triggered
     * @param args  Arguments passed to the hook callback functions
     * @returns     Were all hooks called without execution being prevented?
     */
    call(hook: string, ...args: any[]): boolean;
    
    /**
     * Notify subscribers that an error has occurred within foundry.
     * @param location        The method where the error was caught.
     * @param error           The error.
     * @param options         Additional options to configure behaviour.
     * @param options.msg     A message which should prefix the resulting error or notification.
     * @param options.log     The level at which to log the error to console (if at all).
     * @param options.notify  The level at which to spawn a notification in the UI (if at all).
     * @param options.data    Additional data to pass to the hook subscribers.
     */
    onError(location: string, error: Error, options?: {msg?: string, notify?: string, log?: string, data?: {[key: string]: any}}): void;
  }
  
  export namespace Hooks {
    export interface HookedFunction {
      hook: string;
      id: number;
      fn: (...args: any[]) => any;
      once: boolean;
    }
  }
}
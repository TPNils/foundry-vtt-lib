import { UtilsPackage } from "./utils-package.js";

export type FormattedString = string | {
  message: string;
  color?: string;
}

const resetFormat: Required<Omit<FormattedString, 'message'>> = {
  color: 'reset',
}

export class UtilsLog {
  
  readonly #package: UtilsPackage.Package;
  constructor(pack: UtilsPackage.Package) {
    UtilsPackage.requireInternalCaller();
    this.#package = pack;
  }

  public buildInfo(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return UtilsLog.#build(console.info, {message: this.#package.id, color: '#ff8f00'}, ...args);
  }
  public buildDebug(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return UtilsLog.#build(console.debug, {message: this.#package.id, color: '#ff8f00'}, ...args);
  }
  public buildLog(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return UtilsLog.#build(console.log, {message: this.#package.id, color: '#ff8f00'}, ...args);
  }
  public buildWarn(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return UtilsLog.#build(console.warn, {message: this.#package.id, color: '#ff8f00'}, ...args);
  }
  public buildError(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return UtilsLog.#build(console.error, {message: this.#package.id, color: '#ff8f00'}, ...args);
  }

  public info = this.#createWithPrefix('info');
  public debug = this.#createWithPrefix('debug');
  public log = this.#createWithPrefix('log');
  public warn = this.#createWithPrefix('warn');
  public error = this.#createWithPrefix('error');

  #createWithPrefix<T extends keyof Console>(key: T): Console[T] {
    if (typeof console[key] === 'function') {
      return UtilsLog.#build(console[key], {message: this.#package.id, color: '#ff8f00'});
    } else {
      return console[key];
    }
  }

  static #build(logFunc: Function, ...args: FormattedString[]) {
    const messageParts: string[] = [];
    const styles: string[] = [];
    for (let arg of args) {
      if (typeof arg === 'string') {
        arg = {message: arg}
      }
      arg = {
        ...resetFormat, // reset any values not provided
        ...arg,
      };

      messageParts.push(`%c${arg.message}`);
      styles.push(`color: ${arg.color};`);
    }

    return logFunc.bind(console, messageParts.join(' '), ...styles);
  }

}

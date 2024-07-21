import { UtilsPackage } from "./utils-package.js";

export type FormattedString = string | {
  message: string;
  color?: string;
}

const resetFormat: Required<Omit<FormattedString, 'message'>> = {
  color: 'reset',
}

function build(logFunc: Function, ...args: FormattedString[]) {
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

export class UtilsLog {
  

  public info: Console['info'];
  public debug: Console['debug'];
  public log: Console['log'];
  public warn: Console['warn'];
  public error: Console['error'];

  readonly #package: UtilsPackage.Package;
  constructor(pack: UtilsPackage.Package) {
    UtilsPackage.requireInternalCaller();
    this.#package = pack;
    this.info = this.#createWithPrefix('info');
    this.debug = this.#createWithPrefix('debug');
    this.log = this.#createWithPrefix('log');
    this.warn = this.#createWithPrefix('warn');
    this.error = this.#createWithPrefix('error');
  }

  public buildInfo(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return build(console.info, {message: this.#package.id, color: '#ff8f00'}, ...args);
  }
  public buildDebug(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return build(console.debug, {message: this.#package.id, color: '#ff8f00'}, ...args);
  }
  public buildLog(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return build(console.log, {message: this.#package.id, color: '#ff8f00'}, ...args);
  }
  public buildWarn(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return build(console.warn, {message: this.#package.id, color: '#ff8f00'}, ...args);
  }
  public buildError(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return build(console.error, {message: this.#package.id, color: '#ff8f00'}, ...args);
  }

  #createWithPrefix<T extends keyof Console>(key: T): Console[T] {
    if (typeof console[key] === 'function') {
      return build(console[key], {message: this.#package.id, color: '#ff8f00'});
    } else {
      return console[key];
    }
  }

}

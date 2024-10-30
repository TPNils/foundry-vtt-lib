import { UtilsHooks } from "./utils-hooks.js";

export class Version {
  
  constructor(
    public readonly major: number,
    public readonly minor?: number,
    public readonly patch?: number,
  ) {
  }

  public valueOf() {
    const parts = [this.major, this.minor ?? 0, this.patch ?? 0];
    return parts.map(part => String(part).padStart(20, '0')).join('.');
  }

  public equals(value: any): boolean {
    if (!(value instanceof Version)) {
      return false;
    }

    return this.major === value.major && (this.minor ?? 0) === (value.minor ?? 0) && (this.patch ?? 0) === (value.patch ?? 0);
  }

  public toString(): string {
    const parts = [this.major];
    if (this.minor != null) {
      parts.push(this.minor);
    }
    if (this.patch != null) {
      parts.push(this.patch);
    }
    return parts.join('.');
  }

  public static fromString(versionString: string): Version {
    let version = /^v?([0-9]+)(?:\.([0-9]+))?(?:\.([0-9]+))?$/i.exec(versionString);
    if (!version) {
      throw new Error('Unsupported version format');
    }

    const versionData = {major: 0, minor: undefined, patch: undefined};
    versionData.major = Number.parseInt(version[1]);
    versionData.minor = Number.parseInt(version[2]);
    versionData.patch = Number.parseInt(version[3]);
    return new Version(versionData.major, versionData.minor, versionData.patch);
  }

}

export class UtilsFoundry {

  public static getGameVersion(options?: {async?: false}): Version;
  public static getGameVersion(options: {async: true}): Promise<Version>;
  public static getGameVersion(options: {async?: boolean} = {}): Version | Promise<Version> {
    if (options.async) {
      return UtilsHooks.init().then(() => UtilsFoundry.getGameVersion({async: false}));
    }
    let version: string;
    // @ts-ignore
    if (typeof game.version === 'string') {
      // @ts-ignore
      version = game.version
      // @ts-ignore
    } else if (typeof game.data?.version === 'string') {
      // @ts-ignore
      version = game.data?.version;
      // @ts-ignore
    } else if (typeof game.data?.release === 'object' && game.data?.release != null) {
      // @ts-ignore
      return new Version(game.data?.release.generation, game.data?.release.build);
    }
    if (!version) {
      let hasInitTriggered = false;
      // If init is resolved, it will exec sync, if not async
      // This way we can detect if it has triggered or not
      UtilsHooks.init().then(() => hasInitTriggered = true);
      if (!hasInitTriggered) {
        throw new Error('No version found');
      }
      throw new Error('Nothing found, have they deprecated the version var?');
    }

    return Version.fromString(version);
  }

}
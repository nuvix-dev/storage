import { Validator } from "./validator.js";

export class File extends Validator {
  public getDescription(): string {
    return "File is not valid";
  }

  /**
   * NOT MUCH RIGHT NOW.
   *
   * TODO think what to do here, currently only used for parameter to be present in SDKs
   *
   * @param name
   * @return boolean
   */
  public isValid(_name: any): boolean {
    return true;
  }
}

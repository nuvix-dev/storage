import { Validator } from "./validator.js";

export class FileType extends Validator {
  /**
   * File Types Constants.
   */
  static readonly FILE_TYPE_JPEG = "jpeg";
  static readonly FILE_TYPE_GIF = "gif";
  static readonly FILE_TYPE_PNG = "png";
  static readonly FILE_TYPE_GZIP = "gz";

  /**
   * Magic-byte signatures used to identify file content.
   */
  private readonly types: Record<string, number[]> = {
    [FileType.FILE_TYPE_JPEG]: [0xff, 0xd8, 0xff],
    [FileType.FILE_TYPE_GIF]: [0x47, 0x49, 0x46], // "GIF"
    [FileType.FILE_TYPE_PNG]: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a],
    [FileType.FILE_TYPE_GZIP]: [0x1f, 0x8b],
  };

  private readonly allowed: string[];

  constructor(allowed: string[]) {
    super();

    for (const key of allowed) {
      if (!(key in this.types)) {
        throw new Error("Unknown file mime type");
      }
    }

    this.allowed = allowed;
  }

  getDescription(): string {
    return "File mime-type is not allowed ";
  }

  /**
   * Binary signature check: reads only the first few bytes of the file
   * (via Bun.file slice) instead of loading the whole file into memory.
   */
  async isValid(path: string): Promise<boolean> {
    try {
      const maxSignatureLength = Math.max(
        ...Object.values(this.types).map((sig) => sig.length),
      );
      const head = await Bun.file(path).slice(0, maxSignatureLength).bytes();

      return this.allowed.some((key) => {
        const signature = this.types[key];
        return (
          signature !== undefined &&
          signature.every((byte, index) => head[index] === byte)
        );
      });
    } catch {
      return false;
    }
  }
}

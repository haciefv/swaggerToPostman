declare module "openapi-to-postmanv2" {
  interface ConversionResult {
    result: boolean;
    reason?: string;
    output?: Array<{ type: string; data: unknown }>;
  }

  interface Converter {
    convert(
      input: { type: string; data: unknown },
      options: Record<string, unknown>,
      callback: (error: Error | null | undefined, result: ConversionResult) => void
    ): void;
  }

  const converter: Converter;
  export default converter;
}

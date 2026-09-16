export class TranslationToolsException extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
  }
}

export class TranslationToolsNetworkException extends TranslationToolsException {}

export class TranslationToolsHttpException extends TranslationToolsException {
  constructor(
    readonly statusCode: number,
    readonly responseBody: string,
  ) {
    super(`TranslationTools request failed with status ${statusCode}. Body: ${responseBody}`);
  }
}

export class TranslationToolsSerializationException extends TranslationToolsException {}

export class TranslationToolsValidationException extends TranslationToolsException {}

export class PlaceholderSubstitutionException extends TranslationToolsException {}

import { getEncoding, type TiktokenEncoding } from 'js-tiktoken';
import { BaseAdapter } from './BaseAdapter.js';
import type { SupportedModel, ITokenizer } from '../types.js';

/**
 * Model to TikToken encoding mapping for GPT models
 */
const GPT_MODEL_ENCODING_MAP: Record<string, TiktokenEncoding> = {
  'gpt-4': 'cl100k_base',
  'gpt-4-turbo': 'cl100k_base',
  'gpt-4o': 'o200k_base',
  'gpt-4o-mini': 'o200k_base',
  'gpt-3.5-turbo': 'cl100k_base',
};

/**
 * TikToken-based tokenizer implementation for GPT models
 */
class GPTTokenizer implements ITokenizer {
  private encoding: any;

  constructor(
    private model: SupportedModel,
    encoding: any
  ) {
    this.encoding = encoding;
  }

  encode(text: string): number[] {
    return this.encoding.encode(text);
  }

  countTokens(text: string): number {
    return this.encoding.encode(text).length;
  }

  getModel(): SupportedModel {
    return this.model;
  }
}

/**
 * Adapter for OpenAI GPT models using js-tiktoken
 */
export class GPTAdapter extends BaseAdapter {
  private supportedModels: SupportedModel[] = [
    'gpt-4',
    'gpt-4-turbo',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-3.5-turbo',
  ];

  getName(): string {
    return 'GPT Adapter (js-tiktoken)';
  }

  getSupportedModels(): SupportedModel[] {
    return [...this.supportedModels];
  }

  protected async createTokenizerImplementation(model: SupportedModel): Promise<ITokenizer> {
    const encodingName = GPT_MODEL_ENCODING_MAP[model];
    if (!encodingName) {
      throw new Error(`No encoding mapping found for GPT model: ${model}`);
    }

    try {
      const encoding = getEncoding(encodingName);
      return new GPTTokenizer(model, encoding);
    } catch (error) {
      throw new Error(`Failed to initialize js-tiktoken for model ${model}: ${error}`);
    }
  }

  /**
   * Get the tiktoken encoding name for a specific model
   */
  getEncodingName(model: SupportedModel): TiktokenEncoding | undefined {
    return GPT_MODEL_ENCODING_MAP[model];
  }

  /**
   * Check if the model uses the newer o200k_base encoding
   */
  usesNewEncoding(model: SupportedModel): boolean {
    return GPT_MODEL_ENCODING_MAP[model] === 'o200k_base';
  }
}
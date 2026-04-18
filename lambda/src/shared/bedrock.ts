import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export interface BedrockInvokeParams {
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  guardrailId?: string;
  guardrailVersion?: string;
  enablePromptCache?: boolean;
}

export interface BedrockInvokeResult {
  text: string;
  tokensInput: number;
  tokensOutput: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface BedrockInvoker {
  invoke(params: BedrockInvokeParams): Promise<BedrockInvokeResult>;
}

export class RealBedrockInvoker implements BedrockInvoker {
  private readonly client: BedrockRuntimeClient;

  constructor(client?: BedrockRuntimeClient) {
    this.client = client ?? new BedrockRuntimeClient({});
  }

  async invoke(params: BedrockInvokeParams): Promise<BedrockInvokeResult> {
    const systemBlocks: Array<Record<string, unknown>> = [{ text: params.systemPrompt }];
    if (params.enablePromptCache) {
      systemBlocks.push({ cachePoint: { type: 'default' } });
    }

    const request: Record<string, unknown> = {
      modelId: params.modelId,
      system: systemBlocks,
      messages: [
        {
          role: 'user',
          content: [{ text: params.userPrompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: params.maxTokens ?? 2048,
        temperature: params.temperature ?? 0.1,
      },
    };

    if (params.guardrailId && params.guardrailVersion) {
      request.guardrailConfig = {
        guardrailIdentifier: params.guardrailId,
        guardrailVersion: params.guardrailVersion,
        trace: 'enabled',
      };
    }

    // ハマりポイント:
    // 1. ConverseCommand のコンストラクタ引数型は Prompt Caching の cachePoint や
    //    guardrailConfig を含む最新形に追従できておらず、request オブジェクトを
    //    素直に渡すと TS2352 エラー。unknown 経由でキャストしています。
    // 2. Bedrock の usage には Prompt Cache の read/write トークン数が含まれますが、
    //    @aws-sdk/client-bedrock-runtime の TokenUsage 型にはまだ cacheReadInputTokens
    //    / cacheWriteInputTokens が入っていない（TS2339）。実際のランタイムでは値が
    //    返ってくるので、ローカルで型キャストして読み取ります。SDK が追従したら消せます。
    const command = new ConverseCommand(
      request as unknown as ConstructorParameters<typeof ConverseCommand>[0],
    );
    const response = await this.client.send(command);
    const text =
      response.output?.message?.content?.map((c) => ('text' in c ? c.text : '')).join('') ?? '';
    const usage = (response.usage ?? {}) as {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadInputTokens?: number;
      cacheWriteInputTokens?: number;
    };

    return {
      text,
      tokensInput: usage.inputTokens ?? 0,
      tokensOutput: usage.outputTokens ?? 0,
      cacheReadTokens: usage.cacheReadInputTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteInputTokens ?? 0,
    };
  }
}

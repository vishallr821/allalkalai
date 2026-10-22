import { config } from "../../config/env";

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown
  ) {
    super(`[${provider}] ${message}`);
    this.name = "AIProviderError";
  }
}

export class AITimeoutError extends AIProviderError {
  constructor(provider: string, timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`, provider, 408);
    this.name = "AITimeoutError";
  }
}

export class AIRateLimitError extends AIProviderError {
  constructor(provider: string) {
    super("Rate limit exceeded", provider, 429);
    this.name = "AIRateLimitError";
  }
}

export class AIValidationError extends AIProviderError {
  constructor(provider: string, details: string) {
    super(`Response validation failed: ${details}`, provider, 422);
    this.name = "AIValidationError";
  }
}

export type MessageContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | MessageContentBlock[];
}

export interface CompletionOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}

export interface CompletionResult {
  content: string;
  provider: "nebius" | "groq";
  model: string;
  latencyMs: number;
}

/**
 * Universal OpenAI-compatible AI client supporting Nebius Token Factory and Groq
 */
export class AIClient {
  /**
   * Calls Nebius Token Factory chat completions endpoint with timeout and retry.
   */
  public async callNebius(options: CompletionOptions): Promise<CompletionResult> {
    const apiKey = config.ai.nebius.apiKey;
    if (!apiKey) {
      throw new AIProviderError("NEBIUS_API_KEY is not configured", "nebius");
    }

    const baseUrl = config.ai.nebius.baseUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/chat/completions`;
    const timeoutMs = options.timeoutMs || config.ai.tier1TimeoutMs;

    return this.executeWithRetry("nebius", async () => {
      return this.sendChatRequest({
        provider: "nebius",
        url,
        apiKey,
        options,
        timeoutMs,
      });
    });
  }

  /**
   * Calls Groq OpenAI-compatible chat completions endpoint with timeout and retry.
   */
  public async callGroq(options: CompletionOptions): Promise<CompletionResult> {
    const apiKey = config.ai.groq.apiKey;
    if (!apiKey) {
      throw new AIProviderError("GROQ_API_KEY is not configured", "groq");
    }

    const url = "https://api.groq.com/openai/v1/chat/completions";
    const timeoutMs = options.timeoutMs || config.ai.tier1TimeoutMs;

    return this.executeWithRetry("groq", async () => {
      return this.sendChatRequest({
        provider: "groq",
        url,
        apiKey,
        options,
        timeoutMs,
      });
    });
  }

  private async sendChatRequest(params: {
    provider: "nebius" | "groq";
    url: string;
    apiKey: string;
    options: CompletionOptions;
    timeoutMs: number;
  }): Promise<CompletionResult> {
    const { provider, url, apiKey, options, timeoutMs } = params;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const startTime = Date.now();
    try {
      const bodyPayload: Record<string, unknown> = {
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1024,
      };

      if (options.jsonMode) {
        bodyPayload.response_format = { type: "json_object" };
      }

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        if (response.status === 429) {
          throw new AIRateLimitError(provider);
        }
        throw new AIProviderError(
          `HTTP ${response.status} ${response.statusText}: ${errorText.slice(0, 300)}`,
          provider,
          response.status
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const content = data?.choices?.[0]?.message?.content || "";
      if (!content) {
        throw new AIValidationError(provider, "Empty completion content received");
      }

      return {
        content,
        provider,
        model: options.model,
        latencyMs,
      };
    } catch (err: unknown) {
      if (err instanceof AIProviderError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new AITimeoutError(provider, timeoutMs);
      }
      throw new AIProviderError(
        err instanceof Error ? err.message : "Unknown request error",
        provider,
        undefined,
        err
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Executes an action with 1 retry on transient failure (timeout or 5xx).
   */
  private async executeWithRetry<T>(
    provider: "nebius" | "groq",
    fn: () => Promise<T>
  ): Promise<T> {
    try {
      return await fn();
    } catch (firstError) {
      // Don't retry client errors (401/403/400) except rate limit or timeout
      if (
        firstError instanceof AIProviderError &&
        firstError.statusCode &&
        [400, 401, 403, 404].includes(firstError.statusCode)
      ) {
        throw firstError;
      }

      console.warn(`[AIClient] ${provider} attempt 1 failed (${firstError instanceof Error ? firstError.message : firstError}). Retrying in 1000ms...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        return await fn();
      } catch (secondError) {
        console.error(`[AIClient] ${provider} attempt 2 failed.`);
        throw secondError;
      }
    }
  }
}

export const aiClient = new AIClient();

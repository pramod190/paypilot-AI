import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { config } from '../../config.js';

/** JSON-schema subset used to describe tool parameters. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, any>;
}

export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCallRequest[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface LLMResponse {
  text: string;
  toolCalls: ToolCallRequest[];
}

/** Provider-agnostic chat model with tool calling. Adapters below; tests inject a scripted implementation. */
export interface LLMClient {
  readonly name: string;
  complete(req: { system: string; messages: AgentMessage[]; tools: ToolSpec[] }): Promise<LLMResponse>;
}

/* ------------------------------ OpenAI adapter ------------------------------ */

export class OpenAIClient implements LLMClient {
  readonly name = 'openai';
  private client: OpenAI;
  constructor(apiKey: string, private model = process.env.OPENAI_MODEL || 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 1 });
  }

  async complete({ system, messages, tools }: { system: string; messages: AgentMessage[]; tools: ToolSpec[] }): Promise<LLMResponse> {
    const mapped: any[] = [{ role: 'system', content: system }];
    for (const m of messages) {
      if (m.role === 'user') mapped.push({ role: 'user', content: m.content });
      else if (m.role === 'assistant') {
        mapped.push({
          role: 'assistant',
          content: m.content || null,
          ...(m.toolCalls?.length
            ? { tool_calls: m.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) }
            : {}),
        });
      } else mapped.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    }

    const res = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: mapped,
      tools: tools.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
    });

    const msg = res.choices[0]?.message;
    const toolCalls: ToolCallRequest[] = (msg?.tool_calls ?? [])
      .filter((c: any) => c.type === 'function')
      .map((c: any) => {
        let args: Record<string, any> = {};
        try { args = JSON.parse(c.function.arguments || '{}'); } catch { args = { __invalidJson: true }; }
        return { id: c.id, name: c.function.name, args };
      });
    return { text: msg?.content ?? '', toolCalls };
  }
}

/* ------------------------------ Gemini adapter ------------------------------ */

/** Gemini wants upper-case JSON-schema type names and rejects unknown keys. */
function toGeminiSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema && typeof schema === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === 'additionalProperties') continue;
      out[k] = k === 'type' && typeof v === 'string' ? v.toUpperCase() : toGeminiSchema(v);
    }
    return out;
  }
  return schema;
}

export class GeminiClient implements LLMClient {
  readonly name = 'gemini';
  private client: GoogleGenerativeAI;
  constructor(apiKey: string, private model = process.env.GEMINI_MODEL || 'gemini-2.5-flash') {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete({ system, messages, tools }: { system: string; messages: AgentMessage[]; tools: ToolSpec[] }): Promise<LLMResponse> {
    const contents: any[] = [];
    for (const m of messages) {
      if (m.role === 'user') contents.push({ role: 'user', parts: [{ text: m.content }] });
      else if (m.role === 'assistant') {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const c of m.toolCalls ?? []) parts.push({ functionCall: { name: c.name, args: c.args } });
        if (parts.length) contents.push({ role: 'model', parts });
      } else {
        let parsed: any;
        try { parsed = JSON.parse(m.content); } catch { parsed = { result: m.content }; }
        const part = { functionResponse: { name: m.name, response: { content: parsed } } };
        const last = contents[contents.length - 1];
        // Gemini expects all responses to one model turn together in a single user turn.
        if (last?.role === 'user' && last.parts.every((p: any) => p.functionResponse)) last.parts.push(part);
        else contents.push({ role: 'user', parts: [part] });
      }
    }

    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: system,
      tools: [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }] as any,
      generationConfig: { temperature: 0 },
    });

    const result = await model.generateContent({ contents } as any);
    const calls = (result.response.functionCalls?.() ?? []) as { name: string; args: Record<string, any> }[];
    let text = '';
    try { text = result.response.text(); } catch { text = ''; }
    return { text, toolCalls: calls.map((c, i) => ({ id: `call_${Date.now()}_${i}`, name: c.name, args: c.args ?? {} })) };
  }
}

/* ------------------------------ selection ------------------------------ */

let override: LLMClient | null | undefined;
/** Test hook: inject a scripted client (or null to force "no LLM"). Pass undefined to restore normal selection. */
export function __setLLMClientForTests(client: LLMClient | null | undefined) {
  override = client;
}

export function getLLMClient(): LLMClient | null {
  if (override !== undefined) return override;
  const provider = config.ai.provider;
  if (config.ai.geminiApiKey && provider !== 'openai') return new GeminiClient(config.ai.geminiApiKey);
  if (config.ai.openaiApiKey && provider !== 'gemini') return new OpenAIClient(config.ai.openaiApiKey);
  return null;
}

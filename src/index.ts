import OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';
import type { CreateEmbeddingResponse, EmbeddingCreateParams } from 'openai/resources/embeddings';

export const CABECALHO_REQUEST_ID = 'x-avalon-request-id';

export type Metadata = Record<string, unknown>;
export type ComRequestId = { requestId?: string };

export interface OpcoesAvalon {
  apiKey?: string;
  baseURL?: string;
  metadata?: Metadata;
}

/** Repassadas ao SDK openai; headers explícitos do chamador perdem para o
 * x-metadata calculado — metadata de primeira classe É a porta para esse
 * header. */
export interface OpcoesDeChamada {
  headers?: Record<string, string>;
}

export interface EntradaFeedback {
  requestId: string;
  valor: number;
  peso?: number;
}

export interface RecursoCompletions {
  create(
    params: ChatCompletionCreateParamsNonStreaming & { metadata?: Metadata },
    opcoes?: OpcoesDeChamada,
  ): Promise<ChatCompletion & ComRequestId>;
  create(
    params: ChatCompletionCreateParamsStreaming & { metadata?: Metadata },
    opcoes?: OpcoesDeChamada,
  ): Promise<AsyncIterable<ChatCompletionChunk> & ComRequestId>;
}

export interface RecursoEmbeddings {
  create(
    params: EmbeddingCreateParams & { metadata?: Metadata },
    opcoes?: OpcoesDeChamada,
  ): Promise<CreateEmbeddingResponse & ComRequestId>;
}

/** A raiz do gateway (a MESMA env AVALON_BASE_URL do tutorial /docs/conectar)
 * vira a base /v1 do SDK openai — sem duplicar quando já termina em /v1
 * (RN-SDK-02). Nenhuma URL default: o produto é auto-hospedado. */
export function raizParaV1(raiz: string): string {
  const semBarraFinal = raiz.replace(/\/+$/, '');
  return semBarraFinal.endsWith('/v1') ? semBarraFinal : `${semBarraFinal}/v1`;
}

/** Não-enumerável: serializar a resposta (JSON.stringify) continua
 * byte-compatível com o que o gateway devolveu (RN-SDK-04). */
function anexarRequestId<T extends object>(alvo: T, resposta: Response): T & ComRequestId {
  const id = resposta.headers.get(CABECALHO_REQUEST_ID);
  if (id !== null) {
    Object.defineProperty(alvo, 'requestId', { value: id, enumerable: false });
  }
  return alvo as T & ComRequestId;
}

export default class Avalon {
  readonly chat: { completions: RecursoCompletions };
  readonly embeddings: RecursoEmbeddings;
  readonly models: OpenAI['models'];
  readonly feedback: { create: (entrada: EntradaFeedback) => Promise<unknown> };

  readonly #cliente: OpenAI;
  readonly #metadataBase: Metadata;

  constructor(opcoes: OpcoesAvalon = {}) {
    const apiKey = opcoes.apiKey ?? process.env.AVALON_API_KEY;
    if (!apiKey) {
      throw new Error('apiKey ausente: passe { apiKey } no construtor ou defina a env AVALON_API_KEY.');
    }
    const raiz = opcoes.baseURL ?? process.env.AVALON_BASE_URL;
    if (!raiz) {
      throw new Error(
        'baseURL ausente: passe { baseURL } no construtor ou defina a env AVALON_BASE_URL (a raiz do gateway, sem /v1).',
      );
    }
    this.#cliente = new OpenAI({ apiKey, baseURL: raizParaV1(raiz) });
    this.#metadataBase = { ...(opcoes.metadata ?? {}) };

    this.chat = { completions: { create: this.#criarChat as RecursoCompletions['create'] } };
    this.embeddings = { create: this.#criarEmbeddings as RecursoEmbeddings['create'] };
    this.models = this.#cliente.models;
    this.feedback = { create: (entrada) => this.#criarFeedback(entrada) };
  }

  /** Merge por chave: o por-request vence o do construtor chave a chave;
   * objeto final vazio → header ausente (RN-SDK-03). */
  #headerMetadata(porRequest?: Metadata): Record<string, string> {
    const combinado = { ...this.#metadataBase, ...(porRequest ?? {}) };
    return Object.keys(combinado).length > 0 ? { 'x-metadata': JSON.stringify(combinado) } : {};
  }

  #opcoes(metadata: Metadata | undefined, opcoes: OpcoesDeChamada | undefined) {
    return { ...opcoes, headers: { ...opcoes?.headers, ...this.#headerMetadata(metadata) } };
  }

  #criarChat = async (
    params: ChatCompletionCreateParams & { metadata?: Metadata },
    opcoes?: OpcoesDeChamada,
  ): Promise<object & ComRequestId> => {
    const { metadata, ...corpo } = params;
    const { data, response } = await this.#cliente.chat.completions
      .create(corpo, this.#opcoes(metadata, opcoes))
      .withResponse();
    return anexarRequestId(data, response);
  };

  #criarEmbeddings = async (
    params: EmbeddingCreateParams & { metadata?: Metadata },
    opcoes?: OpcoesDeChamada,
  ): Promise<CreateEmbeddingResponse & ComRequestId> => {
    const { metadata, ...corpo } = params;
    const { data, response } = await this.#cliente.embeddings
      .create(corpo, this.#opcoes(metadata, opcoes))
      .withResponse();
    return anexarRequestId(data, response);
  };

  /** Espelho campo a campo de POST /v1/feedback — a validação é do gateway
   * (RN-SDK-05); 404/400 chegam crus como erro de API do SDK openai. */
  async #criarFeedback({ requestId, valor, peso }: EntradaFeedback): Promise<unknown> {
    const corpo: Record<string, unknown> = { request_id: requestId, valor };
    if (peso !== undefined) corpo.peso = peso;
    return this.#cliente.post('/feedback', { body: corpo });
  }
}

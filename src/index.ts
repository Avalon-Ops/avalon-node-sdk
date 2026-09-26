import OpenAI from 'openai';
import type { Stream } from 'openai/core/streaming';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';
import type { CreateEmbeddingResponse, EmbeddingCreateParams } from 'openai/resources/embeddings';

export const CABECALHO_REQUEST_ID = 'x-avalon-request-id';

/** O gateway do SaaS AvalonOps (emenda RN-SDK-02, 24/09): é a base quando
 * nem o construtor nem a env AVALON_BASE_URL apontam para outro lugar —
 * o mesmo desenho do api.portkey.ai embutido no SDK da Portkey. */
export const URL_PADRAO_SAAS = 'https://api.avalonops.com.br';

export type Metadata = Record<string, string>;
export type ComRequestId = { requestId?: string };

export interface OpcoesAvalon {
  apiKey?: string;
  baseURL?: string;
  metadata?: Metadata;
  /** DO NOT TRACK do gateway (RN-NT-07/08): `false` faz TODA chamada deste
   * cliente levar `x-avalon-debug: 'false'` — o log da requisição grava as
   * métricas e o `_user`, mas omite corpo/resposta. `true` ou ausente
   * (default) não envia o header nenhum. */
  debug?: boolean;
}

/** Repassadas ao SDK openai; headers explícitos do chamador perdem para o
 * x-metadata calculado — metadata de primeira classe É a porta para esse
 * header. Alias das opções REAIS do SDK: `openai/internal/request-options`
 * não é um caminho exportado no package.json da versão instalada (medido —
 * `ls node_modules/openai/internal/` existe no disco mas fora do mapa
 * `exports`), então usamos o tipo do segundo parâmetro do próprio método. */
export type OpcoesDeChamada = Parameters<OpenAI['chat']['completions']['create']>[1];

export interface EntradaFeedback {
  requestId: string | undefined;
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
  ): Promise<Stream<ChatCompletionChunk> & ComRequestId>;
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

export class Avalon {
  readonly chat: { completions: RecursoCompletions };
  readonly embeddings: RecursoEmbeddings;
  readonly models: OpenAI['models'];
  readonly feedback: { create: (entrada: EntradaFeedback) => Promise<unknown> };
  /** A base resolvida (construtor → env → default do SaaS), já com /v1. */
  readonly baseURL: string;

  readonly #cliente: OpenAI;
  readonly #metadataBase: Metadata;

  constructor(opcoes: OpcoesAvalon = {}) {
    const apiKey = opcoes.apiKey ?? process.env.AVALON_API_KEY;
    if (!apiKey) {
      throw new Error('apiKey ausente: passe { apiKey } no construtor ou defina a env AVALON_API_KEY.');
    }
    const raiz = opcoes.baseURL ?? process.env.AVALON_BASE_URL ?? URL_PADRAO_SAAS;
    this.baseURL = raizParaV1(raiz);
    this.#cliente = new OpenAI({
      apiKey,
      baseURL: this.baseURL,
      // defaultHeaders vai em TODA chamada do cliente openai — inclusive
      // models.list() e o POST /feedback, que não passam por #opcoes().
      defaultHeaders: { ...(opcoes.debug === false ? { 'x-avalon-debug': 'false' } : {}) },
    });
    this.#metadataBase = { ...(opcoes.metadata ?? {}) };

    this.chat = { completions: { create: this.#criarChat as RecursoCompletions['create'] } };
    this.embeddings = { create: this.#criarEmbeddings as RecursoEmbeddings['create'] };
    this.models = this.#cliente.models;
    this.feedback = { create: (entrada) => this.#criarFeedback(entrada) };
  }

  /** Merge por chave: o por-request vence o do construtor chave a chave;
   * objeto final vazio → header ausente (RN-SDK-03). O undici recusa header
   * fora do Latin-1 (`Cannot convert argument to a ByteString`) para `€`,
   * CJK, emoji — escapamos para `\uXXXX` ASCII puro, byte a byte igual ao
   * `json.dumps(..., ensure_ascii=True)` do SDK Python. */
  #headerMetadata(porRequest?: Metadata): Record<string, string> {
    const combinado = { ...this.#metadataBase, ...(porRequest ?? {}) };
    const json = JSON.stringify(combinado).replace(
      /[\u007f-￿]/g,
      (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'),
    );
    return Object.keys(combinado).length > 0 ? { 'x-metadata': json } : {};
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
    // POST /v1/feedback é INSERT sem idempotência no gateway — o retry
    // padrão do SDK openai gravaria feedback duas vezes.
    return this.#cliente.post('/feedback', { body: corpo, maxRetries: 0 });
  }
}

export default Avalon;

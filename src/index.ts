import OpenAI from 'openai';

export const CABECALHO_REQUEST_ID = 'x-avalon-request-id';

export type Metadata = Record<string, unknown>;

export interface OpcoesAvalon {
  apiKey?: string;
  baseURL?: string;
  metadata?: Metadata;
}

/** A raiz do gateway (a MESMA env AVALON_BASE_URL do tutorial /docs/conectar)
 * vira a base /v1 do SDK openai — sem duplicar quando já termina em /v1
 * (RN-SDK-02). Nenhuma URL default: o produto é auto-hospedado. */
export function raizParaV1(raiz: string): string {
  const semBarraFinal = raiz.replace(/\/+$/, '');
  return semBarraFinal.endsWith('/v1') ? semBarraFinal : `${semBarraFinal}/v1`;
}

export default class Avalon {
  // consumidos na Task 2
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
  }
}

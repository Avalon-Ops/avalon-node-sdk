/** Fake HTTP real do gateway (RN-SDK-06): porta efêmera, grava a última
 * requisição recebida, responde formas fixas. NUNCA mock do transporte.
 * As formas espelham o gateway real: erro = {erro:{codigo,mensagem}}
 * (setErrorHandler do núcleo); toda resposta carrega x-avalon-request-id. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const REQUEST_ID_DO_FAKE = '11111111-2222-4333-8444-555555555555';
export const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000404';
export const REQUEST_ID_ERRO_500 = '00000000-0000-4000-8000-000000000500';

/** Mensagem genérica para politicaDeForma (RN-FE-01/02/05): valor_invalido,
 * peso_invalido, metadata_invalida devem devolver isso ao cliente; o motivo
 * fica apenas no log do servidor. */
const MENSAGEM_GENERICA_POLICIA_DE_FORMA = 'A requisição não está no formato aceito pela sua organização.';

export type RequisicaoGravada = {
  metodo: string;
  rota: string;
  headers: Record<string, string | string[] | undefined>;
  corpo: Record<string, unknown> | null;
};

const CHAT_COMPLETION = {
  id: 'chatcmpl-fake', object: 'chat.completion', created: 1727180000, model: 'gpt-4',
  choices: [{ index: 0, message: { role: 'assistant', content: 'olá' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

const CHUNK = (conteudo: string) => ({
  id: 'chatcmpl-fake', object: 'chat.completion.chunk', created: 1727180000, model: 'gpt-4',
  choices: [{ index: 0, delta: { content: conteudo }, finish_reason: null }],
});

const EMBEDDINGS = {
  object: 'list',
  data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
  model: 'text-embedding-3-small', usage: { prompt_tokens: 1, total_tokens: 1 },
};

const MODELS = {
  object: 'list',
  data: [{ id: '@teste/gpt-4', object: 'model', created: 1727180000, owned_by: 'teste', rotulo: null, modelo: 'gpt-4', providerSlug: 'openai' }],
};

const erro = (codigo: string, mensagem: string) => ({ erro: { codigo, mensagem } });

function responder(res: ServerResponse, status: number, corpo: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'x-avalon-request-id': REQUEST_ID_DO_FAKE });
  res.end(JSON.stringify(corpo));
}

function responderStream(res: ServerResponse): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'x-avalon-request-id': REQUEST_ID_DO_FAKE });
  res.write(`data: ${JSON.stringify(CHUNK('o'))}\n\n`);
  res.write(`data: ${JSON.stringify(CHUNK('lá'))}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

async function lerCorpo(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const partes: Buffer[] = [];
  for await (const parte of req) partes.push(parte as Buffer);
  const texto = Buffer.concat(partes).toString('utf8');
  return texto === '' ? null : (JSON.parse(texto) as Record<string, unknown>);
}

export async function iniciarFakeGateway(): Promise<{
  url: string;
  ultima(): RequisicaoGravada;
  contagemFeedback(): number;
  fechar(): Promise<void>;
}> {
  let gravada: RequisicaoGravada | null = null;
  // RN-SDK-05/F5: conta só as chegadas do sentinela de retry — não polui
  // com os outros testes de feedback que rodam no mesmo fake compartilhado.
  let contagemFeedbackErro500 = 0;

  const servidor: Server = createServer((req, res) => {
    void (async () => {
      const corpo = await lerCorpo(req);
      gravada = { metodo: req.method ?? '', rota: req.url ?? '', headers: { ...req.headers }, corpo };

      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        const modelo = String(corpo?.model ?? '');
        if (modelo.startsWith('@nega/')) {
          return responder(res, 403, erro('modelo_nao_permitido', 'Você não tem permissão para esta ação.'));
        }
        if (corpo?.stream === true) return responderStream(res);
        return responder(res, 200, CHAT_COMPLETION);
      }
      if (req.method === 'POST' && req.url === '/v1/embeddings') return responder(res, 200, EMBEDDINGS);
      if (req.method === 'GET' && req.url === '/v1/models') return responder(res, 200, MODELS);
      if (req.method === 'POST' && req.url === '/v1/feedback') {
        const requestId = String(corpo?.request_id ?? '');
        const valor = corpo?.valor;
        if (requestId === REQUEST_ID_ERRO_500) {
          contagemFeedbackErro500 += 1;
          return responder(res, 500, erro('erro_interno', 'Falha interna simulada.'));
        }
        if (requestId === UUID_INEXISTENTE) {
          return responder(res, 404, erro('nao_encontrado', 'Recurso não encontrado.'));
        }
        // Literais copiados de governanca-plataforma/src/feedback/validacao.ts
        // (RN-FE-09) — fidelidade byte a byte com o gateway real, não só a
        // faixa: `valor` é INTEIRO, `peso` tem teto em 1 (não só piso em 0).
        // Fix I6 da revisão final ("Logs idênticos à Portkey"): o núcleo
        // passa `mensagemAoCliente` ESPECÍFICA para valor_invalido/
        // peso_invalido (a regra em si, não mais a genérica) — espelhado
        // aqui byte a byte; log_id_invalido/metadata_invalida continuam
        // genéricos.
        if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < -10 || valor > 10) {
          return responder(res, 400, erro('valor_invalido', 'valor deve ser um inteiro entre -10 e 10.'));
        }
        const pesoBruto = corpo?.peso;
        const peso = pesoBruto === undefined ? 1 : pesoBruto;
        if (typeof peso !== 'number' || !Number.isFinite(peso) || peso < 0 || peso > 1) {
          return responder(res, 400, erro('peso_invalido', 'peso deve ser um número entre 0 e 1.'));
        }
        // Fix M2 da revisão final: o núcleo valida `metadata` via
        // `validarMetadataDefault` (src/http/routes/completions.ts) nas
        // duas rotas de feedback — objeto de strings, até 128 caracteres por
        // valor, 400 metadata_invalida com a frase GENÉRICA (Fix I6 não
        // muda este código). O fake não validava nada; qualquer corpo
        // passava batido, escondendo o 400 que o gateway real daria.
        const metadataBruta = corpo?.metadata;
        let metadata: Record<string, string> | undefined;
        if (metadataBruta !== undefined) {
          if (typeof metadataBruta !== 'object' || metadataBruta === null || Array.isArray(metadataBruta)) {
            return responder(res, 400, erro('metadata_invalida', MENSAGEM_GENERICA_POLICIA_DE_FORMA));
          }
          metadata = {};
          for (const [k, v] of Object.entries(metadataBruta as Record<string, unknown>)) {
            if (typeof v !== 'string' || v.length > 128) {
              return responder(res, 400, erro('metadata_invalida', MENSAGEM_GENERICA_POLICIA_DE_FORMA));
            }
            metadata[k] = v;
          }
        }
        // N3(b) da re-revisão final do Bloco A: o núcleo real SEMPRE devolve
        // `metadata` na resposta 201 — objeto vazio quando o campo não veio
        // no corpo, nunca a chave ausente. O fake só ecoava quando
        // `metadata` estava definida; corrigido para sempre montar a chave
        // (vazia por padrão).
        return responder(res, 201, { id: 'fb-1', logId: requestId, valor, peso, metadata: metadata ?? {} });
      }
      return responder(res, 404, erro('rota_inexistente', 'Recurso não encontrado.'));
    })();
  });

  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const { port } = servidor.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    ultima: () => {
      if (!gravada) throw new Error('nenhuma requisição chegou ao fake');
      return gravada;
    },
    contagemFeedback: () => contagemFeedbackErro500,
    fechar: () => new Promise<void>((resolve, reject) => servidor.close((e) => (e ? reject(e) : resolve()))),
  };
}

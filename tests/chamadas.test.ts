import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Avalon from '../src/index.js';
import { iniciarFakeGateway, REQUEST_ID_DO_FAKE } from './fake-gateway.js';

let fake: Awaited<ReturnType<typeof iniciarFakeGateway>>;

beforeAll(async () => {
  fake = await iniciarFakeGateway();
});
afterAll(async () => {
  await fake.fechar();
});

const novo = (metadata?: Record<string, unknown>) =>
  new Avalon({ apiKey: 'gov_teste', baseURL: fake.url, metadata });

const MENSAGENS = [{ role: 'user' as const, content: 'oi' }];

describe('RN-SDK-03 · metadata de primeira classe', () => {
  it('metadata do construtor vira x-metadata em toda chamada', async () => {
    await novo({ _user: 'fabio' }).chat.completions.create({ model: '@teste/gpt-4', messages: MENSAGENS });
    expect(fake.ultima().headers['x-metadata']).toBe(JSON.stringify({ _user: 'fabio' }));
  });

  it('merge por chave: o por-request vence, o resto do construtor sobrevive — e o corpo vai SEM o campo metadata', async () => {
    await novo({ _user: 'fabio', time: 'plataforma' }).chat.completions.create({
      model: '@teste/gpt-4', messages: MENSAGENS, metadata: { _user: 'lorena' },
    });
    const ultima = fake.ultima();
    expect(JSON.parse(String(ultima.headers['x-metadata']))).toEqual({ _user: 'lorena', time: 'plataforma' });
    expect(ultima.corpo).not.toHaveProperty('metadata');
    expect(ultima.corpo?.model).toBe('@teste/gpt-4');
  });

  it('sem metadata nenhum, o header não é enviado', async () => {
    await novo().chat.completions.create({ model: '@teste/gpt-4', messages: MENSAGENS });
    expect(fake.ultima().headers['x-metadata']).toBeUndefined();
  });

  it('a chave da requisição vai como Bearer', async () => {
    await novo().chat.completions.create({ model: '@teste/gpt-4', messages: MENSAGENS });
    expect(fake.ultima().headers.authorization).toBe('Bearer gov_teste');
  });
});

describe('RN-SDK-04 · requestId capturado', () => {
  it('resposta não-stream expõe requestId — fora do JSON (não-enumerável)', async () => {
    const resposta = await novo().chat.completions.create({ model: '@teste/gpt-4', messages: MENSAGENS });
    expect(resposta.requestId).toBe(REQUEST_ID_DO_FAKE);
    expect(resposta.choices[0]?.message.content).toBe('olá');
    expect(JSON.stringify(resposta)).not.toContain(REQUEST_ID_DO_FAKE);
  });

  it('stream: os chunks fluem E o stream expõe requestId', async () => {
    const stream = await novo().chat.completions.create({ model: '@teste/gpt-4', messages: MENSAGENS, stream: true });
    let texto = '';
    for await (const chunk of stream) texto += chunk.choices[0]?.delta?.content ?? '';
    expect(texto).toBe('olá');
    expect(stream.requestId).toBe(REQUEST_ID_DO_FAKE);
  });

  it('embeddings: metadata e requestId funcionam igual', async () => {
    const resposta = await novo({ _user: 'fabio' }).embeddings.create({
      model: 'text-embedding-3-small', input: 'oi',
    });
    expect(resposta.requestId).toBe(REQUEST_ID_DO_FAKE);
    expect(fake.ultima().rota).toBe('/v1/embeddings');
    expect(fake.ultima().headers['x-metadata']).toBe(JSON.stringify({ _user: 'fabio' }));
  });
});

describe('RN-SDK-01 · composição sem tradução', () => {
  it('models.list() é o do SDK openai contra o gateway — ids @slug/modelo sem tradução', async () => {
    const modelos = await novo().models.list();
    const ids = [];
    for await (const m of modelos) ids.push(m.id);
    expect(ids).toEqual(['@teste/gpt-4']);
  });

  it('403 do gateway chega CRU como erro de API do SDK openai, com o código visível', async () => {
    const capturado = await novo()
      .chat.completions.create({ model: '@nega/gpt-4', messages: MENSAGENS })
      .then(() => null, (e: unknown) => e);
    expect(capturado).not.toBeNull();
    const erroApi = capturado as { status?: number; error?: unknown; message?: string };
    expect(erroApi.status).toBe(403);
    // O corpo {erro:{codigo}} não segue a forma OpenAI — o SDK openai o
    // preserva no campo error e/ou na mensagem; basta que UMA superfície
    // carregue o código intacto.
    expect(JSON.stringify({ error: erroApi.error, message: erroApi.message })).toContain('modelo_nao_permitido');
  });
});

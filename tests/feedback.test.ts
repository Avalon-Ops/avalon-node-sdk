import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Avalon from '../src/index.js';
import { iniciarFakeGateway, REQUEST_ID_DO_FAKE, REQUEST_ID_ERRO_500, UUID_INEXISTENTE } from './fake-gateway.js';

let fake: Awaited<ReturnType<typeof iniciarFakeGateway>>;
beforeAll(async () => {
  fake = await iniciarFakeGateway();
});
afterAll(async () => {
  await fake.fechar();
});

const novo = () => new Avalon({ apiKey: 'gov_teste', baseURL: fake.url });

describe('RN-SDK-05 · feedback espelha a rota campo a campo', () => {
  it('envia POST /v1/feedback autenticado com request_id e valor — sem peso quando omitido — e devolve o corpo do 201', async () => {
    const criado = await novo().feedback.create({ requestId: REQUEST_ID_DO_FAKE, valor: 1 });
    const ultima = fake.ultima();
    expect(ultima.metodo).toBe('POST');
    expect(ultima.rota).toBe('/v1/feedback');
    expect(ultima.headers.authorization).toBe('Bearer gov_teste');
    expect(ultima.corpo).toEqual({ request_id: REQUEST_ID_DO_FAKE, valor: 1 });
    expect((criado as { logId: string }).logId).toBe(REQUEST_ID_DO_FAKE);
  });

  it('peso presente entra no corpo', async () => {
    await novo().feedback.create({ requestId: REQUEST_ID_DO_FAKE, valor: -1, peso: 0.5 });
    expect(fake.ultima().corpo).toEqual({ request_id: REQUEST_ID_DO_FAKE, valor: -1, peso: 0.5 });
  });

  it('404 do gateway chega cru', async () => {
    const capturado = await novo()
      .feedback.create({ requestId: UUID_INEXISTENTE, valor: 1 })
      .then(() => null, (e: unknown) => e);
    expect((capturado as { status?: number }).status).toBe(404);
  });

  it('valor fora da faixa NÃO é validado no cliente: a requisição SAI e o 400 do gateway chega cru', async () => {
    const capturado = await novo()
      .feedback.create({ requestId: REQUEST_ID_DO_FAKE, valor: 20 })
      .then(() => null, (e: unknown) => e);
    expect((capturado as { status?: number }).status).toBe(400);
    // A prova de que o SDK não validou: o fake RECEBEU valor 20.
    expect(fake.ultima().corpo?.valor).toBe(20);
  });

  it('valor não-inteiro NÃO é validado no cliente: fake recusa com 400 valor_invalido (fidelidade a validacao.ts)', async () => {
    const capturado = await novo()
      .feedback.create({ requestId: REQUEST_ID_DO_FAKE, valor: 0.5 })
      .then(() => null, (e: unknown) => e);
    const erroApi = capturado as { status?: number; error?: unknown; message?: string };
    expect(erroApi.status).toBe(400);
    expect(JSON.stringify({ error: erroApi.error, message: erroApi.message })).toContain('valor_invalido');
  });

  it('valor não-inteiro (0.5): mensagem genérica ao cliente como no núcleo (politicaDeForma)', async () => {
    const capturado = await novo()
      .feedback.create({ requestId: REQUEST_ID_DO_FAKE, valor: 0.5 })
      .then(() => null, (e: unknown) => e);
    const erroApi = capturado as { status?: number; error?: { erro: { codigo: string; mensagem: string } } };
    expect(erroApi.status).toBe(400);
    expect(erroApi.error?.erro.codigo).toBe('valor_invalido');
    expect(erroApi.error?.erro.mensagem).toBe('A requisição não está no formato aceito pela sua organização.');
  });

  it('peso fora de 0..1 NÃO é validado no cliente: fake recusa com 400 peso_invalido', async () => {
    const capturado = await novo()
      .feedback.create({ requestId: REQUEST_ID_DO_FAKE, valor: 1, peso: 1.5 })
      .then(() => null, (e: unknown) => e);
    const erroApi = capturado as { status?: number; error?: unknown; message?: string };
    expect(erroApi.status).toBe(400);
    expect(JSON.stringify({ error: erroApi.error, message: erroApi.message })).toContain('peso_invalido');
  });

  it('peso 0 é aceito — soma de pesos zero é "sem amostra", não erro (validacao.ts)', async () => {
    const criado = await novo().feedback.create({ requestId: REQUEST_ID_DO_FAKE, valor: 1, peso: 0 });
    expect(fake.ultima().corpo).toEqual({ request_id: REQUEST_ID_DO_FAKE, valor: 1, peso: 0 });
    expect((criado as { peso: number }).peso).toBe(0);
  });

  it('F5: retry desligado no feedback — o 500 chega cru e o fake recebe EXATAMENTE 1 requisição', async () => {
    const capturado = await novo()
      .feedback.create({ requestId: REQUEST_ID_ERRO_500, valor: 1 })
      .then(() => null, (e: unknown) => e);
    expect((capturado as { status?: number }).status).toBe(500);
    expect(fake.contagemFeedback()).toBe(1);
  });
});

describe('RN-FE-09 · metadata opcional no feedback', () => {
  it('metadata presente entra no corpo, campo a campo', async () => {
    await novo().feedback.create({ requestId: REQUEST_ID_DO_FAKE, valor: 4, metadata: { _user: 'ana' } });
    expect(fake.ultima().corpo).toEqual({ request_id: REQUEST_ID_DO_FAKE, valor: 4, metadata: { _user: 'ana' } });
  });

  it('sem metadata, o campo não vai no corpo', async () => {
    await novo().feedback.create({ requestId: REQUEST_ID_DO_FAKE, valor: 4 });
    expect(fake.ultima().corpo).not.toHaveProperty('metadata');
  });
});

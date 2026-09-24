import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Avalon from '../src/index.js';
import { iniciarFakeGateway, REQUEST_ID_DO_FAKE, UUID_INEXISTENTE } from './fake-gateway.js';

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
    await novo().feedback.create({ requestId: REQUEST_ID_DO_FAKE, valor: -0.5, peso: 2 });
    expect(fake.ultima().corpo).toEqual({ request_id: REQUEST_ID_DO_FAKE, valor: -0.5, peso: 2 });
  });

  it('404 do gateway chega cru', async () => {
    const capturado = await novo()
      .feedback.create({ requestId: UUID_INEXISTENTE, valor: 1 })
      .then(() => null, (e: unknown) => e);
    expect((capturado as { status?: number }).status).toBe(404);
  });

  it('valor fora da faixa NÃO é validado no cliente: a requisição SAI e o 400 do gateway chega cru', async () => {
    const capturado = await novo()
      .feedback.create({ requestId: REQUEST_ID_DO_FAKE, valor: 2 })
      .then(() => null, (e: unknown) => e);
    expect((capturado as { status?: number }).status).toBe(400);
    // A prova de que o SDK não validou: o fake RECEBEU valor 2.
    expect(fake.ultima().corpo?.valor).toBe(2);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { iniciarFakeGateway } from './fake-gateway.js';

// Import dinâmico DEPOIS de mexer nas envs — o módulo não pode ler env no load.
async function carregar() {
  return (await import('../src/index.js')).default;
}

const ENVS = ['AVALON_API_KEY', 'AVALON_BASE_URL'] as const;
const originais = Object.fromEntries(ENVS.map((e) => [e, process.env[e]]));

afterEach(() => {
  for (const e of ENVS) {
    if (originais[e] === undefined) delete process.env[e];
    else process.env[e] = originais[e];
  }
});

describe('RN-SDK-02 · configuração', () => {
  it('sem apiKey em lugar nenhum, o construtor falha nomeando AVALON_API_KEY', async () => {
    const Avalon = await carregar();
    delete process.env.AVALON_API_KEY;
    delete process.env.AVALON_BASE_URL;
    expect(() => new Avalon()).toThrowError(/AVALON_API_KEY/);
  });

  it('SaaS: sem baseURL em lugar nenhum, o default embutido resolve — exposto na propriedade pública (emenda RN-SDK-02)', async () => {
    const Avalon = await carregar();
    delete process.env.AVALON_BASE_URL;
    const cliente = new Avalon({ apiKey: 'gov_x' });
    expect(cliente.baseURL).toBe('https://api.avalonops.com.br/v1');
  });

  it('as envs bastam: construtor vazio constrói', async () => {
    const Avalon = await carregar();
    process.env.AVALON_API_KEY = 'gov_env';
    process.env.AVALON_BASE_URL = 'http://127.0.0.1:9';
    expect(() => new Avalon()).not.toThrow();
  });

  describe('ordem de resolução da base, por chamada real', () => {
    let fake: Awaited<ReturnType<typeof iniciarFakeGateway>>;
    beforeAll(async () => {
      fake = await iniciarFakeGateway();
    });
    afterAll(async () => {
      await fake.fechar();
    });

    it('env vence o default: só a env aponta pro fake e a chamada completa', async () => {
      const Avalon = await carregar();
      process.env.AVALON_API_KEY = 'gov_env';
      process.env.AVALON_BASE_URL = fake.url;
      const cliente = new Avalon();
      const resposta = await cliente.chat.completions.create({
        model: '@teste/gpt-4',
        messages: [{ role: 'user', content: 'oi' }],
      });
      expect(resposta.choices[0]?.message.content).toBe('olá');
      expect(cliente.baseURL).toBe(`${fake.url}/v1`);
    });

    it('F8 · construtor vence env: envs INVÁLIDAS não atrapalham, o construtor aponta pro fake e a chamada completa', async () => {
      const Avalon = await carregar();
      process.env.AVALON_API_KEY = 'gov_env_invalida';
      process.env.AVALON_BASE_URL = 'http://127.0.0.1:9';
      const cliente = new Avalon({ apiKey: 'gov_teste', baseURL: fake.url });
      const resposta = await cliente.chat.completions.create({
        model: '@teste/gpt-4',
        messages: [{ role: 'user', content: 'oi' }],
      });
      expect(resposta.choices[0]?.message.content).toBe('olá');
    });
  });

  it('raizParaV1: anexa /v1 à raiz, não duplica quando já termina em /v1, tolera barra final', async () => {
    const { raizParaV1 } = await import('../src/index.js');
    expect(raizParaV1('https://gw.acme.br')).toBe('https://gw.acme.br/v1');
    expect(raizParaV1('https://gw.acme.br/')).toBe('https://gw.acme.br/v1');
    expect(raizParaV1('https://gw.acme.br/v1')).toBe('https://gw.acme.br/v1');
  });
});

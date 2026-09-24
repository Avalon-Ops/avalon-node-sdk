import { afterEach, describe, expect, it } from 'vitest';

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

  it('com apiKey mas sem baseURL, falha nomeando AVALON_BASE_URL — e a mensagem ensina que a base é a raiz, sem /v1', async () => {
    const Avalon = await carregar();
    delete process.env.AVALON_BASE_URL;
    expect(() => new Avalon({ apiKey: 'gov_x' })).toThrowError(/AVALON_BASE_URL.*sem \/v1/);
  });

  it('as envs bastam: construtor vazio constrói', async () => {
    const Avalon = await carregar();
    process.env.AVALON_API_KEY = 'gov_env';
    process.env.AVALON_BASE_URL = 'http://127.0.0.1:9';
    expect(() => new Avalon()).not.toThrow();
  });

  it('raizParaV1: anexa /v1 à raiz, não duplica quando já termina em /v1, tolera barra final', async () => {
    const { raizParaV1 } = await import('../src/index.js');
    expect(raizParaV1('https://gw.acme.br')).toBe('https://gw.acme.br/v1');
    expect(raizParaV1('https://gw.acme.br/')).toBe('https://gw.acme.br/v1');
    expect(raizParaV1('https://gw.acme.br/v1')).toBe('https://gw.acme.br/v1');
  });
});

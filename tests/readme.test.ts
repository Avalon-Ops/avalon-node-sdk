/** RN-SDK-06: o bloco do README roda DE VERDADE contra o fake — só uma
 * linha de console.log ACRESCIDA (nunca editada), molde do console
 * (docs-publicas.test.tsx). Auto-referência: `import ... from 'avalonops'`
 * resolve pelo próprio package.json → dist/ (por isso `npm test` builda). */
import { execFile } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { iniciarFakeGateway, REQUEST_ID_DO_FAKE } from './fake-gateway.js';

const executar = promisify(execFile);

let fake: Awaited<ReturnType<typeof iniciarFakeGateway>>;
beforeAll(async () => {
  fake = await iniciarFakeGateway();
});
afterAll(async () => {
  await fake.fechar();
});

/** Os blocos ts do README formam um script progressivo (o mesmo `client` e
 * a mesma `resposta` atravessam as seções, como no molde didático da
 * Portkey) — concatenados na ordem, TODOS rodam; nenhum é editado. */
function blocosTs(readme: string): string {
  const blocos = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]);
  expect(blocos.length, 'o README precisa ter blocos ```ts').toBeGreaterThanOrEqual(2);
  return blocos.join('\n');
}

describe('RN-SDK-06 · README executado', () => {
  it('os blocos ts de Uso rodam ponta a ponta contra o fake, concatenados na ordem', async () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const bloco = blocosTs(readme);
    const script = `${bloco}\nconsole.log(JSON.stringify({ requestId: resposta.requestId, total: modelos.data.length }));`;
    const { stdout } = await executar('node', ['--input-type=module', '-e', script], {
      env: { ...process.env, AVALON_BASE_URL: fake.url, AVALON_API_KEY: 'gov_readme' },
    });
    const linhas = stdout.trim().split('\n');
    const resultado = JSON.parse(linhas[linhas.length - 1] ?? '{}') as { requestId?: string; total?: number };
    expect(resultado.requestId).toBe(REQUEST_ID_DO_FAKE);
    expect(resultado.total).toBe(1);
  });

  it('F3: os blocos ts de Uso compilam em modo strict (resposta.requestId é string | undefined)', async () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const caminhoTmp = join(process.cwd(), 'tests', '.bloco-readme.tmp.ts');
    writeFileSync(caminhoTmp, blocosTs(readme), 'utf8');
    try {
      await executar('npx', ['tsc', '--noEmit', '-p', 'tsconfig.readme.json'], { cwd: process.cwd() });
    } finally {
      rmSync(caminhoTmp, { force: true });
    }
  });
});

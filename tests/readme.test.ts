/** RN-SDK-06: o bloco do README roda DE VERDADE contra o fake — só uma
 * linha de console.log ACRESCIDA (nunca editada), molde do console
 * (docs-publicas.test.tsx). Auto-referência: `import ... from 'avalonops'`
 * resolve pelo próprio package.json → dist/ (por isso `npm test` builda). */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

describe('RN-SDK-06 · README executado', () => {
  it('o bloco ts de Uso roda ponta a ponta contra o fake', async () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const bloco = /```ts\n([\s\S]*?)```/.exec(readme)?.[1];
    expect(bloco, 'o README precisa ter um bloco ```ts').toBeTruthy();
    const script = `${bloco}\nconsole.log(JSON.stringify({ requestId: resposta.requestId, total: modelos.data.length }));`;
    const { stdout } = await executar('node', ['--input-type=module', '-e', script], {
      env: { ...process.env, AVALON_BASE_URL: fake.url, AVALON_API_KEY: 'gov_readme' },
    });
    const linhas = stdout.trim().split('\n');
    const resultado = JSON.parse(linhas[linhas.length - 1] ?? '{}') as { requestId?: string; total?: number };
    expect(resultado.requestId).toBe(REQUEST_ID_DO_FAKE);
    expect(resultado.total).toBe(1);
  });
});

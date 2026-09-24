/** RN-SDK-06: fumaça contra gateway REAL, só quando as envs existem — o CI
 * público nunca depende de segredo. models.list não gasta tokens. */
import { describe, expect, it } from 'vitest';
import Avalon from '../src/index.js';

const base = process.env.AVALON_E2E_BASE_URL;
const chave = process.env.AVALON_E2E_API_KEY;

describe.skipIf(!base || !chave)('E2E · gateway real', () => {
  it('models.list responde a lista do catálogo', async () => {
    const client = new Avalon({ apiKey: chave, baseURL: base });
    const pagina = await client.models.list();
    expect(pagina.data.length).toBeGreaterThanOrEqual(0);
  });
});

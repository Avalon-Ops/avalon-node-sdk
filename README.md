# avalonops

SDK oficial da [AvalonOps](https://github.com/Avalon-Ops) para Node — governança de IA com a ergonomia que você já conhece: um wrapper fino sobre o [SDK da OpenAI](https://github.com/openai/openai-node), com metadata de primeira classe, request-id capturado e feedback por requisição.

Ergonomia inspirada nos SDKs open source da Portkey; código próprio, MIT.

## Uso

### Pré-requisitos

1. Tenha o gateway AvalonOps da sua organização no ar e crie uma chave de API no console (menu **Chaves**).
2. Instale o SDK e exporte as duas variáveis de ambiente — a base é a **raiz** do gateway, sem `/v1` (o SDK completa):

```bash
npm install avalonops

export AVALON_API_KEY="SUA_CHAVE"
export AVALON_BASE_URL="https://gateway.suaempresa.com"
```

### Fazendo uma requisição

O gateway adere à assinatura do SDK da OpenAI — troque `import OpenAI from 'openai'` por `import Avalon from 'avalonops'` e o resto do seu código continua igual. O `model` usa o id `@slug/modelo` que o catálogo do console mostra.

```ts
import Avalon from 'avalonops';

const client = new Avalon({ metadata: { _user: 'seu-usuario' } });

const resposta = await client.chat.completions.create({
  model: '@teste/gpt-4',
  messages: [{ role: 'user', content: 'Explique governança de IA em uma frase.' }],
});
```

### Metadata de primeira classe

A convenção `_user` identifica quem chamou: alimenta o filtro de logs, os limites por usuário e o expurgo LGPD do gateway. O metadata do construtor vale para todas as chamadas; o por-request vence o do construtor, chave a chave. (`user` no corpo, padrão OpenAI, continua valendo — e vence o header, regra do gateway.)

```ts
await client.chat.completions.create({
  model: '@teste/gpt-4',
  messages: [{ role: 'user', content: 'oi' }],
  metadata: { _user: 'outro-usuario' },
});
```

### Feedback por requisição

Toda resposta carrega o `x-avalon-request-id`, exposto como `requestId` — avalie a requisição com ele (`valor` entre -1 e 1; `peso` opcional):

```ts
await client.feedback.create({ requestId: resposta.requestId, valor: 1 });
```

### O catálogo da sua organização

No formato OpenAI, com os ids `@slug/modelo` prontos para copiar:

```ts
const modelos = await client.models.list();
```

## Configuração

| Variável | Papel |
|---|---|
| `AVALON_API_KEY` | Chave da API (a mesma do console) |
| `AVALON_BASE_URL` | RAIZ do gateway da sua instalação, sem `/v1` — o SDK completa |

Ambas também podem vir no construtor (`apiKey`, `baseURL`), que vence a env.

Streaming, tipos e retries são os do SDK `openai` — inclusive `stream: true`, cujo objeto de stream também expõe `requestId`.

## Licença

MIT — [LICENSE](https://github.com/Avalon-Ops/avalon-node-sdk/blob/main/LICENSE). Documentação completa na sua instalação do console, em `/docs/conectar`.

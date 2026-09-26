# avalonops

SDK oficial da [AvalonOps](https://github.com/Avalon-Ops) para Node — governança de IA com a ergonomia que você já conhece: um wrapper fino sobre o [SDK da OpenAI](https://github.com/openai/openai-node), com metadata de primeira classe, request-id capturado e feedback por requisição.

Ergonomia inspirada nos SDKs open source da Portkey; código próprio, MIT.

## Uso

### Pré-requisitos

1. Tenha o gateway AvalonOps da sua organização no ar e crie uma chave de API no console (menu **Chaves**).
2. Instale o SDK e exporte a chave — o SDK já sabe onde o gateway mora (`api.avalonops.com.br`):

```bash
npm install avalonops

export AVALON_API_KEY="SUA_CHAVE"
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

A convenção `_user` identifica quem chamou: alimenta o filtro de logs, os limites por usuário e o expurgo LGPD do gateway. O metadata do construtor vale para todas as chamadas; o por-request vence o do construtor, chave a chave. (`user` no corpo, padrão OpenAI, continua valendo — mas o metadata explícito vence o `user` do corpo; os defaults da chave e do workspace vencem o cliente.) Crie a chave já com `_user` no console e toda ferramenta fica identificada, mesmo sem passar metadata explícito por chamada.

```ts
await client.chat.completions.create({
  model: '@teste/gpt-4',
  messages: [{ role: 'user', content: 'oi' }],
  metadata: { _user: 'outro-usuario' },
});
```

### Feedback por requisição

Toda resposta carrega o `x-avalon-request-id`, exposto como `requestId` — avalie a requisição com ele: `valor` é um inteiro de -10 a 10 (👍/👎 = 1/-1; as estrelas do console gravam 1 a 5); `peso` vai de 0 a 1, padrão 1; `metadata` é opcional (objeto de strings, até 128 caracteres por valor):

```ts
await client.feedback.create({ requestId: resposta.requestId, valor: 1 });

// 4 estrelas, com metadata
await client.feedback.create({
  requestId: resposta.requestId,
  valor: 4,
  metadata: { _user: 'ana' },
});
```

### O catálogo da sua organização

No formato OpenAI, com os ids `@slug/modelo` prontos para copiar:

```ts
const modelos = await client.models.list();
```

## Configuração

| Variável | Papel |
|---|---|
| `AVALON_API_KEY` | Chave da API (a mesma do console) — obrigatória |
| `AVALON_BASE_URL` | Opcional: outra instalação (dev/staging), como RAIZ sem `/v1` — o SDK completa. Sem ela, vale `https://api.avalonops.com.br` |
| `debug` | Só no construtor (não é env): `false` omite request/response do log do gateway — as métricas e o `_user` continuam registrados |

Ambas (`AVALON_API_KEY`/`AVALON_BASE_URL`) também podem vir no construtor (`apiKey`, `baseURL`), que vence a env; a base resolvida fica em `client.baseURL`.

Streaming, tipos e retries são os do SDK `openai` — inclusive `stream: true`, cujo objeto de stream também expõe `requestId`.

## Licença

MIT — [LICENSE](https://github.com/Avalon-Ops/avalon-node-sdk/blob/main/LICENSE). Documentação completa na sua instalação do console, em `/docs/conectar`.

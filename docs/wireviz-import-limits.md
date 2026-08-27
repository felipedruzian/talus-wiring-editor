# Importação WireViz: subconjunto suportado e limites

`src/app/av-schematic/wireviz-import/` é uma implementação **clean-room**
escrita para esta fatia — nenhum código, estrutura ou texto foi copiado ou
adaptado do `Garth-42/WireForm` (GPL-3.0) nem do projeto Python real
`wireviz`. Não é um parser compatível com o WireViz; ele aceita um
subconjunto estreito da forma YAML `connectors` / `cables` / `connections`
do WireViz, exatamente o suficiente para o fixture da issue #1. Ver
[`docs/license-matrix.md`](license-matrix.md) para o porquê de ter sido
escrito do zero em vez de extrair o importador do `WireForm`.

## Duas camadas

1. **`wireviz-yaml.ts`** — um parser de valor genérico, mínimo, de um
   subconjunto de YAML (mapeamentos, sequências, sequências de fluxo
   inline, escalares entre aspas/soltos, comentários). Não sabe nada sobre
   WireViz.
2. **`wireviz-model.ts`** — valida um valor já analisado contra o
   subconjunto WireViz abaixo e produz um `WireVizDocument` tipado.

## Subconjunto de YAML (`wireviz-yaml.ts`)

Suportado:

- Mapeamentos aninhados (`chave: valor`, `chave:` + bloco recuado)
- Sequências aninhadas (`- item`), incluindo as linhas de múltiplos traços
  compactados do WireViz (`- - NANO: [D9]`, ou seja, uma sequência de
  sequências em uma única linha)
- Sequências de fluxo inline (`[a, b, c]`)
- Escalares entre aspas simples e duplas; escalares soltos de
  palavra/inteiro/decimal; `true`/`false`/`null`/`~`
- Comentários `#` (fora de aspas) e linhas em branco
- Qualquer recuo consistente baseado em espaços (não fixo em 2
  espaços) **para blocos de mapeamento e sequência normais**. Há uma
  exceção pontual: quando um item de sequência abre um mapeamento inline
  na mesma linha do traço (`- NANO: [D9]`) e esse mapeamento continua em
  uma linha seguinte com uma segunda chave, o parser espera que essa linha
  de continuação tenha recuo de exatamente 2 espaços a mais que o traço
  — não o passo de recuo que o restante do documento usa (ver
  `parseMappingFromInline()` em `wireviz-yaml.ts`, que soma um `+ 2` fixo
  em vez de derivar o passo do próprio documento). O fixture desta issue
  não usa essa forma de continuação, então o caso não aparece na prática,
  mas um documento WireViz que combine recuo de 4 espaços com esse
  tipo de continuação de mapeamento inline **não** seria aceito.

Não suportado (rejeitado com `WireVizYamlError`, ou simplesmente não pode
ser expresso):

- Tabs no recuo
- Âncoras/aliases (`&foo`, `*foo`)
- Streams multi-documento (`---`)
- Escalares de bloco (`|`, `>`)
- Mapeamentos de fluxo (`{a: 1, b: 2}`)
- Um item de sequência cujo mapeamento continue além de um bloco extra de
  continuação recuada (itens inline com múltiplas chaves profundamente
  aninhados)

## Subconjunto de documento WireViz (`wireviz-model.ts`)

Suportado:

- `connectors.<nome>.pins`: uma lista simples de nomes de pino (strings)
- `connectors.<nome>.type`: texto livre, apenas informativo
- `cables.<nome>.colors`: uma lista simples de códigos de cor de 2 letras
  do WireViz, um por fio (indexado a partir de 1 — `colors[0]` é o fio 1)
- `connections`: uma lista de conjuntos de conexão, cada um com
  **exatamente** 3 entradas: uma referência de conector, uma referência de
  cabo, mais uma referência de conector (em qualquer ordem) — ou seja,
  exatamente uma net ponto a ponto por conjunto de conexão, usando
  exatamente um fio de um cabo

Rejeitado (lança `WireVizModelError`, nunca descartado ou adivinhado
silenciosamente):

- Um conjunto de conexão que não seja exatamente
  `[conector, cabo, conector]` — cobre as conexões de shield/junção do
  WireViz e qualquer referência a bundle
- Mais de um pino por referência de conector (net **multi-drop** — o mesmo
  net físico tocando 3+ pinos)
- Mais de um índice de fio por referência de cabo (referências
  multi-fio/bundle)
- Um nome de pino não declarado na lista `pins` daquele conector
- Um índice de fio fora do intervalo `1..colors.length` do seu cabo
- Qualquer entrada de `connectors`/`cables` sem seu campo de lista
  obrigatório

## Por que isso é mais estreito do que uma importação real precisaria ser

O fixture desta fatia
(`wireviz-import/fixtures/minimal-two-nets.fixture.ts`) foi escrito
deliberadamente simples: exatamente duas nets, cada uma um único fio entre
dois pinos nomeados em dois conectores, sem pino reaproveitado, sem
subtypes, sem bundles — o mínimo que o critério de aceite da issue #1
exige. Ele não tenta cobrir a forma completa de um projeto WireViz real.

Como referência do tamanho do salto entre este fixture mínimo e um projeto
WireViz real do ecossistema Talus, o repositório público
[`felipedruzian/talus-droid`](https://github.com/felipedruzian/talus-droid)
tem, em `hardware/wireviz/talus-power.yml`, um documento WireViz de verdade
com múltiplas ocorrências de `subtype` e de reuso de pino/porta — construções
que este parser rejeita deliberadamente (ver listas acima). Esta fatia
**não** rodou o parser desta issue nem o do `WireForm` contra esse arquivo
para produzir uma contagem exata de construções não suportadas; uma nota de
planejamento interna anterior a este documento citava "21 construções não
suportadas (6 usos de `subtype`, 15 casos de reuso de porta/multi-drop)", mas
essa contagem não foi reproduzida nesta revisão e deve ser tratada como
**não verificada** até alguém rodar a análise de fato. Estender este parser
para cobrir a forma completa de `talus-power.yml` (multi-drop, junções
explícitas, subtypes) é trabalho futuro, fora do critério de aceite da
issue #1.

## Net -> mapeamento de diagrama (`wireviz-to-diagram.ts`)

- Um `Edge<WireEdgeData>` por conjunto de conexão. `wireId` é o nome do
  cabo (`W1` -> `wireId: 'W1'`). O `id` da edge do ng-diagram e o `netId`
  são derivados do nome do cabo **e** do índice do fio (`W1` fio 1 ->
  `id: 'wire-W1-1'`, `netId: 'net-W1-1'`), então um cabo multicolor
  referenciado por várias conexões (uma por condutor) ainda recebe um id de
  edge e de net únicos por fio, em vez de colidir apenas pelo nome do cabo.
- Um pino é casado com uma porta do diagrama por igualdade exata (sensível
  a maiúsculas/minúsculas) da string `DevicePort.label`, no node em que o
  conector foi posicionado via o mapa `WireVizPlacement` fornecido pelo
  chamador. Sem correspondência aproximada, sem criação automática de
  portas.
- O código de cor do fio do cabo é resolvido por
  `wireviz-colors.ts::resolveWireColor()` — um subconjunto pequeno e
  mantido explicitamente da tabela de abreviações WireViz/DIN 47100, não a
  tabela completa. Um código não reconhecido ainda grava `colorCode`, mas
  deixa `color` (o valor CSS) `undefined`, então o fio cai de volta ao
  token de traço padrão em vez de renderizar silenciosamente a cor errada.
- Qualquer falha de posicionamento/busca (`WireVizImportError`) lança um
  erro em vez de pular a conexão, então um fixture quebrado nunca produz
  silenciosamente menos nets do que as declaradas.

## Fontes consultadas

- [`felipedruzian/talus-droid`](https://github.com/felipedruzian/talus-droid),
  arquivo `hardware/wireviz/talus-power.yml` — repositório público,
  existência do arquivo confirmada via
  `gh api repos/felipedruzian/talus-droid/contents/hardware/wireviz/talus-power.yml`
  em 2026-08-27. Usado apenas como referência de escala/complexidade; seu
  conteúdo não foi copiado neste repositório.
- Código-fonte de `src/app/av-schematic/wireviz-import/` desta fatia,
  incluindo `wireviz-yaml.spec.ts`, `wireviz-model.spec.ts` e
  `wireviz-to-diagram.spec.ts` — lido diretamente para confirmar o
  comportamento descrito acima, em vez de descrito de memória.

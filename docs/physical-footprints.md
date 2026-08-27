# Placas físicas e footprints

Esta implementação da issue #3 mantém placas, componentes e fios no mesmo
modelo e no mesmo canvas do `ng-diagram`. Não há uma segunda superfície de
desenho nem uma representação elétrica paralela.

## Modelo físico

`BoardNodeData` descreve qualquer placa retangular por `rows`, `cols`, `pitch`,
`holeDiameter` opcional, uma lista opcional de `holes` e uma lista opcional de
`traces`. Sem `holes`, a placa usa toda a grade retangular; com a lista, pode
representar recortes e posições sem furo. Cada trilha contém um ou mais
segmentos horizontais ou verticais, inclusivos, e pode declarar a net elétrica
correspondente. Nenhuma função presume 63 colunas.

A distinção entre ausência e lista vazia é deliberada: omitir `holes` significa
uma grade retangular completa, enquanto `holes: []` descreve uma placa sem
nenhum furo. Desenho, snap, placement, endpoints e validadores aplicam essa
mesma regra.

Cada furo vira uma porta `hole:<row>:<col>` do próprio nó da placa. Cada trilha
também expõe uma porta `trace:<traceId>`. Assim, um fio conectado a um furo ou
a uma trilha continua sendo uma aresta comum do `ng-diagram`; o endpoint fica
registrado na própria aresta e não depende de uma tabela lateral.

No `ng-diagram` 1.3.0, essas portas usam `originPoint="centerLeft"`. A posição
CSS indica o centro físico do furo ou pino, enquanto a medição da biblioteca
registra a caixa já transformada. O cálculo de endpoints usa a borda indicada
por `side` e o centro do outro eixo; por isso, desenho, área de interação,
roteador e nova ancoragem apontam para a mesma coordenada física.

## Footprints e encaixe

As definições em `diagram/model/footprint.ts` usam unidades de furo, não
pixels. Elas descrevem caixa, pinos e formas vetoriais originais. O tamanho em
pixels é derivado do pitch da placa no momento da renderização.

O catálogo desse arquivo serve para criar itens da paleta e para nós legados
que ainda vivem apenas em memória. Ao salvar um componente físico, sua
definição de footprint é incorporada ao próprio projeto. Um arquivo também
pode declarar uma definição inédita seguindo o mesmo esquema; portanto, a
reabertura não depende das fixtures nem exige que o footprint já exista no
catálogo da aplicação.

Um componente encaixado persiste `footprintId` e `placement`, formado por:

- `boardId`: placa na qual a peça está encaixada;
- `anchor`: furo que recebe o canto superior esquerdo da caixa já rotacionada;
- `rotation`: `0`, `90`, `180` ou `270` graus.

O template `FootprintNodeComponent` desenha a ilustração e posiciona as portas
elétricas sobre os pinos. Os botões no próprio componente giram a peça em
passos de 90 graus.

Ao terminar um arraste, `BoardPlacementService` calcula o furo mais próximo,
valida limites e ocupação e grava a posição derivada do encaixe. Uma posição
ilegal é recusada, o componente volta ao último encaixe válido e os furos em
conflito são destacados. Ao mover uma placa, seus componentes encaixados são
reposicionados a partir das âncoras, sem acumular erro de pixels.

Quando corpos de placas se sobrepõem, um placement existente permanece na sua
placa enquanto ela ainda contém o ponto. Para um componente novo, vence a menor
placa, seguida por `boardId` e pelo ID do nó como critérios estáveis. Assim, a
escolha não depende da ordem do array após uma reabertura.

O snap de cada placa e de seus componentes usa o `pitch` daquela placa, sem
presumir 20 pixels. A rotação mantém o primeiro pino sobre o mesmo furo e
calcula a nova âncora apenas com coordenadas inteiras da grade; quatro giros
retornam exatamente ao estado inicial, inclusive com pitch fracionário ou
diferente do valor das fixtures.

Depois do snap, da rotação ou do movimento da placa, as extremidades das
arestas são ancoradas novamente nos ports medidos. Rotas manuais ortogonais
preservam os trechos intermediários que continuam válidos. A mesma atualização
das âncoras ocorre depois da remontagem do modelo salvo, quando os novos nós e
ports já foram medidos.

A associação elétrica em runtime segue `pino -> furo -> trilha -> net`. Uma
nova aresta herda a net física conhecida; mover uma peça para outra trilha
atualiza essa associação, e sair de uma trilha remove a associação antiga
quando ela era derivada do cobre. Um movimento que ligaria duas nets físicas
incompatíveis é recusado. A reconexão manual de uma extremidade aplica a mesma
inferência e deixa o fio pendente se o novo port causaria um curto. A inspeção
lateral mostra também os endereços de
furos e os nomes de trilhas quando uma extremidade pertence a uma placa.

Os ports de um componente encaixado são derivados do footprint e da placement.
O editor genérico continua disponível para fabricante, modelo, categoria e
local, mas apresenta os pinos físicos como somente leitura e não pode trocar
seus IDs nem seus furos.

O formato `DXF` registra `BoardNode` e `FootprintNode` em layers próprias. Contorno,
furos, trilhas, pinos e formas do footprint são exportados com o pitch e a
rotação físicos; endpoints de fios nessas entidades permanecem exatamente no
centro medido. A pequena extensão visual usada por cartões genéricos não é
aplicada a endpoints de placa ou footprint.

## Persistência

O formato canônico permanece em v1. Projetos anteriores sem placements físicos
continuam aceitos, e a representação ganhou campos opcionais:

- placas preservam `holes`, `holeDiameter` e `traces`;
- componentes físicos preservam `footprintId`, a definição `footprint` e
  `placement`;
- endpoints de nets aceitam pinos de componentes, furos e trilhas.

Os nomes `componentId` e `pinId` do endpoint foram mantidos por compatibilidade
com o formato v1, embora `componentId` também possa identificar uma placa. O
validador do frontend e o validador do serviço local aplicam as mesmas regras:
footprint incorporado e coerente com o ID, placement em uma placa existente,
todos os cells dentro de furos realmente presentes, ausência de colisões e
pinos expostos existentes na definição. Durante o parse, furos dos pinos e
posição em pixels são recalculados a partir da placement. Nets ausentes são
inferidas do cobre, enquanto conflitos declarados ou físicos são rejeitados.

No modelo em runtime, o ID de um nó de placa deve ser igual ao seu `boardId`;
o exportador canônico recusa o snapshot se essa identidade tiver divergido. Um
corpus adversarial compartilhado é executado pelos validadores TypeScript e
Node para manter equivalentes as regras duplicadas até a unificação futura.

Esta fatia não introduz um formato canônico v2 paralelo. Depois da integração
da issue #2, a evolução versionada deve absorver `footprint`, `placement` e os
endpoints de placa no único migrador canônico, preservando estas regras de
validação e reconciliação como a fronteira de entrada.

## Fixtures

`diagram/fixtures/physical-boards.fixture.ts` inclui:

| Placa | Dimensão | Conteúdo demonstrado |
|---|---:|---|
| Placa A | 6 × 11 | seis trilhas de distribuição |
| Placa de origem | 6 × 28 | perfboard sem trilhas |
| Peça D | 6 × 3 | alimentação do driver de motor |
| Peça E | 6 × 3 | divisor de nível do UART e jumper |
| Peça F | 6 × 3 | alimentação do Raspberry Pi |
| Peça G | 6 × 4 | distribuição da base |

O seed também inclui resistores, capacitores e um TB6612FNG encaixados, além de
componentes externos ligados diretamente a furos ou trilhas.

As ilustrações foram desenhadas neste repositório com formas SVG simples. Não
foram incorporados assets nem trechos de código de catálogos externos.

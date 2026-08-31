# Placas físicas e footprints

Esta implementação da issue #3 mantém placas, componentes e fios no mesmo
modelo e no mesmo canvas do `ng-diagram`. Não há uma segunda superfície de
desenho nem uma representação elétrica paralela.

## Modelo físico

`BoardNodeData` descreve qualquer placa retangular por `rows`, `cols`, `pitch`,
`holeDiameter` opcional, `centerGap` opcional, `notes` opcionais, uma lista
opcional de `holes` e uma lista opcional de `traces`. Sem `holes`, a placa usa
toda a grade retangular; com a lista, pode representar recortes e posições sem
furo. Cada trilha contém um ou mais segmentos horizontais ou verticais,
inclusivos, e pode declarar a net elétrica correspondente. Nenhuma função
presume 63 colunas.

`centerGap` acrescenta uma faixa vertical entre as duas metades das linhas sem
alterar os endereços dos furos. Geometria, snap, footprints e `DXF` usam a mesma
posição física; placas sem o campo preservam o arredondamento legado, inclusive
o desempate para a linha de índice maior. A placa de ensaio superior usa o mesmo
`pitch` 20 das outras placas físicas do seed.

A distinção entre ausência e lista vazia é deliberada: omitir `holes` significa
uma grade retangular completa, enquanto `holes: []` descreve uma placa sem
nenhum furo. Desenho, snap, placement, endpoints e validadores aplicam essa
mesma regra.

Cada furo vira uma porta `hole:<row>:<col>` do próprio nó da placa. Cada trilha
também expõe uma porta `trace:<traceId>`. Assim, um fio conectado a um furo ou
a uma trilha continua sendo uma aresta comum do `ng-diagram`; o endpoint fica
registrado na própria aresta e não depende de uma tabela lateral.

No `ng-diagram` 1.3.0, essas portas usam `originPoint="centerLeft"`. A posição
CSS da caixa subtrai metade de sua altura do centro físico do furo ou pino.
Como a biblioteca ancora uma porta lateral na borda esquerda e no centro
vertical da caixa medida, `portFlowPosition` retorna exatamente a coordenada da
geometria. Um teste liga `holeLocalPoint` e a geometria rotacionada do footprint
à posição final do port para impedir regressões de meio diâmetro.

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

Arrastar um componente encaixado para fora de todas as placas o desencaixa: o
footprint incorporado permanece disponível, mas `placement`, `boardId` e os
furos derivados são removidos. O componente continua usando o renderer físico,
com seus pinos conectáveis, e preserva a última rotação e o último pitch em
`footprintRotation` e `footprintPitch`; seus fios, nomes de rede e trechos
manuais também são preservados. Ao voltar para uma placa compatível, ele usa
essa rotação para calcular o novo encaixe.

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

A associação física em runtime segue `pino -> furo -> trilha`. Uma nova aresta
sem nome autoral recebe o nome declarado pelo cobre como sugestão inicial. Um
nome importado ou editado pelo usuário nunca é substituído silenciosamente:
ele tem prioridade, e uma divergência em relação ao cobre aparece como aviso no
relatório **Diagnóstico físico**. Essa divergência continua salvável. Já uma
aresta que uniria dois cobres com nomes físicos distintos representa um curto e
é recusada; na reconexão, a extremidade permanece pendente no ponto tentado. A
inspeção lateral também mostra os endereços de furos e os nomes de trilhas.

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

O projeto usa o único formato canônico v2 introduzido pela issue #2. A seção
`electrical` continua contendo componentes, junções, cabos, nets multi-drop e
condutores; a seção `layout` contém placas, footprints, placements e geometria.
Não existe `CanonicalNet` v1 paralelo. Snapshots v1 anteriores continuam sendo
migrados pela fronteira de entrada existente.

Os campos físicos opcionais são:

- placas preservam `holes`, `holeDiameter`, `centerGap`, `notes` e `traces`;
- componentes físicos preservam `footprintId`, a definição `footprint` e
  `placement`; quando desencaixados, `footprintRotation` e `footprintPitch`
  mantêm a geometria visual sem fingir que ainda existe um encaixe;
- a junção de cobre usa `boardId` e `boardPort` no layout;
- um condutor oculto `binding:<componentId>/<pinId>` associa cada pino encaixado
  à junção canônica de seu furo ou de sua trilha.

Snapshots canônicos v2 salvos antes da introdução de `footprintRotation` e
`footprintPitch` não contêm a geometria anterior de um footprint desencaixado.
Na primeira abertura por uma versão nova, esses componentes usam uma única vez
a rotação `0` e o pitch de fallback `20`, podendo mudar de tamanho; depois do
primeiro encaixe, giro ou desencaixe, a geometria estabilizada elimina novos
redimensionamentos, inclusive nos salvamentos seguintes.

Os endpoints elétricos v2 permanecem apenas `pin` e `junction`. Furos de uma
mesma trilha apontam para uma única `CanonicalJunction`; o índice `fromTap` ou
`toTap` preserva o furo visual específico. Assim, salvar e reabrir conserva a
associação pino-furo-trilha sem inventar outro tipo elétrico e sem separar uma
net multi-drop.

O nome autoral da net tem prioridade determinística sobre o rótulo de cobre. O
cobre só nomeia grupos ainda sem autoria. O relatório físico registra a
divergência com caminho canônico e ação sugerida, mas ela não invalida todo o
projeto. Curto entre cobres distintos, referência inexistente e grafo de
binding incoerente continuam sendo erros estruturais.

Uma importação WireViz de substituição mantém os bindings físicos dos
componentes reaproveitados e reagrupa os condutores com o mesmo algoritmo. Se
duas redes importadas de nomes distintos passam a compartilhar o cobre já
montado, o menor nome em ordem lexical vence, e o relatório WireViz emite
`physical-net-reconciled` com os nomes envolvidos e a ação de revisão. Assim,
a reconciliação é determinística sem apagar a divergência silenciosamente.

O validador do frontend e o validador do serviço local aplicam as mesmas regras:
footprint incorporado e coerente com o ID, placement em placa existente, cells
em furos realmente presentes, ausência de colisões, pinos expostos presentes
na definição, trilhas ortogonais sem sobreposição e vínculos elétricos
determinísticos. Durante o parse, furos dos pinos e posição em pixels são
recalculados a partir de `placement`.

No modelo em runtime, o ID de um nó de placa deve ser igual ao seu `boardId`;
o exportador canônico recusa o snapshot se essa identidade tiver divergido. Um
corpus adversarial compartilhado é executado pelos validadores TypeScript e
Node para manter equivalentes as regras duplicadas até a unificação futura.

Para manter o canvas responsivo e limitar entradas não confiáveis, o formato
aceita no máximo 128 linhas, 256 colunas, 4.096 furos por placa, `pitch` 256,
`centerGap` 256, 512 trilhas, 4.096 segmentos por placa, footprints de 64 × 64
e 512 formas. Uma grade completa acima de 4.096 furos deve declarar uma lista
esparsa explícita. Quando presente, `centerGap` precisa ser positivo; zero deve
ser omitido.

## Autoria nesta fatia

O usuário pode mover, girar, encaixar e desencaixar footprints, editar os dados
usuais do componente e conectar pinos, furos ou trilhas. Definições arbitrárias
de placa e footprint são persistidas e validadas pelo JSON canônico e podem ser
fornecidas por fixtures ou integrações. Esta entrega não inclui um desenhador
gráfico geral para criar novos contornos, furos, trilhas e formas SVG do zero;
esse limite é de interface de autoria, não do modelo nem da persistência.

## Fixtures

`diagram/fixtures/physical-boards.fixture.ts` inclui:

| Placa | Dimensão | Conteúdo demonstrado |
|---|---:|---|
| Placa A | 6 × 11 | seis trilhas de distribuição |
| `Protoboard superior` | 6 × 18 | canal central e capacitores bulk já incorporados |
| Placa de origem | 6 × 28 | perfboard sem trilhas |
| Peça E | 6 × 3 | divisor de nível do UART e jumper |
| Peça G | 6 × 4 | distribuição da base |

As antigas peças D e F e seus capacitores não fazem mais parte do seed: os dois
bulk pertencem à placa de ensaio superior já montada. O seed preserva as peças E e
G, seus resistores, um TB6612FNG encaixado e componentes externos ligados
diretamente a furos ou trilhas.

Os dois jumpers de sinal saem dos furos documentados `L4-C18` e `L2-C18`. Como
a fonte não identifica os pinos de destino, cada jumper termina em uma junção
conectável de um tap, rotulada como terminal provisório junto ao Nano ou à
TB6612. Essas junções sobrevivem ao round-trip sem compartilhar os pinos `D8`
ou `STBY` e, portanto, sem fundir ou renomear as nets existentes.

As ilustrações foram desenhadas neste repositório com formas SVG simples. Não
foram incorporados assets nem trechos de código de catálogos externos.

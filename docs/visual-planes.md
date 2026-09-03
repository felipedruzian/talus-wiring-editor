# Planos visuais

O projeto canônico v3 persiste `visualPlane` em cada registro de `layout`: placas, componentes, junções e condutores. Valores maiores aparecem acima de valores menores. O inspetor permite consultar e alterar o número do elemento selecionado sem tocar em nets, endpoints ou conectividade.

Os defaults da migração são:

| Elemento           | Plano |
| ------------------ | ----: |
| Placa              |   `0` |
| Componente         |  `10` |
| Condutor ou jumper |  `20` |
| Junção             |  `30` |

Isso garante que fios ligados a furos e trilhas sejam desenhados acima do corpo da placa. Snapshots v1 e v2 recebem esses valores durante a leitura; novos snapshots v3 exigem um inteiro entre `-1000` e `1000`.

O plano persistido não é usado diretamente como índice CSS. Antes de renderizar, `visual-planes.ts` ordena todos os nós e arestas pelo par `(visualPlane, tipo, id)` e atribui um `zOrder` sequencial do ng-diagram. Assim, empates dentro de um plano são determinísticos e não dependem da ordem de inserção, seleção, arraste ou reabertura.

PNG e SVG capturam a árvore DOM já ordenada. O DXF mantém os layers semânticos `DEVICES` e `WIRES`; esses layers não são planos visuais e não mudam quando o usuário altera `visualPlane`.

# Matriz de licenças

Exigida pelo critério de aceite da issue #1 e mantida na extensão da issue #2: um
registro de origem, revisão avaliada, licença e estratégia de reuso para
cada base considerada para o `talus-wiring-editor`, além da confirmação de
que **nenhum código GPL nem asset CC BY-SA foi incorporado nesta fatia**.

As bases avaliadas aqui foram herdadas da decisão já registrada na issue
[`talus-core#339`](https://github.com/felipedruzian/talus-core/issues/339)
(issue pública — ver "Fontes consultadas" no final deste documento para como
cada licença e revisão abaixo foi conferida). Esta tabela registra o que
esta fatia especificamente fez com cada uma.

| Projeto | Origem | Revisão avaliada | Licença | Usado nesta fatia? | Estratégia / atribuição |
|---|---|---|---|---|---|
| `synergycodes/ng-diagram-av-schematic` | `github.com/synergycodes/ng-diagram-av-schematic` | `ad1899b` (atualização para `ng-diagram` 1.3.0) | MIT (app) | **Sim — fork base.** | Este repositório *é* o fork. O `LICENSE` original (MIT) foi mantido como está na raiz do repositório; nenhum aviso de atribuição foi removido. Todo o código novo desta fatia (node de placa, importação WireViz, formato canônico, serviço local) é original, escrito para esta tarefa. |
| `ng-diagram` (pacote npm) | [`synergycodes/ng-diagram`](https://github.com/synergycodes/ng-diagram) | `1.3.0` (resolução registrada em `package-lock.json`) | Apache-2.0 | **Sim — inalterado, consumido como dependência.** | Usado exatamente como o baseline já usava (canvas único, sem fork da própria biblioteca). A versão e a licença estão registradas no lockfile; a licença também foi conferida no [`LICENSE` do repositório oficial](https://github.com/synergycodes/ng-diagram/blob/main/LICENSE). Nenhum trecho do código-fonte do `ng-diagram` foi copiado para este repositório. Esta fatia não faz uma avaliação jurídica formal de que as obrigações de atribuição da Apache-2.0 estão cumpridas; a suficiência do uso normal como dependência npm permanece **não verificada** até uma revisão jurídica de fato. |
| `safaorhan/breadboard` | `github.com/safaorhan/breadboard` | `db5f279` | MIT | **Não — não reaproveitado nesta fatia.** | Licença e existência do commit confirmadas via `gh api repos/safaorhan/breadboard` em 2026-08-27. O conceito de grade de furos endereçáveis da placa (`BoardNodeData`, `board-geometry.ts`) foi **escrito do zero** para esta fatia: nenhum código foi copiado ou adaptado do `breadboard`. Reaproveita a *ideia* (grade de furos linhas x colunas endereçável em um espaçamento fixo), não nenhuma implementação. O reaproveitamento completo do código de espaçamento/footprint/análise de net (conforme definido na `talus-core#339`) continua sendo trabalho futuro, permitido sob MIT com atribuição quando acontecer. |
| `Garth-42/WireForm` | `github.com/Garth-42/WireForm` | `5658987` | **GPL-3.0** | **Não — não incorporado.** | Licença e existência do commit confirmadas via `gh api repos/Garth-42/WireForm` em 2026-08-27. A importação e exportação WireViz (`wireviz-import/*`) são implementações **clean-room**, agora cobrindo também o fixture multi-drop da issue #2, junções, relatório e equivalência elétrica. Nenhum código-fonte, teste, fixture ou asset do `WireForm` foi copiado ou adaptado. Por restrição explícita desta tarefa, **nenhum código GPL-3.0 está presente neste repositório nesta fatia.** |
| WireViz (o formato/ferramenta) | `github.com/wireviz/WireViz` | n/a — apenas a sintaxe pública de interoperabilidade foi consultada | GPL-3.0 (a ferramenta WireViz em si) | **Nenhum código usado — apenas compatibilidade de formato.** | Licença confirmada via `gh api repos/wireviz/WireViz` em 2026-08-27. Fixtures, parser e emissor foram escritos de forma independente; a documentação oficial de sintaxe orientou o comportamento interoperável, sem cópia ou transcrição do código Python. Esta descrição técnica não substitui análise jurídica. |
| `fritzing/fritzing-parts` | `github.com/fritzing/fritzing-parts` | `27535f2` | CC BY-SA 3.0 (assets/docs) | **Não — fora do escopo desta issue.** | Existência do commit confirmada via `gh api repos/fritzing/fritzing-parts` em 2026-08-27. A licença CC BY-SA 3.0 foi confirmada lendo o conteúdo de `LICENSE.txt` no repositório (a API de detecção de licença do GitHub reporta `NOASSERTION` para esse repositório, então o texto do arquivo foi conferido diretamente em vez de confiar apenas no campo `license` da API). Nenhuma peça, SVG ou documento foi importado. As ilustrações de Nano/TB6612FNG nesta fatia são CSS/SVG originais, construídas para este repositório (ver "Assets" abaixo), especificamente para evitar qualquer obrigação de atribuição/compartilhamento-pelas-mesmas-regras da CC BY-SA nesta etapa inicial. Reaproveitamento seletivo e individualmente atribuído continua possível depois, conforme `talus-core#339`, nunca importação em bloco. |
| `pallab-js/PiForge` | `github.com/pallab-js/PiForge` | `fba850a` | MIT | **Não.** | Licença confirmada via `gh api repos/pallab-js/PiForge` em 2026-08-27 (o registro anterior deste documento listava a licença como "n/a"; corrigido aqui). Não é um baseline; nenhum código foi considerado para esta fatia. |

## Assets

Nenhum asset de imagem, ícone ou footprint de terceiros foi adicionado
nesta fatia. A grade de furos da placa é desenhada como círculos SVG a
partir de geometria pura (`board-geometry.ts`); Nano e TB6612FNG são
renderizados através do card existente do `DeviceNodeComponent` (CSS + a
marcação de portas do próprio app) — nenhuma arte bitmap ou vetorial foi
importada. Se uma fatia futura adicionar arte realista de chip/placa,
ela precisa de sua própria entrada aqui (origem, licença, revisão) **antes**
de ser mesclada, assim como código.

## Licença consolidada do repositório

O `LICENSE` na raiz do repositório permanece **MIT**, igual ao fork base,
enquanto nenhum código GPL-3.0 for incorporado. Uma nota de planejamento
interna anterior a esta fatia (não publicada como comentário na issue
pública `talus-core#339`) registra que, no momento em que qualquer *código*
(não apenas compatibilidade de formato) do `WireForm` ou do `WireViz` for mesclado, a
licença consolidada passaria a GPL-3.0. Como essa nota não está publicada em
uma fonte pública verificável, essa consequência específica é tratada aqui
como **não verificada por fonte pública** — o fato relevante e verificável é
que essa mudança de licença **não aconteceu** nesta fatia (nenhum código
GPL-3.0 foi incorporado) e, se e quando acontecer, deve ser um passo
deliberado e documentado, nunca um efeito colateral incidental de um PR
futuro.

## Gate posterior do artefato de distribuição

A matriz acima cobre o código-fonte e as dependências declaradas, mas não é
evidência suficiente sobre o conteúdo final empacotado. Depois do build de
produção, o gate de release deve inspecionar o diretório `dist/`, registrar os
avisos/licenças de terceiros efetivamente incluídos e confirmar que nenhum
código ou asset GPL-3.0/CC BY-SA foi incorporado por engano. Esse passo exige
o artefato construído e, por restrição desta execução, não foi rodado nesta
worktree.

## Fontes consultadas

- [`felipedruzian/talus-wiring-editor`](https://github.com/felipedruzian/talus-wiring-editor)
  — confirmado como fork de `synergycodes/ng-diagram-av-schematic`, licença
  MIT, via `gh api repos/felipedruzian/talus-wiring-editor` em 2026-08-27.
- [`felipedruzian/talus-core#339`](https://github.com/felipedruzian/talus-core/issues/339)
  — issue pública que define a exigência da matriz de licenças; conferida
  via `gh api repos/felipedruzian/talus-core/issues/339` na mesma data. Sem
  comentários adicionais na issue (`gh api .../issues/339/comments`
  retornou vazio).
- `package.json` e `package-lock.json` deste repositório — confirmam a
  dependência e a resolução `ng-diagram@1.3.0`; o repositório oficial e seu
  arquivo `LICENSE` confirmam Apache-2.0.
- `gh api repos/<owner>/<repo>` e `gh api repos/<owner>/<repo>/commits/<sha>`
  para `safaorhan/breadboard`, `Garth-42/WireForm`, `wireviz/WireViz`,
  `fritzing/fritzing-parts` e `pallab-js/PiForge` — licença e existência do
  commit avaliado, todos em 2026-08-27.
- `gh api repos/fritzing/fritzing-parts/contents/LICENSE.txt` — conteúdo
  lido diretamente para confirmar CC BY-SA 3.0, já que a detecção
  automática de licença do GitHub para esse repositório retorna
  `NOASSERTION`.

# Triagem de dependências

Contexto: esta triagem foi feita sem `npm install`, `npm update`, `npm audit fix` ou deploy. A validação usou somente leitura do `package.json`, `package-lock.json`, `npm view` para metadados do registry e `npm audit --json` sobre o lockfile existente.

## Resultado

- Todas as dependências diretas declaradas em `package.json` resolvem no registry npm.
- Os peers principais estão coerentes para Angular 21: `@angular/compiler-cli@21.2.9` aceita TypeScript `>=5.9 <6.1`, `@angular/build@21.2.7` aceita TypeScript `>=5.9 <6.0` e `angular-eslint@21.4.0` aceita `eslint` 10.
- O lockfile está funcionalmente defasado em patches: ele fixa Angular `21.2.10`, `@angular/build`/`@angular/cli` `21.2.8`, `eslint` `10.4.0` e `vitest` `4.1.5`, embora as ranges atuais já permitam patches mais novos.
- `npm audit --json` reportou 31 vulnerabilidades no lockfile atual: 1 crítica, 22 altas, 5 moderadas e 3 baixas.

## Pontos de atenção

- As vulnerabilidades diretas de Angular afetam `@angular/common`, `@angular/core`, `@angular/forms`, `@angular/platform-browser` e `@angular/router` no intervalo `21.0.0-next.0 - 21.2.18`. As ranges atuais (`^21.2.9`) já permitem versões corrigidas (`21.2.19+`), mas `npm ci` continuará usando o lockfile antigo até ele ser atualizado.
- A maior parte dos achados restantes vem de transitivos de tooling (`@angular/build`, `@angular/cli`, `vitest`/`jsdom` e cadeia npm/tar/sigstore). Corrigir isso com segurança exige regenerar o lockfile em uma mudança dedicada.
- Não apliquei `overrides` manualmente porque isso também exige atualizar o lockfile para manter `npm ci` reproduzível, e uma edição manual ampla do lockfile seria mais arriscada que uma atualização controlada.

## Próximo passo recomendado

Abrir uma PR separada, somente de dependências, autorizando explicitamente `npm update` ou `npm audit fix --package-lock-only` em ambiente controlado. O alvo mínimo dessa PR deve ser atualizar os patches de Angular para `21.2.19+` e revisar os transitivos de build/teste que o audit ainda apontar depois da regeneração do lockfile.

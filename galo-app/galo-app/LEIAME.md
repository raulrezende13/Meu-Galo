# 🐓 Meus Jogos do Galo: como colocar no iPhone

O app tem 3 partes:

1. **App (PWA)**: os arquivos desta pasta. Ficam hospedados de graça na internet e você instala no iPhone pelo Safari.
2. **Planilha no Google Sheets**: continua sendo a fonte dos dados.
3. **Apps Script**: um pequeno código dentro da planilha que deixa o app ler os jogos e gravar jogos novos.

---

## Passo 1: Planilha no Google Sheets
Se a planilha ainda não está no Google Drive: abra drive.google.com → **Novo → Upload de arquivo** → envie `GALO.xlsx` → abra o arquivo com o Google Planilhas. Se aparecer, use **Arquivo → Salvar como Planilhas Google**.

## Passo 2: Apps Script (a ponte entre app e planilha)
1. Na planilha: **Extensões → Apps Script**.
2. Apague o conteúdo e cole todo o arquivo [`apps-script/Codigo.gs`](apps-script/Codigo.gs).
3. Na linha `const SENHA = 'troque-esta-senha';`, coloque uma senha sua.
4. Salve (💾).
5. **Corrija as datas (só uma vez).** Use um dos dois jeitos:
   - **Pela planilha (mais fácil):** volte à aba da planilha e **recarregue a página** (F5). Na barra de menus, depois de "Ajuda", aparece **🐓 Galo**. Clique em **🐓 Galo → Corrigir datas (rodar 1 vez)**.
   - **Pelo editor do Apps Script:** na barra logo acima do código, ao lado dos botões **▷ Executar** e **Depurar**, há uma caixinha com o nome de uma função (por exemplo `doGet`). Clique nela, escolha **`corrigirDatas`** e depois clique em **▷ Executar**. Se a caixinha estiver vazia, salve o código antes (💾 ou Ctrl+S).

   Na primeira vez, o Google pede autorização: **Revisar permissões** → escolha sua conta → **Avançado** → **Acessar Projeto (não seguro)** → **Permitir**. Depois disso, rode de novo. O aviso aparece porque o script foi criado por você e não passou por verificação do Google.
   > Várias datas estavam com dia e mês trocados porque a planilha estava com localidade em inglês. A função corrige isso e muda a localidade para Brasil.
6. **Implantar → Nova implantação** → engrenagem → **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
7. Clique em **Implantar** e **copie a URL** (termina em `/exec`).

> Se um dia você alterar o código, use **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão**. Assim a URL continua a mesma.

## Passo 3: Publicar o app (grátis)
**Opção A: GitHub Pages** (recomendado)
1. Crie uma conta em github.com.
2. **New repository** → nome `meu-galo` → Create.
3. **Add file → Upload files**. Abra no Explorador de Arquivos a pasta do app, `C:\Users\m001134\.gemini\antigravity\scratch\galo-app` (cole esse caminho na barra de endereço do Explorador e aperte Enter). Selecione e arraste para a página do GitHub: `index.html`, `app.js`, `styles.css`, `data.js`, `sw.js`, `manifest.webmanifest` e a pasta `icons`. Depois clique em **Commit changes**. A pasta `apps-script` e este `LEIAME.md` não precisam ir.
4. **Settings → Pages** → Branch: `main` / `(root)` → Save.
5. Em 1 a 2 minutos o app fica em `https://SEU-USUARIO.github.io/meu-galo/`.

**Opção B: Netlify Drop**: entre em app.netlify.com/drop, crie a conta e arraste a pasta `galo-app` inteira.

> Em repositório público, a lista inicial de jogos (`data.js`) fica visível para quem tiver o link. Se preferir, apague o conteúdo de `data.js` deixando só `window.SEED_JOGOS = [];`. Depois de ligado ao Google, o app busca os dados direto da planilha.

## Passo 4: Instalar no iPhone
1. Abra o link do app no **Safari** (precisa ser o Safari).
2. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.
3. O ícone **Meu Galo** aparece na tela inicial e abre em tela cheia, como um app.

## Passo 5: Ligar o app à planilha
No app: **Ajustes** → cole a **URL do Apps Script** e a **senha** → **Salvar e sincronizar**.

Pronto! Os jogos que você cadastrar em **＋ Novo** vão direto para a aba correta da planilha (Profissional ou Base).
**Sem sinal no estádio?** O jogo fica guardado no iPhone, marcado como "a enviar", e sobe sozinho quando a internet voltar.

---

## Dicas
- Jogos já cadastrados são **editados direto na planilha**. O app mostra as mudanças na próxima sincronização.
- Para juntar nomes diferentes do mesmo jogador (ex.: "Gustavo Scarpa" e "Scarpa"), edite `APELIDOS` no início de `app.js`.
- Para usar o app no computador, basta abrir `index.html` no navegador. Para funcionar offline e sincronizar, ele precisa estar hospedado (passo 3).

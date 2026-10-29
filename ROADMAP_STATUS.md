# 🗺️ ROADMAP DO PROJETO - GERADOR DE RELATÓRIOS MYSQL

> **Última Atualização:** 05/10/2026  
> **Status Geral:** Sistema funcional, responsivo e integrado ao Servidor PHP + MySQL.

---

## 📌 PONTO DE PARADA ATUAL
O desenvolvimento encontra-se na fase de **Polimento Visual, Correções de UX/UI e Validações Avançadas**. Todas as funcionalidades principais de criação, salvamento, sincronização com MySQL, edição em tempo real e visualização de históricos estão 100% operacionais.

---

## ✅ FUNCIONALIDADES E AJUSTES CONCLUÍDOS

### 1. 🎨 Interface & Design System (Anexos & Identidade Visual)
- **Título Principal:** Ajustado para `24px` em caixa alta com fonte corporativa (`Times New Roman / Serif`).
- **Botão MENU da Navbar:** Removido o negrito extra pesado e a borda retangular externa. Adicionado o círculo ciano `#06b6d4` com a inicial `i`, ficando **idêntico ao Anexo 2**.
- **Campos EMBARCANDO & DESEMBARCANDO:**
  - **Embarcando:** Borda inicial suave que transita para **Verde Emerald (`#10b981`)** com brilho de foco ao ser selecionado (**Anexo 2**).
  - **Desembarcando:** Borda inicial rosa suave que transita para **Rosa/Red (`#f43f5e`)** com brilho de foco ao ser selecionado (**Anexo 4**).
  - Injeção de CSS global `outline: none !important` para eliminar o retângulo preto de seleção nativo dos navegadores (Chrome/Edge).
- **Loading Elegante "AGUARDANDO INFORMAÇÕES...":**
  - Anel de rotação suave (`spinAnim`) com indicador ciano.
  - Texto com pulsação suave de opacidade (`pulseAnim`) e espaçamento refinado (`letterSpacing: 1.2`).
  - Card de prévia em tom `#f8fafc` com borda `#e2e8f0`.

### 2. ⚡ Autenticação, Regras de Negócio e Preposto
- **Sessão Síncrona:** Leitura síncrona do `localStorage` na inicialização da aplicação, eliminando o piscar do modal para usuários logados.
- **Pop-up "Salvar na Nuvem":** Exibido instantaneamente na tela inicial apenas para **visitantes não logados**, oferecendo acesso rápido para *ENTRAR*, *CRIAR CONTA* ou fechar no *✕*.
- **Trava de Nome do Preposto:**
  - Quando o usuário está autenticado, o campo `NOME DO PREPOSTO` é **preenchido automaticamente** com o nome da conta e **bloqueado para edição** (`editable={false}`), acompanhado do selo `🔒 Preenchido via conta logada`.
  - Para visitantes não logados, o campo permanece liberado para digitação.

### 3. 📜 Validação e Direcionamento (Scroll Animado)
- **Scroll Suave Pós-Alerta:** Ao tentar gerar o relatório PDF com algum campo obrigatório em branco, a aplicação dispara um **scroll suave animado (`scrollIntoView({ behavior: 'smooth', block: 'center' })` + cálculo `pageYOffset - 140`)** diretamente até o primeiro campo pendente, destacando-o em vermelho e aplicando o foco automático no input assim que o alerta é confirmado.

### 4. 📁 Histórico de Relatórios (`meus_relatorios.tsx`)
- **Espaçamento da Barra de Rolagem (Scrollbar):** Adicionado `paddingRight: 16` no container interno (`detailScrollContent`) do modal de detalhes do relatório. Os boxes de informações, passageiros e o botão de download de PDF possuem uma área de respiro limpa de 16px em relação à barra de rolagem.
- **Títulos e Subtítulos:** Atualizados para `"HISTÓRICO DE RELATÓRIOS. Consulte todos os relatórios gerados e salvos."`
- **Tabela e Filtros:** Filtro por empresa, busca por unidade/local e exibição paginada (15 por página).

### 5. 📄 Documento A4 & Preview PDF
- **Editor WYSIWYG em Tempo Real:** Suporte a formatação rica (`B`, `I`, `U`, `Esquerda`, `Justificar`, `▪ Inserir Tópico`) no `contentEditable`.
- **Parser de Entidades HTML:** Decodificação limpa de `&amp;`, `&nbsp;` e `&bull;` em passagem dupla no `renderFormattedText`, evitando exposição de tags ou códigos crus no preview A4.
- **Tabela de Passageiros A4:** Alinhamento exato das colunas (`46%` / `54%`) conforme o modelo original `mms_layout.php` sem bordas superiores residuais.

---

### 6. 🛡️ Painel de Coordenação & Nível 2 (`painel_coord.tsx`)
- **Tela e Rota Dedicadas (`/painel_coord`):** Criada a interface completa no Expo Router com proteção estrita para usuários com autoridade Nível 2 / Coordenação.
- **Métricas e KPIs em Tempo Real:** Total geral de relatórios emitidos, atendimentos no mês atual, relatórios gerados hoje e total de usuários cadastrados.
- **Gestão de Relatórios Globais:** Acesso a todos os relatórios da base com filtros por empresa, unidade/local, preposto e intervalo de datas. Modal de detalhes completo e exclusão definitiva.
- **Top Geradores (Ranking):** Pódio visual (🥇, 🥈, 🥉) e lista ordenada de prepostos com mais relatórios gerados e percentual de participação.
- **Gestão de Usuários & Nível de Autoridade:** Listagem de usuários do MySQL com promoção ou rebaixamento instantâneo entre Nível 1 (Básico) e Nível 2 (Coordenação).
- **Comunicados Globais (Pop-ups In-App):** Criação e gerenciamento de avisos, notificações urgentes e feedback com status ativo/inativo.

### 7. 📱 Geração de PDF e Salvamento Offline no Mobile
- **Exportação Direta sem Dependência de Rede:** Geração stand-alone de documento HTML/PDF com CSS inline A4 oficial da MMS para impressão nativa do sistema operacional (salvar como PDF no celular).
- **Download de Cópia Offline:** Opção de baixar arquivo `.html` autossuficiente para armazenamento local ou compartilhamento.
- **Persistência Local Resiliente:** Armazenamento automático em `localStorage` sob a chave `mms_relatorios_offline_salvos` quando a conexão cair ou houver oscilação de rede.

### 8. 📅 Filtros Avançados por Intervalo de Data (`meus_relatorios.tsx`)
- **Seletores de Data Início (DE:) e Data Fim (ATÉ:):** Integrados à tela de histórico de relatórios com layout limpo e responsivo.
- **Filtragem no MySQL:** Consultas com `.gte()` e `.lte()` na coluna `data_criacao`, combináveis com a busca textual e o seletor de empresas.
- **Botões Filtrar e Limpar:** Atualização instantânea com restauração rápida de filtros.

### 9. 💬 Compartilhamento Rápido no WhatsApp
- **Resumo Operacional Estruturado:** Geração automática de texto profissional formatado para o WhatsApp com emojis, empresa, unidade, local, preposto, data/hora, horários de embarque, contagem de passageiros (PAX) e link direto para o PDF.
- **Integração Global:** Botão `💬 ZAP / WHATSAPP` disponível no Gerador Principal (`index.tsx`), nos cards e tabela de Histórico (`meus_relatorios.tsx`), e no Modal de Detalhes do Painel de Coordenação (`painel_coord.tsx`).
- **Compatibilidade Multiplataforma:** Abertura direta via WhatsApp Web ou aplicativo nativo do WhatsApp no celular/desktop sem requisições intermediárias.

### 10. 🌐 Deploy de Produção e Domínio Oficial
- **Domínio Ativo:** Publicado com sucesso em `https://relatorios.atmai.com.br`.
- **Certificado SSL:** HTTPS automático via Vercel Edge Network.
- **Pré-renderização Estática:** Suporte a rotas SPA com arquivos HTML pré-compilados para `/`, `/painel_coord` e `/meus_relatorios`.

### 11. 🛡️ Refinamento de Sessão & Controle Estrito de Acesso (Nível 2)
- **Separação Rigorosa de Menus:** Usuários visitantes (não logados) visualizam exclusivamente o menu simplificado com ações de Login, Cadastro, Histórico e Alternador de Tema, sem qualquer exposição de dados ou opções de coordenação.
- **Validação de Sessão em Banco de Dados (`auth.ts`):** Todas as inicializações e restaurações de sessão são checadas e enriquecidas com o campo `nivel_autoridade` da tabela `public.usuarios`, prevenindo manipulações locais no navegador.
- **Exibição Condicional do Painel no Menu:** O item "Painel de Coordenação" é renderizado única e exclusivamente para usuários autenticados cujo perfil possui autoridade `nivel_autoridade === 2`.
- **Bloqueio de Rota Não Autorizada (`/painel_coord`):**
  - Usuários não logados ou prepostos comuns (Nível 1) que tentarem abrir o painel diretamente têm o carregamento de métricas, relatórios e usuários interrompido.
  - Exibição de tela dedicada de **"⛔ Acesso Não Autorizado"** com orientações claras e botões para login ou retorno ao gerador.

---

## 🚀 STATUS DO BACKLOG

- [x] **Painel de Coordenação (Nível 2):** Interface e gerenciamento de solicitações e usuários Nível 2 concluídos.
- [x] **Geração Nativa de PDF offline no Mobile:** Suporte a exportação direta para PDF local e salvamento offline concluídos.
- [x] **Filtros Avançados por Intervalo de Data:** Seletores de período (data início e fim) no histórico concluídos.
- [x] **Deploy de Produção & Domínio Próprio:** Online em `relatorios.atmai.com.br` com SSL.
- [x] **Compartilhamento WhatsApp:** Resumo de atendimento e link direto para o WhatsApp.
- [x] **Controle Estrito de Acesso Nível 2 & Refinamento de Auth:** Isolamento de menus e bloqueio da rota do painel.
- [x] **Autenticação Segura via MySQL:** Validação de senhas bcrypt no servidor via `pgcrypto` (`login_usuario` e `desbloquear_painel_coord`), remoção de senhas em hardcode e bloqueio de colunas sensíveis via permissões PostgREST.

---

## 🛠️ ESTRUTURA DE ARQUIVOS CHAVE

- 📄 `core-app/src/lib/auth.ts` - Helper centralizado de validação de sessão, verificação estrita de Nível 2 e logout seguro.
- 📄 `core-app/src/app/index.tsx` - Gerador Principal, Formulário, Menus condicionais Visitante/Logado/Coordenação e Autenticação.
- 📄 `core-app/src/app/meus_relatorios.tsx` - Histórico de Relatórios, Filtros Avançados por Data/Empresa, Modal de Detalhes e Integração MySQL.
- 📄 `core-app/src/app/painel_coord.tsx` - Painel de Coordenação Nível 2 com barreira de autorização estrita e tela de bloqueio.
- 📄 `core-app/src/app/_layout.tsx` - Stack Navigation do Expo Router com suporte a todas as rotas.
- 📄 `core-app/src/lib/config.ts` - Configurações de endpoints PHP e URLs de PDF.

# 📊 Relatório de Progresso e Arquitetura do Sistema

> **Última Atualização:** 27 de Outubro de 2026  
> **Status Geral:** Sistema 100% operacional, tipado em TypeScript, com backend padronizado em PHP + MySQL e cliente multiplataforma (Web / React Native Expo).

---

## 🧭 1. Visão Geral da Arquitetura

O sistema é composto por duas camadas principais desacopladas e resilientes:

1. **Frontend da Aplicação (`core-app/`):**
   - Construído com **React Native (Expo)** rodando na Web e preparado para dispositivos móveis.
   - Suporte completo a **modo offline** com armazenamento local em `localStorage`.
   - Gerador vetorial nativo de relatórios PDF A4 com fidelidade visual.
   - Adaptador unificado [`core-app/src/lib/api.ts`](file:///c:/Users/Italo/Desktop/MMS/Scripts/mms_tools/gerador_relatorio_supabase/core-app/src/lib/api.ts) para comunicação com o backend.

2. **Backend e API REST (`api/`):**
   - Construído em **PHP nativo com PDO**, sem dependências pesadas, hospedado na **Hostinger** (`https://mmssuportelogistica.com.br/api/`).
   - Roteamento e reverse proxy no `vercel.json` encaminhando transparentemente `/api/*` da Vercel para o servidor da Hostinger.
   - Conexão com banco de dados **MySQL** utilizando nomes de variáveis padronizados da indústria (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`).
   - Leitura prioritária de `api/.env` e `api/config_db.php`.
   - Sistema de armazenamento protegido para anexos fotográficos com barreira `.htaccess` (403 Forbidden).

---

## 🚀 2. Conquistas Recentes & Funcionalidades Entregues

### 🗄️ A. Migração e Padronização do Backend (MySQL)
- [x] **Conexão Centralizada PDO (`api/db.php`):**
  - Conexão configurada em `utf8mb4` com `ERRMODE_EXCEPTION`.
  - Suporte a CORS completo para consumo via web e mobile.
  - Auto-criação de tabelas ausentes (`usuarios`, `relatorios`, `coord_senha`, `coord_acessos_falhos`, `registro_logins`, `notificacoes`, `versao_app`, etc.).
  - Resolução robusta de variáveis de ambiente com busca em cascata (`.env`, `.mms_env`, `DOCUMENT_ROOT` e caminhos da Hostinger) e fallback automático para reuso do PDO ativo de `mms_config.php`.
- [x] **Padronização 100% sem Prefixos Específicos (`api/config_db.php`):**
  - Nomenclatura universal pronta para distribuição e expansão (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`, `API_SECRET_KEY`).
  - Remoção completa de prefixos e constantes legadas `MMS_`.
  - Pré-configuração padrão com a base oficial `u596152436_relatorios`, usuário `u596152436_admin_mms` e senha configurada diretamente em `config_db.php` e `.env` local da API.
- [x] **Autenticação, Desbloqueio e Auditoria (`api/auth.php` e `api/coord.php`):**
  - Criptografia com algoritmo moderno `password_verify` / `password_hash` (suporte a bcrypt `$2y$`, `$2a$`, `$2b$`, md5 e texto puro).
  - Busca flexível de usuários por `username`, `email` ou `nome` (case-insensitive e busca por prefixo).
  - Integração de hashes originais da base `u596152436_relatorios.sql` (usuário coordenador `italogabriel` e equipe).
  - Validação unificada no Painel de Coordenação: aceita tanto a senha mestre de `coord_senha` quanto a senha pessoal da conta de coordenação (nível 2).
  - Controle de sessões com "Lembrar-me" via tokens criptograficamente seguros de 64 caracteres.
  - Registro de auditoria em `registro_logins` e `coord_acessos_falhos`.
- [x] **CRUD Completo de Relatórios (`api/relatorios.php`):**
  - Inserção e atualização com `AUTO_INCREMENT` nativo (resolvendo de vez colisões de ID).
  - Filtros avançados: empresa, unidade, período de datas, preposto e busca textual.
  - Paginação eficiente e métricas consolidadas para a coordenação.
- [x] **Painel de Coordenação & Segurança (`api/coord.php`):**
  - Validação da senha da coordenação via hash na tabela `coord_senha`.
  - Proteção contra força bruta (Rate Limiting de 5 tentativas por IP a cada 15 minutos).
  - Registro de tentativas de acesso incorretas em `coord_acessos_falhos`.
- [x] **Gestão de Versões e Notificações (`api/configuracoes.php`):**
  - Consulta e cadastro de versão atual do aplicativo na tabela padronizada `versao_app`.
  - Distribuição e controle de avisos e pop-ups in-app (`notificacoes`).

---

### 🎨 B. Interface & Experiência do Usuário (UI/UX)
- [x] **Paginação na Aba Segurança (`painel_coord.tsx`):**
  - Implementação de paginação dinâmica e independente (10 itens por página) para as 4 seções de auditoria e segurança:
    1. *Dispositivos Logados & Auditoria de Sessões*
    2. *Acessos ao Gerador de Relatórios (Página Inicial)*
    3. *Acessos Falhos ao Painel (Tentativas Bloqueadas)*
    4. *Firewall do Gerador — IPs Bloqueados*
  - Suporte completo tanto na visualização em Tabela (desktop) quanto na lista em Cards (mobile), com indicador de páginas e botões Anterior / Próxima responsivos.
- [x] **Formatação de Texto Aprimorada:**
  - Adicionado botão **[ Tachado ]** na barra de formatação (com suporte a `~texto~` no preview, no PDF vetorial `jsPDF` e no gerador HTML).
  - Removido o botão legado `[ Esquerda ]` da barra de formatação.
  - Inclusão do botão **[ N/A ]** para preenchimento rápido dos campos de passageiros.
  - Destaque em **negrito (`fontWeight: '800'`)** nos títulos das seções `EMBARCANDO` e `DESEMBARCANDO`.
- [x] **Validação Obrigatória Rigorosa com Scroll Animado:**
  - Todos os campos obrigatórios são validados ao clicar em "Gerar Relatório".
  - Scroll suave animado com centralização automática no primeiro campo pendente.
  - Destaque visual com borda vermelha e foco imediato no campo a ser preenchido.
- [x] **Gestão de Anexos Fotográficos:**
  - Upload automático de imagens em Base64 para o endpoint seguro `api/upload_anexo.php`.
  - Armazenamento físico em `api/storage_anexos/` com entrega autenticada por `api/ver_anexo.php`.
  - Desacoplamento do banco de dados, mantendo o banco MySQL leve e rápido.

---

### 🛡️ C. Segurança e Conformidade
- [x] **Remoção de Chaves Sensíveis:**
  - Purga de scripts temporários com credenciais expostas do repositório Git.
  - Fechamento de avisos do GitGuardian com revogação e migração definitiva para infraestrutura própria.
- [x] **Verificação Estática de Tipos (TypeScript):**
  - Execução do compilador `tsc --noEmit` resultando em **0 erros** em todo o código-fonte.
  - Todas as chamadas para a API tipadas com interfaces em TypeScript.

---

## 📁 3. Estrutura Atual dos Arquivos Principais

```text
├── api/                                # Backend PHP MySQL
│   ├── auth.php                        # Autenticação, cadastro e sessão
│   ├── config_anexos.php               # Configurações de armazenamento de fotos
│   ├── config_db.php                   # Credenciais padronizadas do MySQL (DB_HOST, etc.)
│   ├── configuracoes.php               # Versões do app e notificações
│   ├── coord.php                       # Painel da coordenação, segurança e rate-limit
│   ├── db.php                          # Conexão central PDO e auto-setup de tabelas
│   ├── relatorios.php                  # CRUD de relatórios e estatísticas
│   ├── upload_anexo.php                # Upload protegido de imagens
│   ├── ver_anexo.php                   # Leitura autorizada de imagens
│   ├── COMO_INSTALAR_NA_HOSPEDAGEM.txt # Guia rápido de deploy na Hostinger
│   └── storage_anexos/                 # Pasta física de fotos (.htaccess 403)
│
├── core-app/                           # Frontend React Native (Expo)
│   ├── src/
│   │   ├── app/
│   │   │   ├── index.tsx               # Gerador principal de relatórios
│   │   │   ├── meus_relatorios.tsx     # Histórico e consulta com filtros
│   │   │   ├── painel_coord.tsx        # Dashboard executivo da coordenação
│   │   │   ├── ver_relatorio.tsx       # Visualizador dedicado de relatórios
│   │   │   └── ...
│   │   └── lib/
│   │       ├── api.ts                  # Cliente TypeScript da API MySQL
│   │       ├── auth.ts                 # Regras de autenticação e sessão local
│   │       ├── config.ts               # URLs base e detecção de domínio
│   │       ├── anexosService.ts        # Serviço de envio de fotos
│   │       ├── pdfManager.ts           # Geração e download de PDFs
│   │       ├── vectorPdfGenerator.ts   # Desenho vetorial de PDF (jsPDF)
│   │       └── footerConfig.ts         # Rodapé e controle de versão
│
└── PROGRESSO.md                        # Este documento de acompanhamento
```

---

## 📈 4. Status das Tarefas e Próximos Passos

| Módulo | Status | Descrição |
| :--- | :---: | :--- |
| **Interface do Gerador** | 🟢 Concluído | Formatação rica, validações obrigatórias com scroll, campos N/A, negrito. |
| **Geração de PDF** | 🟢 Concluído | Exportação vetorial A4 e modo offline com fidelidade visual. |
| **Upload de Fotos** | 🟢 Concluído | Upload assíncrono para pasta segura na hospedagem. |
| **API PHP MySQL** | 🟢 Concluído | Endpoints CRUD, auth, coord e versionamento testados e operacionais. |
| **Deploy na Hospedagem** | 🟡 Aguardando | Subir pasta `api/` para `public_html/` na Hostinger. |
| **Expansão Futura** | ⚪ Planejado | Relatórios analíticos exportáveis em Excel (.xlsx) e filtros por período customizado. |

---

*Documento gerado e mantido atualizado para acompanhamento técnico contínuo.*

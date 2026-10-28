<?php
/**
 * CONFIGURAÇÃO DO BANCO DE DADOS MYSQL
 *
 * O sistema tenta automaticamente obter as credenciais das variáveis de ambiente
 * ou do arquivo .env (ou .mms_env) na raiz da hospedagem.
 *
 * Para configurar diretamente, preencha as constantes padronizadas abaixo:
 */

// Host do MySQL (padrão: 'localhost')
defined('DB_HOST') or define('DB_HOST', 'localhost');

// Nome do banco de dados oficial (conforme base u596152436_relatorios)
defined('DB_NAME') or define('DB_NAME', 'u596152436_relatorios');

// Usuário do banco de dados (conforme Hostinger u596152436_admin_mms)
defined('DB_USER') or define('DB_USER', 'u596152436_admin_mms');

// Senha do banco de dados (se vazio, será lida do arquivo .env ou .mms_env na raiz da hospedagem)
defined('DB_PASS') or define('DB_PASS', '');

// Chave Secreta para tokens e segurança da API
defined('API_SECRET_KEY') or define('API_SECRET_KEY', 'e94a8f61c32b50d998a4c146e28fb05cf711d9546059d2489e2171ec55fb8f29');

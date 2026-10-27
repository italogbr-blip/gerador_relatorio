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

// Nome do banco de dados (ex: 'seu_banco')
defined('DB_NAME') or define('DB_NAME', '');

// Usuário do banco de dados (ex: 'seu_usuario')
defined('DB_USER') or define('DB_USER', '');

// Senha do banco de dados
defined('DB_PASS') or define('DB_PASS', '');

// Chave Secreta para tokens e segurança da API
defined('API_SECRET_KEY') or define('API_SECRET_KEY', 'e94a8f61c32b50d998a4c146e28fb05cf711d9546059d2489e2171ec55fb8f29');

// Compatibilidade reversa (caso algum script legado ainda consulte o prefixo anterior)
defined('MMS_DB_HOST') or define('MMS_DB_HOST', DB_HOST);
defined('MMS_DB_NAME') or define('MMS_DB_NAME', DB_NAME);
defined('MMS_DB_USER') or define('MMS_DB_USER', DB_USER);
defined('MMS_DB_PASS') or define('MMS_DB_PASS', DB_PASS);
defined('MMS_API_SECRET') or define('MMS_API_SECRET', API_SECRET_KEY);

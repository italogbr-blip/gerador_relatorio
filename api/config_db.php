<?php
/**
 * CONFIGURAÇÃO DO BANCO DE DADOS MYSQL - MMS
 *
 * O sistema tenta automaticamente obter as credenciais do arquivo .mms_env
 * localizado na raiz da sua hospedagem (Hostinger).
 *
 * Caso deseje configurar diretamente neste arquivo, preencha as constantes abaixo:
 */

// Host do MySQL (na Hostinger geralmente é 'localhost')
defined('MMS_DB_HOST') or define('MMS_DB_HOST', 'localhost');

// Nome do banco de dados (ex: 'u596152436_relatorios')
defined('MMS_DB_NAME') or define('MMS_DB_NAME', '');

// Usuário do banco de dados (ex: 'u596152436_user')
defined('MMS_DB_USER') or define('MMS_DB_USER', '');

// Senha do banco de dados
defined('MMS_DB_PASS') or define('MMS_DB_PASS', '');

// Chave Secreta para tokens da API MMS
defined('MMS_API_SECRET') or define('MMS_API_SECRET', 'e94a8f61c32b50d998a4c146e28fb05cf711d9546059d2489e2171ec55fb8f29');

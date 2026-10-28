<?php
/**
 * CONFIGURAÇÃO DO BANCO DE DADOS MYSQL
 *
 * Configuração central e autônoma da API.
 * Todas as requisições do sistema ao banco de dados utilizam estas credenciais.
 */

// Host do MySQL (padrão: 'localhost')
defined('DB_HOST') or define('DB_HOST', 'localhost');

// Nome do banco de dados oficial
defined('DB_NAME') or define('DB_NAME', 'u596152436_relatorios');

// Usuário do banco de dados
defined('DB_USER') or define('DB_USER', 'u596152436_admin_mms');

// Senha do banco de dados oficial
defined('DB_PASS') or define('DB_PASS', 'R@@t#env#1741@');

// Chave Secreta para tokens e segurança da API
defined('API_SECRET_KEY') or define('API_SECRET_KEY', 'e94a8f61c32b50d998a4c146e28fb05cf711d9546059d2489e2171ec55fb8f29');

/**
 * Configuração dos servidores e endpoints da aplicação.
 * Permite integração entre o App e o Servidor PHP na hospedagem.
 */

export const DEFAULT_SERVER_URL = 'https://relatorios.atmai.com.br';

/**
 * Detecta a URL base do servidor dinamicamente
 */
export function getServerBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.startsWith('http')) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return DEFAULT_SERVER_URL;
    }
    return window.location.origin;
  }
  return DEFAULT_SERVER_URL;
}

export const PHP_SERVER_URL = DEFAULT_SERVER_URL;
export const PHP_SAVE_ENDPOINT = `${DEFAULT_SERVER_URL}/salvar_relatorio.php`;
export const PHP_PDF_BASE_URL = `${DEFAULT_SERVER_URL}/relatorios_pdf/`;

// Chave secreta de autenticação para upload e segurança de anexos fotográficos
export const ANEXOS_API_KEY = 'e94a8f61c32b50d998a4c146e28fb05cf711d9546059d2489e2171ec55fb8f29';

/**
 * Monta a URL completa e acessível de um PDF retornado do servidor
 */
export function formatReportPdfUrl(pdfUrl?: string | null): string | null {
  if (!pdfUrl) return null;
  if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
    return pdfUrl;
  }
  const cleanPath = pdfUrl.startsWith('/') ? pdfUrl.slice(1) : pdfUrl;
  const base = getServerBaseUrl();
  return `${base}/${cleanPath}`;
}


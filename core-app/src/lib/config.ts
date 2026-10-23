/**
 * Configuração dos servidores e endpoints da aplicação.
 * Permite integração entre o App (Vercel/Expo) e o Servidor PHP (mmssuportelogistica.com.br)
 */

export const PHP_SERVER_URL = 'https://mmssuportelogistica.com.br';
export const PHP_SAVE_ENDPOINT = `${PHP_SERVER_URL}/salvar_relatorio.php`;
export const PHP_VECTOR_PDF_ENDPOINT = `${PHP_SERVER_URL}/gerar_pdf_vetor.php`;
export const PHP_PDF_BASE_URL = `${PHP_SERVER_URL}/relatorios_pdf/`;

/**
 * Monta a URL completa e acessível de um PDF retornado do servidor
 */
export function formatReportPdfUrl(pdfUrl?: string | null): string | null {
  if (!pdfUrl) return null;
  if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
    return pdfUrl;
  }
  const cleanPath = pdfUrl.startsWith('/') ? pdfUrl.slice(1) : pdfUrl;
  return `${PHP_SERVER_URL}/${cleanPath}`;
}

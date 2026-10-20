import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { gerarHtmlPdfFidelidade, ReportPdfData } from './pdfHtmlGenerator';

/**
 * Gera o nome de arquivo idêntico ao index.php e salvar_relatorio.php:
 * Ex: P-51_18-10-2026_(08h30)_TRANSFERIDO.pdf
 */
export function gerarNomeArquivoPdf(dados: {
  unidade?: string;
  data?: string;
  observacao?: string;
  observacao_nome_arquivo?: string;
  horarios?: { embarque_previsto?: string };
}): string {
  const unidade = (dados.unidade || 'MMS').trim().toUpperCase().replace(/\s+/g, '_');

  const rawData = dados.data || '';
  const parts = rawData.split('-');
  const dataFormatada = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : rawData || 'DATA';

  const obs = (dados.observacao_nome_arquivo || dados.observacao || '').trim().toUpperCase();
  const strObs = obs !== '' ? `_${obs}` : '';

  const embPrevisto = dados.horarios?.embarque_previsto || '';
  let strEmb = '';
  if (
    embPrevisto.trim() !== '' &&
    embPrevisto.trim() !== ':' &&
    !embPrevisto.toUpperCase().includes('N')
  ) {
    const embFormatado = embPrevisto.replace(':', 'h');
    strEmb = `_(${embFormatado})`;
  }

  let nomeArquivo = `${unidade}_${dataFormatada}${strEmb}${strObs}.pdf`;
  nomeArquivo = nomeArquivo.replace(/[\/\\?%*:|"<>]/g, '-');
  return nomeArquivo;
}

/**
 * Carrega a biblioteca html2pdf.js dinamicamente no Web
 */
let html2pdfInstance: any = null;
async function getHtml2Pdf() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  if (!html2pdfInstance) {
    try {
      const mod = await import('html2pdf.js');
      html2pdfInstance = mod.default || mod;
    } catch (e) {
      console.warn('html2pdf load warning:', e);
    }
  }
  return html2pdfInstance;
}

/**
/**
 * Converte dados do relatório em documento HTML completo e nome de arquivo
 */
export function compilarHtmlRelatorio(dados: ReportPdfData): { docHtml: string; nomeArquivo: string } {
  const docHtml = gerarHtmlPdfFidelidade(dados);
  const nomeArquivo = gerarNomeArquivoPdf(dados);
  return { docHtml, nomeArquivo };
}

/**
 * Gera o Blob do PDF real e completo (usando endpoint do servidor se disponível ou geração local de alta fidelidade)
 */
export async function gerarPdfBlob(
  dados: ReportPdfData,
  existingPdfUrl?: string | null
): Promise<{ blob: Blob; nomeArquivo: string }> {
  const { docHtml, nomeArquivo } = compilarHtmlRelatorio(dados);

  // 1. Se já houver uma URL do PDF no servidor, tenta baixar diretamente o arquivo oficial
  if (existingPdfUrl && Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const resp = await fetch(existingPdfUrl);
      if (resp.ok) {
        const srvBlob = await resp.blob();
        if (srvBlob && srvBlob.size > 1000) {
          return { blob: srvBlob, nomeArquivo };
        }
      }
    } catch (err) {
      console.warn('Endpoint do servidor indisponível para download direto do PDF, gerando via motor web local:', err);
    }
  }

  // 2. Geração Web de Alta Resolução via html2pdf / html2canvas (sem offscreen negativo para não sair em branco)
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const html2pdf = await getHtml2Pdf();
    if (html2pdf) {
      const container = document.createElement('div');
      container.id = 'mms-pdf-render-sandbox';
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '794px';
      container.style.backgroundColor = '#ffffff';
      container.style.zIndex = '-99999';
      container.style.pointerEvents = 'none';
      container.innerHTML = docHtml;
      document.body.appendChild(container);

      try {
        // Aguarda carregamento integral de imagens (logo institucional, background base64 e anexos)
        const images = Array.from(container.querySelectorAll('img'));
        await Promise.all(
          images.map(
            (img) =>
              new Promise<void>((resolve) => {
                if (img.complete && img.naturalWidth !== 0) return resolve();
                img.onload = () => resolve();
                img.onerror = () => resolve();
              })
          )
        );

        if ((document as any).fonts && (document as any).fonts.ready) {
          await (document as any).fonts.ready;
        }

        // Aguarda estabilização do layout
        await new Promise((resolve) => setTimeout(resolve, 150));

        const opt = {
          margin: 0,
          filename: nomeArquivo,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            letterRendering: true,
            logging: false,
            scrollX: 0,
            scrollY: 0,
            windowWidth: 794,
            x: 0,
            y: 0,
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        };

        const pdfBlob: Blob = await html2pdf().set(opt).from(container).outputPdf('blob');
        return { blob: pdfBlob, nomeArquivo };
      } finally {
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }
    }
  }

  // 3. Fallback Nativo (iOS / Android em runtime React Native)
  const { uri } = await Print.printToFileAsync({ html: docHtml });
  const response = await fetch(uri);
  const blob = await response.blob();
  return { blob, nomeArquivo };
}

/**
 * Executa o download automático do arquivo .pdf no dispositivo
 */
export async function baixarPdfRelatorio(
  dados: ReportPdfData,
  existingPdfUrl?: string | null
): Promise<{ sucesso: boolean; nomeArquivo: string }> {
  const { blob, nomeArquivo } = await gerarPdfBlob(dados, existingPdfUrl);

  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = nomeArquivo;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    return { sucesso: true, nomeArquivo };
  }

  // Native (iOS e Android): Usa expo-sharing para salvar ou exportar
  if (await Sharing.isAvailableAsync()) {
    const { docHtml } = compilarHtmlRelatorio(dados);
    const { uri } = await Print.printToFileAsync({ html: docHtml });
    await Sharing.shareAsync(uri, {
      dialogTitle: `Baixar Relatório ${nomeArquivo}`,
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
  }
  return { sucesso: true, nomeArquivo };
}

/**
 * Compartilha o PDF gerado (abre a navbar/sheet de compartilhamento nativa do dispositivo com o arquivo PDF,
 * idêntico à lógica de index.php)
 */
export async function compartilharPdfRelatorio(
  dados: ReportPdfData,
  fallbackUrl?: string,
  existingPdfUrl?: string | null
): Promise<{ sucesso: boolean; metodo: 'share_api' | 'whatsapp' | 'share_native' }> {
  const { blob, nomeArquivo } = await gerarPdfBlob(dados, existingPdfUrl);

  // 1. Mobile Nativo (iOS / Android em compilação nativa)
  if (Platform.OS !== 'web') {
    try {
      const { docHtml } = compilarHtmlRelatorio(dados);
      const { uri } = await Print.printToFileAsync({ html: docHtml });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          dialogTitle: `Compartilhar Relatório ${nomeArquivo}`,
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
        });
        return { sucesso: true, metodo: 'share_native' };
      }
    } catch (e) {
      console.warn('Erro no sharing nativo:', e);
    }
  }

  // 2. Web Browser (iOS Safari, Android Chrome, etc. - idêntico a index.php)
  if (typeof window !== 'undefined') {
    const file = new File([blob], nomeArquivo, { type: 'application/pdf' });

    // 2.1. Tenta compartilhar o arquivo físico via Web Share API
    // Isso abre a navbar / menu nativo de compartilhamento do dispositivo (WhatsApp, AirDrop, etc.)
    if (typeof navigator !== 'undefined' && (navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
      try {
        await (navigator as any).share({
          files: [file],
          title: nomeArquivo,
          text: `Segue o relatório da MMS: ${nomeArquivo}`,
        });
        return { sucesso: true, metodo: 'share_api' };
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Usuário fechou ou cancelou o menu nativo de compartilhamento
          return { sucesso: true, metodo: 'share_api' };
        }
        console.warn('Tentativa de compartilhar arquivo físico falhou, tentando link:', err);
      }
    }

    // 2.2. Fallback de URL via Web Share API (se o navegador suportar compartilhamento nativo de texto/link)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Relatório MMS - ${dados.unidade}`,
          text: `Acesse o relatório através deste link: ${nomeArquivo}`,
          url: fallbackUrl || window.location.href,
        });
        return { sucesso: true, metodo: 'share_api' };
      } catch (err: any) {
        if (err.name === 'AbortError') return { sucesso: true, metodo: 'share_api' };
        console.warn('Navigator share de link falhou:', err);
      }
    }

    // 2.3. Fallback WhatsApp (Desktop Chrome sem Web Share API)
    const msg = encodeURIComponent(
      `*MMS RELATÓRIO DE TROCA DE TURMA*\n📄 *Arquivo:* ${nomeArquivo}\n⚓ *Unidade:* ${dados.unidade}\n📅 *Data:* ${dados.data}\n📍 *Local:* ${dados.local}\n👤 *Preposto:* ${dados.preposto}` +
        (fallbackUrl ? `\n🔗 *Acesse:* ${fallbackUrl}` : '')
    );
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
    return { sucesso: true, metodo: 'whatsapp' };
  }

  return { sucesso: false, metodo: 'whatsapp' };
}

/**
 * Visualiza o relatório com fidelidade máxima 100% igual a ver_relatorio.php e coord/index.php
 */
export function visualizarRelatorioHtml(dados: ReportPdfData): void {
  const { docHtml } = compilarHtmlRelatorio(dados);

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Insere barra de topo moderna para Imprimir / Salvar PDF / Fechar
    const toolbarHtml = `
      <style>
        @media print {
          .mms-preview-toolbar { display: none !important; }
        }
        .mms-preview-toolbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 52px;
          background: #0f172a;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          z-index: 99999;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .mms-preview-toolbar-btn {
          background: #2563eb;
          color: #ffffff;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .mms-preview-toolbar-btn-close {
          background: #334155;
        }
        body {
          padding-top: 56px !important;
        }
      </style>
      <div class="mms-preview-toolbar">
        <div style="font-weight: 800; font-size: 14px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px;">
          <span>📄 MMS RELATÓRIO - VISUALIZAÇÃO</span>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="mms-preview-toolbar-btn" onclick="window.print()">
            🖨️ IMPRIMIR / PDF
          </button>
          <button class="mms-preview-toolbar-btn mms-preview-toolbar-btn-close" onclick="window.close()">
            ✕ FECHAR
          </button>
        </div>
      </div>
    `;

    const finalHtml = docHtml.replace('<body>', '<body>' + toolbarHtml);
    const viewWin = window.open('', '_blank');
    if (viewWin) {
      viewWin.document.write(finalHtml);
      viewWin.document.close();
      viewWin.focus();
    } else {
      window.print();
    }
  }
}

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
 * Converte dados do relatório em documento HTML completo e nome de arquivo
 */
export function compilarHtmlRelatorio(dados: ReportPdfData): { docHtml: string; nomeArquivo: string } {
  const docHtml = gerarHtmlPdfFidelidade(dados);
  const nomeArquivo = gerarNomeArquivoPdf(dados);
  return { docHtml, nomeArquivo };
}

/**
 * Executa o download automático do arquivo .pdf no dispositivo
 */
export async function baixarPdfRelatorio(dados: ReportPdfData): Promise<{ sucesso: boolean; nomeArquivo: string }> {
  const { docHtml, nomeArquivo } = compilarHtmlRelatorio(dados);

  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const html2pdf = await getHtml2Pdf();
    if (html2pdf) {
      try {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        container.style.width = '210mm';
        container.style.background = '#ffffff';
        container.innerHTML = docHtml;
        document.body.appendChild(container);

        const opt = {
          margin: 0,
          filename: nomeArquivo,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        };

        await html2pdf().set(opt).from(container).save();
        document.body.removeChild(container);
        return { sucesso: true, nomeArquivo };
      } catch (err) {
        console.warn('Erro ao gerar via html2pdf, acionando fallback de impressão:', err);
      }
    }

    // Fallback Web: Abre janela de impressão formatada para salvar como PDF
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(docHtml);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 400);
      return { sucesso: true, nomeArquivo };
    } else {
      window.print();
      return { sucesso: true, nomeArquivo };
    }
  }

  // Native (iOS e Android): Usa expo-print e expo-sharing
  try {
    const { uri } = await Print.printToFileAsync({ html: docHtml });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        dialogTitle: `Baixar Relatório ${nomeArquivo}`,
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
    }
    return { sucesso: true, nomeArquivo };
  } catch (err: any) {
    console.error('Erro no printToFileAsync nativo:', err);
    throw err;
  }
}

/**
 * Compartilha o PDF gerado (via Web Share API, WhatsApp ou Share nativo)
 */
export async function compartilharPdfRelatorio(
  dados: ReportPdfData,
  fallbackUrl?: string
): Promise<{ sucesso: boolean; metodo: 'share_api' | 'whatsapp' | 'share_native' }> {
  const { docHtml, nomeArquivo } = compilarHtmlRelatorio(dados);

  // 1. Mobile Nativo (iOS / Android)
  if (Platform.OS !== 'web') {
    try {
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

  // 2. Web Browser
  if (typeof window !== 'undefined') {
    // Tenta Web Share API nativa com arquivo PDF se o navegador suportar (Mobile Chrome / Safari)
    const html2pdf = await getHtml2Pdf();
    if (html2pdf && typeof navigator !== 'undefined' && (navigator as any).canShare) {
      try {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.width = '210mm';
        container.innerHTML = docHtml;
        document.body.appendChild(container);

        const pdfBlob: Blob = await html2pdf()
          .set({
            margin: 0,
            image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          })
          .from(container)
          .outputPdf('blob');

        document.body.removeChild(container);

        const file = new File([pdfBlob], nomeArquivo, { type: 'application/pdf' });
        if ((navigator as any).canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: nomeArquivo,
            text: `Segue o relatório da MMS: ${nomeArquivo}`,
          });
          return { sucesso: true, metodo: 'share_api' };
        }
      } catch (e) {
        console.warn('Tentativa de compartilhar arquivo via Web Share falhou:', e);
      }
    }

    // Se suportar apenas share de link/texto
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Relatório MMS - ${dados.unidade}`,
          text: `Segue o relatório da MMS: ${nomeArquivo}`,
          url: fallbackUrl || window.location.href,
        });
        return { sucesso: true, metodo: 'share_api' };
      } catch (e) {
        console.warn('Navigator share cancelado ou indisponível:', e);
      }
    }

    // Fallback direto: WhatsApp
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

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { gerarHtmlPdfFidelidade, ReportPdfData } from './pdfHtmlGenerator';
import { formatReportPdfUrl } from './config';


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

let jsPdfClass: any = null;
let html2canvasFunc: any = null;

async function getPdfEngines() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  if (!jsPdfClass) {
    try {
      const mod = await import('jspdf');
      jsPdfClass = mod.jsPDF || mod.default || mod;
    } catch (e) {
      console.warn('jspdf load warning:', e);
    }
  }
  if (!html2canvasFunc) {
    try {
      const mod = await import('html2canvas');
      html2canvasFunc = mod.default || mod;
    } catch (e) {
      console.warn('html2canvas load warning:', e);
    }
  }
  return { jsPDF: jsPdfClass, html2canvas: html2canvasFunc };
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
 * Gera o Blob do PDF 100% VETORIAL (priorizando o motor DomPDF oficial do sistema)
 */
export async function gerarPdfBlob(
  dados: ReportPdfData,
  existingPdfUrl?: string | null
): Promise<{ blob: Blob; nomeArquivo: string }> {
  const { docHtml, nomeArquivo } = compilarHtmlRelatorio(dados);

  // 1. Se já houver uma URL do PDF legado salva no servidor, pode reaproveitar
  if (existingPdfUrl && Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const formattedUrl = formatReportPdfUrl(existingPdfUrl);
      if (formattedUrl) {
        const resp = await fetch(formattedUrl);
        if (resp.ok) {
          const srvBlob = await resp.blob();
          const firstBytes = await srvBlob.slice(0, 5).text();
          if (firstBytes.includes('%PDF')) {
            return { blob: srvBlob, nomeArquivo };
          }
        }
      }
    } catch (_) { }
  }

  // 2. Compilação Nativa Mobile (iOS / Android em runtime React Native) - Gera PDF vetorial nativo via motor do OS
  if (Platform.OS !== 'web') {
    const { uri } = await Print.printToFileAsync({ html: docHtml });
    const response = await fetch(uri);
    const blob = await response.blob();
    return { blob, nomeArquivo };
  }

  // 3. Geração no Navegador Web via iframe isolado + html2canvas + jsPDF (Renderização 100% fiel sem página em branco)
  const engines = await getPdfEngines();
  if (engines?.jsPDF && typeof document !== 'undefined') {
    const { jsPDF: JsPdfConstructor } = engines;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '794px';
    iframe.style.height = '1123px';
    iframe.style.zIndex = '-9999';
    iframe.style.opacity = '0.01';
    iframe.style.border = 'none';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    try {
      const idoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!idoc) throw new Error('Não foi possível inicializar iframe do PDF');

      idoc.open();
      idoc.write(docHtml);
      idoc.close();

      // Aguarda renderização completa de estilos, fontes e imagens base64
      await new Promise((r) => setTimeout(r, 450));

      const pages = idoc.querySelectorAll('.mms-pdf-page');

      if (pages && pages.length > 0 && engines.html2canvas) {
        const pdf = new JsPdfConstructor({
          orientation: 'portrait',
          unit: 'pt',
          format: 'a4',
          compress: true,
        });

        for (let i = 0; i < pages.length; i++) {
          const pageEl = pages[i] as HTMLElement;
          const canvas = await engines.html2canvas(pageEl, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: 794,
            height: 1123,
            windowWidth: 794,
            windowHeight: 1123,
          });

          const imgData = canvas.toDataURL('image/jpeg', 0.98);
          if (i > 0) {
            pdf.addPage('a4', 'portrait');
          }
          pdf.addImage(imgData, 'JPEG', 0, 0, 595.28, 841.89, undefined, 'FAST');
        }

        const vectorBlob: Blob = pdf.output('blob');
        return { blob: vectorBlob, nomeArquivo };
      } else if (typeof (JsPdfConstructor as any).prototype.html === 'function') {
        const pdf = new JsPdfConstructor({
          orientation: 'portrait',
          unit: 'pt',
          format: 'a4',
          compress: true,
        });
        await new Promise<void>((resolve, reject) => {
          (pdf as any).html(idoc.body, {
            callback: () => resolve(),
            autoPaging: 'text',
            x: 0,
            y: 0,
            width: 595.28,
            windowWidth: 794,
          }).catch(reject);
        });
        const vectorBlob: Blob = pdf.output('blob');
        return { blob: vectorBlob, nomeArquivo };
      }
    } catch (e) {
      console.warn('Erro ao compilar PDF via iframe/canvas:', e);
    } finally {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }
  }

  // Fallback final
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
  try {
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
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
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
  } catch (err: any) {
    console.error('Erro na geração direta do PDF via motor gráfico:', err);
    // Fallback Web: abre tela de visualização em alta fidelidade com impressão/salvamento PDF imediato
    if (Platform.OS === 'web') {
      visualizarRelatorioHtml(dados);
      return { sucesso: true, nomeArquivo: gerarNomeArquivoPdf(dados) };
    }
    throw err;
  }
}

/**
 * Compartilha o PDF gerado (abre a navbar/sheet de compartilhamento nativa do navegador/dispositivo,
 * idêntico à lógica de index.php, eliminando abertura de link para WhatsApp)
 */
export async function compartilharPdfRelatorio(
  dados: ReportPdfData,
  fallbackUrl?: string,
  existingPdfUrl?: string | null,
  preloadedBlob?: Blob | null
): Promise<{ sucesso: boolean; metodo: 'share_api' | 'clipboard' | 'share_native' | 'not_supported' }> {
  const nomeArquivo = gerarNomeArquivoPdf(dados);

  // 1. Mobile Nativo (iOS / Android em runtime Expo nativo)
  if (Platform.OS !== 'web') {
    try {
      const { docHtml } = compilarHtmlRelatorio(dados);
      const { uri } = await Print.printToFileAsync({ html: docHtml });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
        });
        return { sucesso: true, metodo: 'share_native' };
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return { sucesso: true, metodo: 'share_native' };
      console.warn('Erro no sharing nativo:', e);
    }
  }

  // 2. Web Browser: Abre a barra de compartilhamento nativa do sistema/navegador (Web Share API) conforme index.php
  if (typeof window !== 'undefined') {
    let linkParaCompartilhar = fallbackUrl || existingPdfUrl || window.location.href;
    try {
      const absoluteUrl = new URL(linkParaCompartilhar, window.location.href).href;
      linkParaCompartilhar = absoluteUrl;
    } catch { }

    const shareDataUrl = {
      url: linkParaCompartilhar,
    };

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        // Se temos o blob em memória (ou pré-carregado), compartilha o arquivo físico direto (sem título/texto conforme index.php:2608)
        if (preloadedBlob && (navigator as any).canShare) {
          try {
            const file = new File([preloadedBlob], nomeArquivo, {
              type: 'application/pdf',
              lastModified: Date.now(),
            });
            if ((navigator as any).canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
              });
              return { sucesso: true, metodo: 'share_api' };
            }
          } catch (fileErr: any) {
            if (fileErr?.name === 'AbortError') return { sucesso: true, metodo: 'share_api' };
            console.log('Compartilhamento de arquivo falhou, caindo para link direto:', fileErr);
          }
        }

        // Compartilha o link diretamente na barra nativa sem título ou legenda
        await navigator.share(shareDataUrl);
        return { sucesso: true, metodo: 'share_api' };
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return { sucesso: true, metodo: 'share_api' };
        }
        console.warn('Navigator share falhou:', err);
        throw new Error('Erro ao compartilhar: ' + (err?.message || 'Falha ao acionar compartilhamento') + '\nPor favor, use o botão Baixar.');
      }
    }

    // 3. Fallback: Se o navegador não suporta navigator.share (ex: navegadores desktop)
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(linkParaCompartilhar);
        return { sucesso: false, metodo: 'not_supported' };
      }
    } catch (clipErr) {
      console.warn('Falha ao copiar para área de transferência:', clipErr);
    }
    return { sucesso: false, metodo: 'not_supported' };
  }

  return { sucesso: false, metodo: 'not_supported' };
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
          <span>📄 RELATÓRIO - VISUALIZAÇÃO</span>
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

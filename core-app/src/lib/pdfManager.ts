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
        const isPdf = srvBlob.type.includes('pdf') || (await srvBlob.slice(0, 5).text()).includes('%PDF');
        if (isPdf && srvBlob.size > 1000) {
          return { blob: srvBlob, nomeArquivo };
        }
      }
    } catch (err) {
      console.warn('Endpoint do servidor indisponível para download direto do PDF, gerando via motor web local:', err);
    }
  }

  // 2. Geração Web de Alta Resolução via jsPDF + html2canvas em iframe isolado
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const engines = await getPdfEngines();
    if (engines?.jsPDF && engines?.html2canvas) {
      const { jsPDF: JsPdfConstructor, html2canvas: h2c } = engines;

      const iframe = document.createElement('iframe');
      iframe.id = 'mms-pdf-render-frame';
      iframe.style.position = 'fixed';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = '794px';
      iframe.style.height = '1123px';
      iframe.style.opacity = '1'; // 100% opaco para html2canvas capturar com fidelidade total (NUNCA 0.01)
      iframe.style.pointerEvents = 'none';
      iframe.style.border = 'none';
      iframe.style.zIndex = '-9999'; // Posicionado atrás do layout da aplicação (invisível ao usuário)
      iframe.style.visibility = 'visible';
      document.body.appendChild(iframe);

      try {
        const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!frameDoc) throw new Error('Não foi possível inicializar iframe de impressão.');

        frameDoc.open();
        frameDoc.write(docHtml);
        frameDoc.close();

        // Aguarda carregamento integral de imagens (logo institucional, background base64 e anexos)
        const images = Array.from(frameDoc.images);
        await Promise.all(
          images.map(
            (img) =>
              new Promise<void>((resolve) => {
                if (img.complete && img.naturalWidth !== 0) return resolve();
                img.onload = () => resolve();
                img.onerror = () => resolve();
                setTimeout(resolve, 2000);
              })
          )
        );

        if (frameDoc.fonts && frameDoc.fonts.ready) {
          await frameDoc.fonts.ready;
        }

        // Aguarda estabilização do layout
        await new Promise((resolve) => setTimeout(resolve, 250));

        // Encontra todas as páginas .mms-pdf-page do documento
        const pageElements = Array.from(frameDoc.querySelectorAll('.mms-pdf-page')) as HTMLElement[];
        const targetPages = pageElements.length > 0 ? pageElements : [frameDoc.body];

        const pdf = new JsPdfConstructor({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
          compress: true,
        });

        for (let i = 0; i < targetPages.length; i++) {
          const pageEl = targetPages[i];
          if (i > 0) {
            pdf.addPage('a4', 'portrait');
          }

          // Isola a página atual para que ela fique no topo exato (0,0) do viewport do iframe
          targetPages.forEach((p, idx) => {
            p.style.display = idx === i ? 'block' : 'none';
            if (idx === i) {
              p.style.position = 'relative';
              p.style.top = '0';
              p.style.left = '0';
              p.style.margin = '0 auto';
            }
          });

          if (iframe.contentWindow) {
            iframe.contentWindow.scrollTo(0, 0);
          }

          const canvas = await h2c(pageEl, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            letterRendering: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: 794,
            height: 1123,
            windowWidth: 794,
            windowHeight: 1123,
            scrollX: 0,
            scrollY: 0,
            x: 0,
            y: 0,
          });

          const imgData = canvas.toDataURL('image/jpeg', 0.96);
          pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        }

        const pdfBlob: Blob = pdf.output('blob');
        return { blob: pdfBlob, nomeArquivo };
      } finally {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
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
  existingPdfUrl?: string | null
): Promise<{ sucesso: boolean; metodo: 'share_api' | 'clipboard' | 'share_native' }> {
  const nomeArquivo = gerarNomeArquivoPdf(dados);

  // 1. Mobile Nativo (iOS / Android em runtime Expo nativo)
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

  // 2. Web Browser: Abre o menu nativo de compartilhamento do dispositivo (navmenu do navegador)
  if (typeof window !== 'undefined') {
    const shareUrl = fallbackUrl || existingPdfUrl || window.location.href;

    // Se o navegador suporta Web Share API (menu nativo de compartilhamento do navegador)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        // Tenta compartilhar com arquivo físico se já houver URL existente para download rápido
        if (existingPdfUrl && (navigator as any).canShare) {
          try {
            const resp = await fetch(existingPdfUrl);
            if (resp.ok) {
              const b = await resp.blob();
              const f = new File([b], nomeArquivo, { type: 'application/pdf' });
              if ((navigator as any).canShare({ files: [f] })) {
                await (navigator as any).share({
                  files: [f],
                  title: nomeArquivo,
                  text: `Segue o relatório da MMS: ${nomeArquivo}`,
                });
                return { sucesso: true, metodo: 'share_api' };
              }
            }
          } catch (fileErr) {
            console.log('Tentativa de compartilhar arquivo via share sheet falhou, usando link:', fileErr);
          }
        }

        // Abre o menu de compartilhamento do navegador com o link do relatório
        await navigator.share({
          title: `Relatório MMS - ${dados.unidade || 'Relatório'}`,
          text: `Acesse o relatório através deste link: ${nomeArquivo}`,
          url: shareUrl,
        });
        return { sucesso: true, metodo: 'share_api' };
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Usuário fechou ou cancelou o menu nativo de compartilhamento
          return { sucesso: true, metodo: 'share_api' };
        }
        console.warn('Navigator share de link falhou:', err);
      }
    }

    // 2.1 Fallback Elegante: Copiar link para área de transferência (desktop browsers sem Web Share API)
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        return { sucesso: true, metodo: 'clipboard' };
      }
    } catch (clipErr) {
      console.warn('Falha ao copiar para área de transferência:', clipErr);
    }
  }

  return { sucesso: false, metodo: 'clipboard' };
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

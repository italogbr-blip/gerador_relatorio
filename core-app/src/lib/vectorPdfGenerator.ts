import { jsPDF } from 'jspdf';
import { PDF_BACKGROUND_BASE64, PDF_LOGO_BASE64 } from './pdfAssets';
import { ReportPdfData } from './pdfHtmlGenerator';

function formatarData(val?: string): string {
  if (!val) return 'N/A';
  const parts = val.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : val;
}

function cleanHtmlTags(str?: string): string {
  if (!str) return '';
  return str
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div>/gi, '\n')
    .replace(/<\/div>/gi, '')
    .replace(/<p>/gi, '\n')
    .replace(/<\/p>/gi, '')
    .replace(/&bull;/g, '•')
    .replace(/▪/g, '•')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\r/g, '');
}

/**
 * Mede as dimensões naturais de uma imagem base64 ou URL
 */
async function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve({ width: 800, height: 600 });
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width || 800,
        height: img.naturalHeight || img.height || 600,
      });
    };
    img.onerror = () => {
      resolve({ width: 800, height: 600 });
    };
    img.src = src;
  });
}

/**
 * Gerador de PDF 100% Vetorial Nativo (DomPDF-equivalent em TypeScript/Client-side).
 * Renderiza textos em fontes vetoriais selecionáveis, linhas e tabelas matemáticas
 * com nitidez infinita em qualquer nível de zoom, emulando fielmente o motor DomPDF.
 */
export async function gerarVectorPdf(data: ReportPdfData): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 15;
  const contentWidth = 180;
  const maxY = 265;

  let pageCount = 0;

  function drawBackgroundAndHeader() {
    pageCount++;
    if (PDF_BACKGROUND_BASE64) {
      try {
        doc.addImage(PDF_BACKGROUND_BASE64, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
      } catch (e) {
        console.warn('Erro ao carregar background vetorial:', e);
      }
    }
    if (PDF_LOGO_BASE64) {
      try {
        doc.addImage(PDF_LOGO_BASE64, 'JPEG', marginX, 6, 21.5, 21.5, undefined, 'FAST');
      } catch (e) {
        console.warn('Erro ao carregar logo no cabeçalho:', e);
      }
    }
  }

  function drawFooter(pageNumber: number) {
    doc.setFont('times', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);

    const f1 = 'Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072';
    const f2 = 'E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020';

    doc.text(f1, 105, 284, { align: 'center' });
    doc.text(f2, 105, 288.5, { align: 'center' });

    doc.text(String(pageNumber), 195, 288.5, { align: 'right' });
  }

  // Página 1
  drawBackgroundAndHeader();

  // Título Centralizado com Sublinhado Vetorial
  doc.setFont('times', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(0, 0, 0);
  const titulo = 'RELATÓRIO DE TROCA DE TURMA';
  doc.text(titulo, 105, 28, { align: 'center' });
  const tW = doc.getTextWidth(titulo);
  doc.setLineWidth(0.35);
  doc.setDrawColor(0, 0, 0);
  doc.line(105 - tW / 2, 29.5, 105 + tW / 2, 29.5);

  let curY = 36;
  const fontSizeCorpo = 11;
  const lineHeight = 5.6;

  function renderRow(label: string, value?: string) {
    doc.setFont('times', 'bold');
    doc.setFontSize(fontSizeCorpo);
    doc.text(label, marginX, curY);
    const lW = doc.getTextWidth(label + ' ');
    doc.setFont('times', 'normal');
    doc.text(value || 'N/A', marginX + lW, curY);
    curY += lineHeight;
  }

  renderRow('Unidade:', (data.unidade || 'N/A').toUpperCase());
  renderRow('Data:', formatarData(data.data));
  renderRow('Local:', data.local || 'N/A');
  renderRow('Modal:', data.modal || 'Helicóptero');

  // Horários de Saída do Hotel (Previsto e Real)
  curY += 1;
  doc.setFont('times', 'bold');
  doc.setFontSize(fontSizeCorpo);
  doc.text('Horário de Saída do Hotel (Previsto e Real):', marginX, curY);
  curY += 5.0;

  const saidasList = data.horarios?.saida_hotel || [];
  if (data.semSaida || saidasList.length === 0) {
    doc.setFont('times', 'normal');
    doc.text('N/A', marginX + 7, curY);
    curY += 5.0;
  } else {
    for (const item of saidasList) {
      const l1 = item.label1 || 'Previsto';
      const l2 = item.label2 || 'Real';
      const h1 = item.h1 || '';
      const m1 = item.m1 || '';
      const h2 = item.h2 || '';
      const m2 = item.m2 || '';

      const part1 =
        h1.toUpperCase() === 'N/A' || h1.toUpperCase() === 'N'
          ? 'N/A'
          : h1
          ? `${h1} h ${m1} min`
          : 'N/A';
      const part2 =
        h2.toUpperCase() === 'N/A' || h2.toUpperCase() === 'N'
          ? 'N/A'
          : h2
          ? `${h2} h ${m2} min`
          : 'N/A';

      doc.setFont('times', 'bold');
      doc.text(`${l1}:`, marginX + 7, curY);
      const w1 = doc.getTextWidth(`${l1}: `);
      doc.setFont('times', 'normal');
      doc.text(part1, marginX + 7 + w1, curY);

      doc.setFont('times', 'bold');
      doc.text(`${l2}:`, 78, curY);
      const w2 = doc.getTextWidth(`${l2}: `);
      doc.setFont('times', 'normal');
      doc.text(part2, 78 + w2, curY);
      curY += 4.8;
    }
  }

  // Horários de Embarque (Previsto e Real)
  curY += 1;
  doc.setFont('times', 'bold');
  doc.setFontSize(fontSizeCorpo);
  doc.text('Horários de Embarque (Previsto e Real):', marginX, curY);
  curY += 5.0;

  const embPrevRaw = data.semEmbarquePrev ? 'N/A' : data.horarios?.embarque_previsto || 'N/A';
  const embRealRaw = data.semEmbarque ? 'N/A' : data.horarios?.embarque_real || 'N/A';

  const embPrevFmt =
    embPrevRaw !== 'N/A' && embPrevRaw !== ':' && !embPrevRaw.toUpperCase().includes('N')
      ? embPrevRaw.replace(':', ' h ') + ' min'
      : 'N/A';
  const embRealFmt =
    embRealRaw !== 'N/A' && embRealRaw !== ':' && !embRealRaw.toUpperCase().includes('N')
      ? embRealRaw.replace(':', ' h ') + ' min'
      : 'N/A';

  doc.setFont('times', 'bold');
  doc.text('Previsto:', marginX + 7, curY);
  const epW = doc.getTextWidth('Previsto: ');
  doc.setFont('times', 'normal');
  doc.text(embPrevFmt, marginX + 7 + epW, curY);

  doc.setFont('times', 'bold');
  doc.text('Real:', 78, curY);
  const erW = doc.getTextWidth('Real: ');
  doc.setFont('times', 'normal');
  doc.text(embRealFmt, 78 + erW, curY);
  curY += 5.6;

  // Horário Inicial e de Finalização
  curY += 1;
  doc.setFont('times', 'bold');
  doc.setFontSize(fontSizeCorpo);
  doc.text('Horário Inicial e de Finalização:', marginX, curY);
  curY += 5.0;

  const atIniRaw = data.horarios?.atendimento_inicio || 'N/A';
  const atFimRaw = data.horarios?.atendimento_fim || 'N/A';
  const atIniFmt =
    atIniRaw !== 'N/A' && atIniRaw !== ':' ? atIniRaw.replace(':', ' h ') + ' min' : 'N/A';
  const atFimFmt =
    atFimRaw !== 'N/A' && atFimRaw !== ':' ? atFimRaw.replace(':', ' h ') + ' min' : 'N/A';

  doc.setFont('times', 'bold');
  doc.text('Início:', marginX + 7, curY);
  let pos = marginX + 7 + doc.getTextWidth('Início: ');
  doc.setFont('times', 'normal');
  doc.text(atIniFmt, pos, curY);
  pos += doc.getTextWidth(atIniFmt + '   ');
  doc.setFont('times', 'normal');
  doc.text('às', pos, curY);
  pos += doc.getTextWidth('às   ');
  doc.setFont('times', 'bold');
  doc.text('Fim:', pos, curY);
  pos += doc.getTextWidth('Fim: ');
  doc.setFont('times', 'normal');
  doc.text(atFimFmt, pos, curY);
  curY += 5.6;

  // Nome do Preposto
  curY += 1;
  renderRow('Nome do Preposto:', data.preposto || 'N/A');

  // Informações sobre a troca de turma
  curY += 1;
  doc.setFont('times', 'bold');
  doc.setFontSize(fontSizeCorpo);
  doc.text('Informações sobre a troca de turma:', marginX, curY);
  curY += 5.0;

  const rawInfo = data.info_troca || data.info || 'N/A';
  const cleanInfo = cleanHtmlTags(rawInfo);
  const infoLines = cleanInfo.split('\n');

  doc.setFont('times', 'normal');
  doc.setFontSize(fontSizeCorpo);

  for (const line of infoLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      curY += 2.5;
      continue;
    }
    const wrapped = doc.splitTextToSize(trimmed, contentWidth);
    for (const wLine of wrapped) {
      if (curY > maxY - 15) {
        doc.addPage();
        drawBackgroundAndHeader();
        curY = 36;
      }
      doc.text(wLine, marginX, curY);
      curY += 4.8;
    }
  }

  // Tabela de Passageiros (PAX)
  curY += 4;
  if (curY > maxY - 25) {
    doc.addPage();
    drawBackgroundAndHeader();
    curY = 36;
  }

  const tableStartY = curY;
  const col1X = marginX;
  const col1Width = 84;
  const dividerX = marginX + col1Width + 2; // ~101mm
  const col2X = dividerX + 4; // ~105mm
  const col2Width = 86;

  doc.setFont('times', 'bold');
  doc.setFontSize(12.5);
  doc.text('Nomes Passageiros Embarcando:', col1X, curY);
  doc.text('Nomes Passageiros Desembarcados:', col2X, curY);
  curY += 6.5;

  const rawPax1 = cleanHtmlTags(data.pax_embarcando || data.pax1 || '').split('\n');
  const rawPax2 = cleanHtmlTags(data.pax_desembarcando || data.pax2 || '').split('\n');
  const maxPax = Math.max(rawPax1.length, rawPax2.length, 1);

  doc.setFont('times', 'normal');
  doc.setFontSize(fontSizeCorpo);

  let paxTableEndY = curY;

  for (let i = 0; i < maxPax; i++) {
    const p1 = (rawPax1[i] || '').trim();
    const p2 = (rawPax2[i] || '').trim();

    if (curY > maxY - 10) {
      // Desenha linha divisória da página anterior antes de quebrar
      doc.setDrawColor(204, 204, 204);
      doc.setLineWidth(0.3);
      doc.line(dividerX, tableStartY + 2, dividerX, curY);

      doc.addPage();
      drawBackgroundAndHeader();
      curY = 36;
      doc.setFont('times', 'bold');
      doc.setFontSize(12.5);
      doc.text('Nomes Passageiros Embarcando:', col1X, curY);
      doc.text('Nomes Passageiros Desembarcados:', col2X, curY);
      curY += 6.5;
      doc.setFont('times', 'normal');
      doc.setFontSize(fontSizeCorpo);
    }

    if (p1) {
      const cleanP1 = p1.replace(/\*/g, '');
      const wrappedP1 = doc.splitTextToSize(cleanP1, col1Width);
      doc.text(wrappedP1[0] || cleanP1, col1X, curY);
    }
    if (p2) {
      const cleanP2 = p2.replace(/\*/g, '');
      const wrappedP2 = doc.splitTextToSize(cleanP2, col2Width);
      doc.text(wrappedP2[0] || cleanP2, col2X, curY);
    }
    curY += 4.8;
    paxTableEndY = curY;
  }

  // Linha divisória vertical entre colunas
  doc.setDrawColor(204, 204, 204);
  doc.setLineWidth(0.3);
  doc.line(dividerX, tableStartY + 2, dividerX, paxTableEndY);

  // Anexos Fotográficos (Cada anexo ocupa uma nova página dedicada)
  const fotos = data.fotos || [];
  for (const foto of fotos) {
    const imgSrc = foto.base64 || foto.url || foto.uri;
    if (!imgSrc) continue;

    doc.addPage();
    drawBackgroundAndHeader();

    const fotoTitulo = foto.titulo || 'ANEXO FOTOGRÁFICO';
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text(fotoTitulo, 105, 25, { align: 'center' });
    const ftW = doc.getTextWidth(fotoTitulo);
    doc.setLineWidth(0.35);
    doc.setDrawColor(0, 0, 0);
    doc.line(105 - ftW / 2, 26.5, 105 + ftW / 2, 26.5);

    try {
      const dims = await getImageDimensions(imgSrc);
      const maxW = 180;
      const maxH = 220;
      let w = maxW;
      let h = (dims.height / dims.width) * maxW;

      if (h > maxH) {
        h = maxH;
        w = (dims.width / dims.height) * maxH;
      }

      const imgX = 15 + (maxW - w) / 2;
      const imgY = 35 + (maxH - h) / 2;

      const isPng = imgSrc.startsWith('data:image/png') || imgSrc.toLowerCase().endsWith('.png');
      const format = isPng ? 'PNG' : 'JPEG';

      doc.addImage(imgSrc, format, imgX, imgY, w, h, undefined, 'FAST');
    } catch (err) {
      console.warn('Erro ao inserir foto no PDF:', err);
    }
  }

  // Desenha os rodapés fixos em todas as páginas
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p);
  }

  return doc;
}

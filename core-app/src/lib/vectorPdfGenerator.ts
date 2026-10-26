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
 * Gerador de PDF 100% Vetorial Nativo idêntico ao DomPDF original em PHP.
 * Medidas e posições extraídas diretamente do binário do DomPDF oficial:
 * - A4: 210mm x 297mm (595.28pt x 841.89pt)
 * - Margem esquerda: 15.0mm (42.52pt)
 * - Logo: x=15.0mm, y=5.0mm, w=21.17mm (60pt), h=21.17mm (60pt)
 * - Título: y=32.0mm, x=105.0mm (centralizado), fonte 12.0pt bold, sublinhado
 * - Corpo: fonte 10.5pt, entrelinha de 6.25mm
 * - Tabela PAX: Embarcando x=15.26mm, divisória x=97.67mm, Desembarcados x=107.06mm
 * - Rodapé fixo: y=283.72mm e 288.12mm, fonte 10.5pt bold
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
  const marginX = 15.0; // 42.52 pt
  const contentWidth = 180.0;
  const maxY = 265.0;

  function drawBackgroundAndLogo() {
    if (PDF_BACKGROUND_BASE64) {
      try {
        doc.addImage(PDF_BACKGROUND_BASE64, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
      } catch (e) {
        console.warn('Erro ao carregar background vetorial:', e);
      }
    }
    if (PDF_LOGO_BASE64) {
      try {
        // Logo oficial Dompdf: 60pt x 60pt (21.17mm x 21.17mm) at x=15.0mm, y=5.0mm
        doc.addImage(PDF_LOGO_BASE64, 'JPEG', 15.0, 5.0, 21.17, 21.17, undefined, 'FAST');
      } catch (e) {
        console.warn('Erro ao carregar logo no cabeçalho:', e);
      }
    }
  }

  function drawFooter(pageNumber: number) {
    doc.setFont('times', 'bold');
    doc.setFontSize(10.5); // 10.5 pt oficial Dompdf
    doc.setTextColor(0, 0, 0);

    const f1 = 'Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072';
    const f2 = 'E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020';

    // Coordenadas exatas do Dompdf: 283.72mm e 288.12mm
    doc.text(f1, 105.0, 283.72, { align: 'center' });
    doc.text(f2, 105.0, 288.12, { align: 'center' });

    // Número da página na direita
    doc.text(String(pageNumber), 195.0, 288.12, { align: 'right' });
  }

  // Página 1
  drawBackgroundAndLogo();

  // Título Centralizado com Sublinhado Vetorial (Dompdf: 12.0pt bold, y=32.0mm)
  doc.setFont('times', 'bold');
  doc.setFontSize(12.0);
  doc.setTextColor(0, 0, 0);
  const titulo = 'RELATÓRIO DE TROCA DE TURMA';
  doc.text(titulo, 105.0, 32.0, { align: 'center' });
  const tW = doc.getTextWidth(titulo);
  doc.setLineWidth(0.26); // 0.75 pt oficial Dompdf
  doc.setDrawColor(0, 0, 0);
  doc.line(105.0 - tW / 2, 32.93, 105.0 + tW / 2, 32.93);

  let curY = 41.55; // y exato de Unidade: no Dompdf
  const fontSizeCorpo = 10.5; // 10.5 pt oficial Dompdf
  const lineHeight = 6.25; // 17.72 pt oficial Dompdf

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
  doc.setFont('times', 'bold');
  doc.setFontSize(fontSizeCorpo);
  doc.text('Horário de Saída do Hotel (Previsto e Real):', marginX, curY);
  curY += lineHeight;

  const saidasList = data.horarios?.saida_hotel || [];
  if (data.semSaida || saidasList.length === 0) {
    doc.setFont('times', 'normal');
    doc.text('N/A', 20.29, curY); // Indentação exata de 20.29mm (57.52pt)
    curY += lineHeight;
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
      doc.text(`${l1}:`, 20.29, curY);
      const w1 = doc.getTextWidth(`${l1}: `);
      doc.setFont('times', 'normal');
      doc.text(`${part1}     `, 20.29 + w1, curY);

      const realColX = 20.29 + w1 + doc.getTextWidth(`${part1}     `);
      doc.setFont('times', 'bold');
      doc.text(`${l2}:`, realColX, curY);
      const w2 = doc.getTextWidth(`${l2}: `);
      doc.setFont('times', 'normal');
      doc.text(part2, realColX + w2, curY);
      curY += 5.6;
    }
    curY += 1.0;
  }

  // Horários de Embarque (Previsto e Real)
  doc.setFont('times', 'bold');
  doc.setFontSize(fontSizeCorpo);
  doc.text('Horários de Embarque (Previsto e Real):', marginX, curY);
  curY += lineHeight;

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
  doc.text('Previsto:', 20.29, curY);
  const epW = doc.getTextWidth('Previsto: ');
  doc.setFont('times', 'normal');
  doc.text(`${embPrevFmt}     `, 20.29 + epW, curY);

  const embRealX = 20.29 + epW + doc.getTextWidth(`${embPrevFmt}     `);
  doc.setFont('times', 'bold');
  doc.text('Real:', embRealX, curY);
  const erW = doc.getTextWidth('Real: ');
  doc.setFont('times', 'normal');
  doc.text(embRealFmt, embRealX + erW, curY);
  curY += lineHeight;

  // Horário Inicial e de Finalização
  doc.setFont('times', 'bold');
  doc.setFontSize(fontSizeCorpo);
  doc.text('Horário Inicial e de Finalização:', marginX, curY);
  curY += lineHeight;

  const atIniRaw = data.horarios?.atendimento_inicio || 'N/A';
  const atFimRaw = data.horarios?.atendimento_fim || 'N/A';
  const atIniFmt =
    atIniRaw !== 'N/A' && atIniRaw !== ':' ? atIniRaw.replace(':', ' h ') + ' min' : 'N/A';
  const atFimFmt =
    atFimRaw !== 'N/A' && atFimRaw !== ':' ? atFimRaw.replace(':', ' h ') + ' min' : 'N/A';

  doc.setFont('times', 'bold');
  doc.text('Início:', 20.29, curY);
  let pos = 20.29 + doc.getTextWidth('Início: ');
  doc.setFont('times', 'normal');
  doc.text(`${atIniFmt}  às  `, pos, curY);
  pos += doc.getTextWidth(`${atIniFmt}  às  `);
  doc.setFont('times', 'bold');
  doc.text('Fim:', pos, curY);
  pos += doc.getTextWidth('Fim: ');
  doc.setFont('times', 'normal');
  doc.text(atFimFmt, pos, curY);
  curY += lineHeight;

  // Nome do Preposto
  renderRow('Nome do Preposto:', data.preposto || 'N/A');

  // Informações sobre a troca de turma
  doc.setFont('times', 'bold');
  doc.setFontSize(fontSizeCorpo);
  doc.text('Informações sobre a troca de turma:', marginX, curY);
  curY += lineHeight;

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
        drawBackgroundAndLogo();
        curY = 32.0;
      }
      doc.text(wLine, marginX, curY);
      curY += 5.2;
    }
  }

  // Tabela de Passageiros (PAX)
  // Dompdf: Embarcando x=15.26mm, Divisória x=97.67mm, Desembarcados x=107.06mm
  curY += 6.0;
  if (curY > maxY - 25) {
    doc.addPage();
    drawBackgroundAndLogo();
    curY = 32.0;
  }

  const tableStartY = curY;
  const col1X = 15.26; // 43.27 pt
  const col1Width = 78.0;
  const dividerX = 97.67; // 276.85 pt
  const col2X = 107.06; // 303.48 pt
  const col2Width = 84.0;
  const paxRowHeight = 5.66; // 16.05 pt

  doc.setFont('times', 'bold');
  doc.setFontSize(12.0); // 12.0 pt oficial Dompdf
  doc.text('Nomes Passageiros Embarcando:', col1X, curY);
  doc.text('Nomes Passageiros Desembarcados:', col2X, curY);
  curY += 6.5;

  const rawPax1 = cleanHtmlTags(data.pax_embarcando || data.pax1 || '').split('\n');
  const rawPax2 = cleanHtmlTags(data.pax_desembarcando || data.pax2 || '').split('\n');
  const maxPax = Math.max(rawPax1.length, rawPax2.length, 1);

  doc.setFont('times', 'normal');
  doc.setFontSize(fontSizeCorpo); // 10.5 pt

  let paxTableEndY = curY;

  for (let i = 0; i < maxPax; i++) {
    const p1 = (rawPax1[i] || '').trim();
    const p2 = (rawPax2[i] || '').trim();

    if (curY > maxY - 10) {
      // Desenha linha divisória da página anterior antes de quebrar
      doc.setDrawColor(204, 204, 204);
      doc.setLineWidth(0.3);
      doc.line(dividerX, tableStartY - 1.5, dividerX, curY);

      doc.addPage();
      drawBackgroundAndLogo();
      curY = 32.0;
      doc.setFont('times', 'bold');
      doc.setFontSize(12.0);
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
    curY += paxRowHeight;
    paxTableEndY = curY;
  }

  // Linha divisória vertical entre colunas
  doc.setDrawColor(204, 204, 204);
  doc.setLineWidth(0.3);
  doc.line(dividerX, tableStartY - 1.5, dividerX, paxTableEndY);

  // Anexos Fotográficos (Cada anexo ocupa uma nova página dedicada)
  const fotos = data.fotos || [];
  for (const foto of fotos) {
    const imgSrc = foto.base64 || foto.url || foto.uri;
    if (!imgSrc) continue;

    doc.addPage();
    drawBackgroundAndLogo();

    const fotoTitulo = foto.titulo || 'ANEXO FOTOGRÁFICO';
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text(fotoTitulo, 105.0, 25.0, { align: 'center' });
    const ftW = doc.getTextWidth(fotoTitulo);
    doc.setLineWidth(0.35);
    doc.setDrawColor(0, 0, 0);
    doc.line(105.0 - ftW / 2, 26.5, 105.0 + ftW / 2, 26.5);

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

      const imgX = 15.0 + (maxW - w) / 2;
      const imgY = 35.0 + (maxH - h) / 2;

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

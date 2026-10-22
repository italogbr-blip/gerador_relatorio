import { PDF_BACKGROUND_BASE64, PDF_LOGO_BASE64 } from './pdfAssets';

export interface ReportPdfData {
  grupo?: string;
  unidade: string;
  data: string;
  local: string;
  modal: string;
  preposto: string;
  observacao?: string;
  observacao_nome_arquivo?: string;
  semSaida?: boolean;
  semEmbarquePrev?: boolean;
  semEmbarque?: boolean;
  horarios?: {
    saida_hotel?: Array<{
      id?: string;
      label1?: string;
      h1?: string;
      m1?: string;
      label2?: string;
      h2?: string;
      m2?: string;
    }>;
    embarque_previsto?: string;
    embarque_real?: string;
    atendimento_inicio?: string;
    atendimento_fim?: string;
  };
  info_troca?: string;
  info?: string;
  pax_embarcando?: string;
  pax1?: string;
  pax_desembarcando?: string;
  pax2?: string;
  fotos?: Array<{
    id?: number | string;
    uri?: string;
    url?: string;
    base64?: string;
    titulo?: string;
  }>;
  alinhamentoInfo?: 'left' | 'justify';
}

function formatarDataPdf(val: string): string {
  if (!val) return 'N/A';
  const parts = val.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return val;
}

function formatarTextoInfo(text: string): string {
  if (!text || text.trim() === '' || text === '<br>' || text === '<div><br></div>') {
    return 'N/A';
  }

  let clean = text
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<div><br><\/div>/gi, '<br>')
    .replace(/<div>/gi, '<br>')
    .replace(/<\/div>/gi, '')
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '<br>')
    .replace(/\*(.*?)\*/g, '<b>$1</b>')
    .replace(/_(.*?)_/g, '<i>$1</i>')
    .replace(/\[(.*?)\]/g, '<u>$1</u>')
    .replace(/▪/g, '&bull;')
    .replace(/\n/g, '<br>');

  return clean;
}

function formatarLinhasPax(lines: string[]): string {
  if (!lines || lines.length === 0) {
    return '<i>Nenhum passageiro</i>';
  }
  return lines
    .map((l) => {
      const trimmed = l.trim();
      if (!trimmed) return "<div style='margin-bottom: 3px;'>&nbsp;</div>";
      const withBold = trimmed.replace(/\*(.*?)\*/g, '<b>$1</b>');
      return `<div style='margin-bottom: 3px; word-wrap: break-word;'>${withBold}</div>`;
    })
    .join('');
}

export function gerarHtmlPdfFidelidade(data: ReportPdfData): string {
  const unidade = (data.unidade || 'N/A').toUpperCase();
  const dataFormatada = formatarDataPdf(data.data);
  const local = data.local || 'N/A';
  const modal = data.modal || 'Helicóptero';
  const preposto = data.preposto || 'N/A';
  const alinhamento = data.alinhamentoInfo || 'left';
  const info = formatarTextoInfo(data.info_troca || data.info || '');

  // Horários de Saída do Hotel
  let saidasHtml = '';
  const saidasList = data.horarios?.saida_hotel || [];
  if (data.semSaida || saidasList.length === 0) {
    saidasHtml = 'N/A';
  } else {
    saidasHtml = saidasList
      .map((item, idx) => {
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
            : '&nbsp;&nbsp;&nbsp; h &nbsp;&nbsp;&nbsp; min';
        const part2 =
          h2.toUpperCase() === 'N/A' || h2.toUpperCase() === 'N'
            ? 'N/A'
            : h2
            ? `${h2} h ${m2} min`
            : '&nbsp;&nbsp;&nbsp; h &nbsp;&nbsp;&nbsp; min';
        const mb = idx === saidasList.length - 1 ? '0px' : '2px';
        return `<div style='margin-bottom: ${mb};'><span class='label'>${l1}:</span> ${part1} &nbsp;&nbsp;&nbsp;&nbsp; <span class='label'>${l2}:</span> ${part2}</div>`;
      })
      .join('');
  }

  // Embarque Previsto e Real
  const embPrevRaw = data.semEmbarquePrev ? 'N/A' : (data.horarios?.embarque_previsto || 'N/A');
  const embRealRaw = data.semEmbarque ? 'N/A' : (data.horarios?.embarque_real || 'N/A');
  const embPrevFormatado =
    embPrevRaw === 'N/A'
      ? 'N/A'
      : embPrevRaw.includes(':')
      ? `${embPrevRaw.split(':')[0] || '&nbsp;&nbsp;&nbsp;'} h ${embPrevRaw.split(':')[1] || '&nbsp;&nbsp;&nbsp;'} min`
      : embPrevRaw;
  const embRealFormatado =
    embRealRaw === 'N/A'
      ? 'N/A'
      : embRealRaw.includes(':')
      ? `${embRealRaw.split(':')[0] || '&nbsp;&nbsp;&nbsp;'} h ${embRealRaw.split(':')[1] || '&nbsp;&nbsp;&nbsp;'} min`
      : embRealRaw;

  // Atendimento
  const atIniRaw = data.horarios?.atendimento_inicio || 'N/A';
  const atFimRaw = data.horarios?.atendimento_fim || 'N/A';
  const atIniFormatado =
    atIniRaw === 'N/A'
      ? 'N/A'
      : atIniRaw.includes(':')
      ? `${atIniRaw.split(':')[0] || '&nbsp;&nbsp;&nbsp;'} h ${atIniRaw.split(':')[1] || '&nbsp;&nbsp;&nbsp;'} min`
      : atIniRaw;
  const atFimFormatado =
    atFimRaw === 'N/A'
      ? 'N/A'
      : atFimRaw.includes(':')
      ? `${atFimRaw.split(':')[0] || '&nbsp;&nbsp;&nbsp;'} h ${atFimRaw.split(':')[1] || '&nbsp;&nbsp;&nbsp;'} min`
      : atFimRaw;

  // Passageiros: paginação limpa entre Página 1 e continuações
  const rawPax1 = (data.pax_embarcando || data.pax1 || '').replace(/\r/g, '');
  const rawPax2 = (data.pax_desembarcando || data.pax2 || '').replace(/\r/g, '');

  const lines1 = rawPax1.trim() !== '' ? rawPax1.split('\n') : [];
  const lines2 = rawPax2.trim() !== '' ? rawPax2.split('\n') : [];
  const maxLines = Math.max(lines1.length, lines2.length);

  // Limite na página 1 (pois há cabeçalho completo, caixas de horários, preposto e info de troca)
  const LIMIT_PAGE_1 = 16;
  const LIMIT_CONT_PAGE = 28;

  const page1Lines1 = lines1.slice(0, LIMIT_PAGE_1);
  const page1Lines2 = lines2.slice(0, LIMIT_PAGE_1);
  const pax1Html = formatarLinhasPax(page1Lines1);
  const pax2Html = formatarLinhasPax(page1Lines2);

  // Páginas adicionais de passageiros caso haja quebra de página
  let paxContinuationPagesHtml = '';
  if (maxLines > LIMIT_PAGE_1) {
    let currentIdx = LIMIT_PAGE_1;
    while (currentIdx < maxLines) {
      const chunk1 = lines1.slice(currentIdx, currentIdx + LIMIT_CONT_PAGE);
      const chunk2 = lines2.slice(currentIdx, currentIdx + LIMIT_CONT_PAGE);
      const chunk1Html = formatarLinhasPax(chunk1);
      const chunk2Html = formatarLinhasPax(chunk2);

      paxContinuationPagesHtml += `
        <div class="mms-pdf-page">
          <img src="${PDF_BACKGROUND_BASE64}" class="fixed-bg" alt="MMS Background" />
          <div class="page-content">
            <div class="fixed-logo">
              <img src="${PDF_LOGO_BASE64}" alt="Logo MMS" />
            </div>
            <div class="titulo-pdf">RELATÓRIO DE TROCA DE TURMA (CONT.)</div>
            <div class="pax-container" style="margin-top: 0px;">
              <div class="pax-col-left">
                <div class="pax-title">Nomes Passageiros Embarcando (Cont.):</div>
                <div>${chunk1Html}</div>
              </div>
              <div class="pax-col-right">
                <div class="pax-title">Nomes Passageiros Desembarcados (Cont.):</div>
                <div>${chunk2Html}</div>
              </div>
              <div style="clear: both;"></div>
            </div>
            <div class="footer">
              Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072<br/>
              E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
            </div>
          </div>
        </div>
      `;
      currentIdx += LIMIT_CONT_PAGE;
    }
  }

  // Fotos
  let fotosHtml = '';
  const fotosList = data.fotos || [];
  if (fotosList.length > 0) {
    fotosList.forEach((foto, idx) => {
      const src = foto.uri || foto.url || foto.base64 || '';
      const titulo = (foto.titulo || `ANEXO FOTOGRÁFICO ${idx + 1}`).toUpperCase();
      if (src) {
        fotosHtml += `
          <div class="mms-pdf-page">
            <img src="${PDF_BACKGROUND_BASE64}" class="fixed-bg" alt="MMS Background" />
            <div class="page-content">
              <div class="fixed-logo">
                <img src="${PDF_LOGO_BASE64}" alt="Logo MMS" />
              </div>
              <div style="padding-top: 8px; text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 42px; text-decoration: underline; text-underline-offset: 4px; font-family: 'Times New Roman', Times, serif; text-transform: uppercase;">
                ${titulo}
              </div>
              <div style="text-align: center; width: 100%; margin-top: 8px; margin-bottom: 10px;">
                <img src="${src}" style="max-width: 100%; max-height: 650px; object-fit: contain; border-radius: 4px; display: block; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.08);" />
              </div>
              <div class="footer">
                Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072<br/>
                E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
              </div>
            </div>
          </div>
        `;
      }
    });
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório - ${unidade}</title>
  <style>
    @page { 
      size: A4 portrait;
      margin: 0; 
    }
    * { 
      box-sizing: border-box; 
    }
    html, body { 
      font-family: "Times New Roman", Times, "Times-Roman", serif; 
      font-size: 14px; 
      color: #000000;
      margin: 0;
      padding: 0;
      background-color: #ffffff;
      line-height: 1.35;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .mms-pdf-page {
      position: relative;
      width: 794px;
      height: 1123px;
      min-height: 1123px;
      max-height: 1123px;
      padding: 0;
      background-color: #ffffff;
      box-sizing: border-box;
      overflow: hidden;
      page-break-after: always;
      page-break-inside: avoid;
      margin: 0 auto;
    }
    .mms-pdf-page:last-child {
      page-break-after: auto;
    }
    .fixed-bg {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 794px;
      height: 1123px;
      object-fit: fill;
      z-index: 1;
      pointer-events: none;
    }
    .page-content {
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
      padding: 32px 44px 28px 44px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }
    .fixed-logo {
      position: absolute;
      top: 24px;
      left: 44px;
      width: 76px;
      height: 76px;
      z-index: 5;
    }
    .fixed-logo img {
      width: 76px;
      height: 76px;
      object-fit: contain;
      display: block;
    }
    .titulo-pdf {
      text-align: center;
      font-weight: bold;
      font-size: 16px;
      text-decoration: underline;
      text-underline-offset: 4px;
      margin-top: 6px;
      margin-bottom: 48px;
      text-transform: uppercase;
      font-family: "Times New Roman", Times, "Times-Roman", serif;
      letter-spacing: 0.5px;
    }
    .row { 
      margin-bottom: 6px; 
      font-size: 14px;
    }
    .label { 
      font-weight: bold; 
    }
    .content-box { 
      margin-left: 20px; 
      margin-top: 2px; 
      margin-bottom: 6px; 
    }
    .info-box { 
      margin-top: 2px; 
      margin-bottom: 10px; 
      margin-left: 20px; 
      line-height: 1.4;
    }
    .pax-container {
      width: 100%; 
      overflow: hidden; 
      margin-top: 14px;
    }
    .pax-col-left {
      box-sizing: border-box; 
      width: 48%; 
      float: left; 
      border-right: 1.5px solid #d1d5db; 
      padding-right: 15px; 
      overflow-wrap: break-word; 
      word-wrap: break-word;
    }
    .pax-col-right {
      box-sizing: border-box; 
      width: 48%; 
      float: right; 
      padding-left: 15px; 
      overflow-wrap: break-word; 
      word-wrap: break-word;
    }
    .pax-title {
      font-weight: bold;
      font-size: 15px;
      margin-bottom: 8px;
    }
    .footer {
      margin-top: auto;
      text-align: center;
      font-size: 12px;
      font-weight: bold;
      color: #000000;
      line-height: 1.35;
      font-family: "Times New Roman", Times, serif;
      padding-bottom: 4px;
    }
    @media print {
      body { background: transparent !important; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="mms-pdf-page">
    <img src="${PDF_BACKGROUND_BASE64}" class="fixed-bg" alt="MMS Background" />
    <div class="page-content">
      <div class="fixed-logo">
        <img src="${PDF_LOGO_BASE64}" alt="Logo MMS" />
      </div>
      <div class="titulo-pdf">RELATÓRIO DE TROCA DE TURMA</div>

      <div class="row"><span class="label">Unidade:</span> ${unidade}</div>
      <div class="row"><span class="label">Data:</span> ${dataFormatada}</div>
      <div class="row"><span class="label">Local:</span> ${local}</div>
      <div class="row"><span class="label">Modal:</span> ${modal}</div>

      <div class="row" style="margin-top: 4px; margin-bottom: 2px;"><span class="label">Horário de Saída do Hotel (Previsto e Real):</span></div>
      <div class="content-box">
        ${saidasHtml}
      </div>

      <div class="row" style="margin-top: 4px; margin-bottom: 2px;"><span class="label">Horários de Embarque (Previsto e Real):</span></div>
      <div class="content-box">
        <span class="label">Previsto:</span> ${embPrevFormatado} &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Real:</span> ${embRealFormatado}
      </div>

      <div class="row" style="margin-top: 4px; margin-bottom: 2px;"><span class="label">Horário Inicial e de Finalização:</span></div>
      <div class="content-box">
        <span class="label">Início:</span> ${atIniFormatado} &nbsp;&nbsp; às &nbsp;&nbsp; <span class="label">Fim:</span> ${atFimFormatado}
      </div>

      <div class="row" style="margin-top: 4px;"><span class="label">Nome do Preposto:</span> ${preposto}</div>

      <div class="row" style="margin-top: 4px; margin-bottom: 2px;"><span class="label">Informações sobre a troca de turma:</span></div>
      <div class="info-box" style="text-align: ${alinhamento};">
        ${info}
      </div>

      <div class="pax-container">
        <div class="pax-col-left">
          <div class="pax-title">Nomes Passageiros Embarcando:</div>
          <div>${pax1Html}</div>
        </div>
        <div class="pax-col-right">
          <div class="pax-title">Nomes Passageiros Desembarcados:</div>
          <div>${pax2Html}</div>
        </div>
        <div style="clear: both;"></div>
      </div>

      <div class="footer">
        Rua Coronel Sizenando De Souza 522 – Visconde Macaé RJ – CEP 27.943-072<br/>
        E-Mail: mm.suportelogistica@hotmail.com Tel.: (22) 2021-7020
      </div>
    </div>
  </div>

  ${paxContinuationPagesHtml}

  ${fotosHtml}
</body>
</html>`;
}

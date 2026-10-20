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

function formatarPax(text: string): string {
  if (!text || text.trim() === '') {
    return '<i>Nenhum passageiro</i>';
  }
  const lines = text.split('\n');
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
  if (saidasList.length > 0) {
    saidasHtml = saidasList
      .map((item) => {
        const l1 = item.label1 || 'Previsto';
        const l2 = item.label2 || 'Real';
        const h1 = item.h1 || '00';
        const m1 = item.m1 || '00';
        const h2 = item.h2 || '00';
        const m2 = item.m2 || '00';
        const part1 = h1 === 'N/A' ? 'N/A' : `${h1} h ${m1} min`;
        const part2 = h2 === 'N/A' ? 'N/A' : `${h2} h ${m2} min`;
        return `<div style='margin-bottom: 4px;'><span class='label'>${l1}:</span> ${part1} &nbsp;&nbsp;&nbsp;&nbsp; <span class='label'>${l2}:</span> ${part2}</div>`;
      })
      .join('');
  } else {
    saidasHtml = 'N/A';
  }

  // Embarque Previsto e Real
  const embPrevRaw = data.horarios?.embarque_previsto || 'N/A';
  const embRealRaw = data.horarios?.embarque_real || 'N/A';
  const embPrevFormatado =
    embPrevRaw !== 'N/A' && embPrevRaw.includes(':')
      ? `${embPrevRaw.split(':')[0]} h ${embPrevRaw.split(':')[1]} min`
      : embPrevRaw;
  const embRealFormatado =
    embRealRaw !== 'N/A' && embRealRaw.includes(':')
      ? `${embRealRaw.split(':')[0]} h ${embRealRaw.split(':')[1]} min`
      : embRealRaw;

  // Atendimento
  const atIniRaw = data.horarios?.atendimento_inicio || 'N/A';
  const atFimRaw = data.horarios?.atendimento_fim || 'N/A';
  const atIniFormatado =
    atIniRaw !== 'N/A' && atIniRaw.includes(':')
      ? `${atIniRaw.split(':')[0]} h ${atIniRaw.split(':')[1]} min`
      : atIniRaw;
  const atFimFormatado =
    atFimRaw !== 'N/A' && atFimRaw.includes(':')
      ? `${atFimRaw.split(':')[0]} h ${atFimRaw.split(':')[1]} min`
      : atFimRaw;

  // Passageiros
  const pax1Html = formatarPax(data.pax_embarcando || data.pax1 || '');
  const pax2Html = formatarPax(data.pax_desembarcando || data.pax2 || '');

  // Fotos
  let fotosHtml = '';
  const fotosList = data.fotos || [];
  if (fotosList.length > 0) {
    fotosList.forEach((foto, idx) => {
      const src = foto.uri || foto.url || foto.base64 || '';
      const titulo = (foto.titulo || `ANEXO FOTOGRÁFICO ${idx + 1}`).toUpperCase();
      if (src) {
        fotosHtml += `
          <div class="mms-pdf-page" style="page-break-before: always;">
            <img src="${PDF_BACKGROUND_BASE64}" class="fixed-bg" alt="MMS Background" />
            <div class="page-content">
              <div class="header-logo">
                <img src="${PDF_LOGO_BASE64}" alt="Logo MMS" />
              </div>
              <div style="padding-top: 10px; text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 14px; text-decoration: underline; font-family: 'Times New Roman', Times, serif;">
                ${titulo}
              </div>
              <div style="text-align: center; width: 100%; margin-top: 10px;">
                <img src="${src}" style="max-width: 100%; max-height: 750px; object-fit: contain; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
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
      min-height: 1123px;
      padding: 36px 44px 30px 44px;
      background-color: #ffffff;
      box-sizing: border-box;
      overflow: hidden;
      page-break-after: always;
      margin: 0 auto;
    }
    .mms-pdf-page:last-child {
      page-break-after: auto;
    }
    .fixed-bg {
      position: absolute;
      top: 0;
      left: 0;
      width: 794px;
      height: 1123px;
      object-fit: fill;
      z-index: 1;
      pointer-events: none;
      opacity: 0.96;
    }
    .page-content {
      position: relative;
      z-index: 2;
    }
    .header-logo {
      width: 100%;
      margin-bottom: 2px;
      margin-top: -6px;
    }
    .header-logo img {
      width: 76px;
      height: 76px;
      object-fit: contain;
    }
    .titulo-pdf {
      text-align: center;
      font-weight: bold;
      font-size: 17px;
      text-decoration: underline;
      margin-top: -8px;
      margin-bottom: 12px;
      text-transform: uppercase;
      font-family: "Times New Roman", Times, serif;
    }
    .row { 
      margin-bottom: 7px; 
      font-size: 14px;
    }
    .label { 
      font-weight: bold; 
    }
    .content-box { 
      margin-left: 20px; 
      margin-top: 5px; 
      margin-bottom: 10px; 
    }
    .info-box { 
      margin-top: 4px; 
      margin-bottom: 14px; 
      margin-left: 20px;
      line-height: 1.45;
    }
    .pax-container {
      width: 100%; 
      overflow: hidden; 
      margin-top: 20px;
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
      margin-top: 26px;
      text-align: center;
      font-size: 12px;
      font-weight: bold;
      color: #000000;
      line-height: 1.35;
      font-family: "Times New Roman", Times, serif;
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
      <div class="header-logo">
        <img src="${PDF_LOGO_BASE64}" alt="Logo MMS" />
      </div>
      <div class="titulo-pdf">RELATÓRIO DE TROCA DE TURMA</div>

      <div class="row"><span class="label">Unidade:</span> ${unidade}</div>
      <div class="row"><span class="label">Data:</span> ${dataFormatada}</div>
      <div class="row"><span class="label">Local:</span> ${local}</div>
      <div class="row"><span class="label">Modal:</span> ${modal}</div>

      <div style="margin-top: 8px; margin-bottom: 3px;"><span class="label">Horário de Saída do Hotel (Previsto e Real):</span></div>
      <div class="content-box">
        ${saidasHtml}
      </div>

      <div style="margin-bottom: 3px;"><span class="label">Horários de Embarque (Previsto e Real):</span></div>
      <div class="content-box">
        <span class="label">Previsto:</span> ${embPrevFormatado} &nbsp;&nbsp;&nbsp;&nbsp; <span class="label">Real:</span> ${embRealFormatado}
      </div>

      <div style="margin-bottom: 3px;"><span class="label">Horário Inicial e de Finalização do Atendimento:</span></div>
      <div class="content-box">
        <span class="label">Início:</span> ${atIniFormatado} &nbsp;&nbsp; às &nbsp;&nbsp; <span class="label">Fim:</span> ${atFimFormatado}
      </div>

      <div class="row" style="margin-top: 6px;"><span class="label">Nome do Preposto:</span> ${preposto}</div>

      <div style="margin-top: 8px; margin-bottom: 3px;"><span class="label">Informações sobre a troca de turma:</span></div>
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

  ${fotosHtml}
</body>
</html>`;
}

import { ANEXOS_API_KEY, getServerBaseUrl } from './config';

export interface FotoItem {
  id: number;
  uri: string;
  titulo: string;
  base64?: string;
}

/**
 * Envia uma foto (em formato Base64 ou DataURL) para a API PHP protegida
 * e retorna a URL assinada com HMAC para visualização/carregamento leve.
 */
export async function uploadFotoAnexo(fotoSrc: string): Promise<string> {
  if (!fotoSrc) return '';

  // Se já for uma URL HTTP/HTTPS (já subida), retorna diretamente
  if (fotoSrc.startsWith('http://') || fotoSrc.startsWith('https://')) {
    return fotoSrc;
  }

  const baseUrl = getServerBaseUrl();
  const endpoint = `${baseUrl}/api/upload_anexo.php`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': ANEXOS_API_KEY,
      },
      body: JSON.stringify({ base64: fotoSrc }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[AnexosService] Servidor retornou HTTP ${response.status}:`, errText);
      return fotoSrc; // Fallback gracioso para não perder a foto local
    }

    const result = await response.json();
    if (result && result.sucesso && result.url_visualizacao) {
      return result.url_visualizacao;
    } else {
      console.warn('[AnexosService] Erro retornado pela API:', result?.erro);
      return fotoSrc;
    }
  } catch (error) {
    console.warn('[AnexosService] Falha de rede ao enviar anexo para hospedagem:', error);
    return fotoSrc; // Fallback gracioso para manter a foto
  }
}

/**
 * Processa um lote de fotos anexadas, enviando as imagens para a hospedagem
 * e substituindo os Base64 pesados pelas URLs leves assinadas.
 */
export async function processarUploadFotos<T extends { id: number; uri: string; titulo: string; base64?: string }>(
  fotos: T[]
): Promise<T[]> {
  if (!fotos || !Array.isArray(fotos) || fotos.length === 0) {
    return [];
  }

  return Promise.all(
    fotos.map(async (foto) => {
      const rawSrc = foto.uri || foto.base64 || '';
      if (!rawSrc) return foto;

      // Se já for link remoto assinado, não precisa reenviar
      if (rawSrc.startsWith('http://') || rawSrc.startsWith('https://')) {
        return foto;
      }

      const uploadedUrl = await uploadFotoAnexo(rawSrc);
      return {
        ...foto,
        uri: uploadedUrl,
      };
    })
  );
}

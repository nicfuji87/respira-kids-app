// AI dev note: Helper compartilhado para abrir documentos (atestado, certificado, orçamento,
// relatório) numa janela de impressão. Antes cada gerador chamava `printWindow.print()` dentro
// de um `setTimeout(..., 1000)` fixo — quando o fundo/assinatura vindos do Supabase Storage
// demoravam mais que isso, a impressão saía com as imagens em branco.
// Aqui a impressão só dispara depois que o documento, as fontes e todas as <img> terminaram.

// Teto de espera: se alguma imagem travar, imprime mesmo assim em vez de nunca abrir o diálogo.
const ASSET_TIMEOUT_MS = 8000;

const waitForImages = (doc: Document): Promise<void[]> =>
  Promise.all(
    Array.from(doc.images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        })
    )
  );

// AI dev note: documentos que se paginam sozinhos (orçamento) marcam <html data-print-wait>
// e setam data-print-ready quando terminam de distribuir o conteúdo nas folhas. Imprimir antes
// disso sairia com tudo amontoado na primeira página.
const PAGINATION_WAIT_ATTR = 'data-print-wait';
const PAGINATION_READY_ATTR = 'data-print-ready';
const PAGINATION_POLL_MS = 50;
const PAGINATION_TIMEOUT_MS = 5000;

const waitForPagination = (win: Window): Promise<void> => {
  const root = win.document.documentElement;
  if (!root.hasAttribute(PAGINATION_WAIT_ATTR)) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let waited = 0;
    const tick = () => {
      if (
        root.hasAttribute(PAGINATION_READY_ATTR) ||
        waited >= PAGINATION_TIMEOUT_MS
      ) {
        resolve();
        return;
      }
      waited += PAGINATION_POLL_MS;
      win.setTimeout(tick, PAGINATION_POLL_MS);
    };
    tick();
  });
};

const waitForAssets = async (win: Window): Promise<void> => {
  const doc = win.document;

  if (doc.readyState !== 'complete') {
    await new Promise<void>((resolve) => {
      win.addEventListener('load', () => resolve(), { once: true });
    });
  }

  // Fontes do Google Fonts: falha aqui não deve impedir a impressão
  try {
    await doc.fonts?.ready;
  } catch {
    // segue com a fonte fallback
  }

  // Paginação vem antes das imagens: ela pode criar folhas novas (e novas <img> de fundo)
  await waitForPagination(win);
  await waitForImages(doc);
};

/**
 * Abre o HTML numa nova aba e dispara a impressão assim que fontes e imagens carregarem.
 * Retorna `null` quando o navegador bloqueia o pop-up (chamador mostra o aviso).
 */
export const openPrintWindow = (htmlContent: string): Window | null => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return null;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();

  const timeout = new Promise<void>((resolve) => {
    printWindow.setTimeout(resolve, ASSET_TIMEOUT_MS);
  });

  void Promise.race([waitForAssets(printWindow), timeout])
    .catch(() => undefined)
    .then(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        console.error('Erro ao abrir o diálogo de impressão:', error);
      }
    });

  return printWindow;
};

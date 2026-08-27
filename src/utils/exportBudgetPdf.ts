import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

const waitForPaint = async (): Promise<void> => {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore font loading errors
    }
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
};

export async function captureReportPagesToPdf(pageElements: HTMLElement[]): Promise<Blob> {
  if (pageElements.length === 0) {
    throw new Error('No PDF pages to capture');
  }

  await waitForPaint();

  const pdf = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
    compress: true
  });

  for (let index = 0; index < pageElements.length; index += 1) {
    const page = pageElements[index];
    const canvas = await html2canvas(page, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: page.offsetWidth || 794,
      height: page.offsetHeight || 1123,
      windowWidth: page.offsetWidth || 794,
      windowHeight: page.offsetHeight || 1123,
      onclone: (_clonedDoc, clonedPage) => {
        clonedPage.style.fontFamily = "'Segoe UI', Arial, sans-serif";
        clonedPage.style.lineHeight = '1.45';
        clonedPage.querySelectorAll<HTMLElement>('*').forEach((node) => {
          const overflowHiddenText =
            node.style.overflow === 'hidden' &&
            (node.style.textOverflow === 'ellipsis' || node.style.whiteSpace === 'nowrap');
          if (overflowHiddenText) {
            node.style.overflow = 'visible';
            node.style.textOverflow = 'clip';
            node.style.whiteSpace = 'normal';
          }
          if (!node.style.lineHeight) {
            node.style.lineHeight = '1.45';
          }
        });
      }
    });
    const image = canvas.toDataURL('image/jpeg', 0.92);
    if (index > 0) {
      pdf.addPage();
    }
    pdf.addImage(image, 'JPEG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, 'FAST');
  }

  return pdf.output('blob');
}

type SaveFilePickerWindow = {
  showSaveFilePicker: (options: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
    excludeAcceptAllOption?: boolean;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

const getSaveFilePickerWindow = (): SaveFilePickerWindow | null => {
  if (typeof window === 'undefined' || !('showSaveFilePicker' in window)) {
    return null;
  }
  const pickerWindow = window as unknown as SaveFilePickerWindow;
  return typeof pickerWindow.showSaveFilePicker === 'function' ? pickerWindow : null;
};

export async function downloadPdfBlob(
  blob: Blob,
  filename: string,
  fileTypeDescription: string
): Promise<'saved' | 'cancelled' | 'downloaded'> {
  const pickerWindow = getSaveFilePickerWindow();

  if (pickerWindow) {
    try {
      const fileHandle = await pickerWindow.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: fileTypeDescription,
            accept: { 'application/pdf': ['.pdf'] }
          }
        ],
        excludeAcceptAllOption: false
      });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return 'saved';
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return 'downloaded';
}

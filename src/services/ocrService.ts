import Tesseract from 'tesseract.js';
import { pdfjs } from 'react-pdf';

// Set worker source
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export async function extractTextFromPdf(fileBlob: Blob): Promise<string> {
  try {
    const arrayBuffer = await fileBlob.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    // Process up to 5 pages to save time/memory for MVP
    const maxPages = Math.min(pdf.numPages, 5);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      
      if (pageText.trim().length > 50) {
        // Has text layer
        fullText += pageText + '\n\n';
      } else {
        // No text layer, need OCR
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport } as any).promise;
        
        // Run Tesseract
        const { data: { text } } = await Tesseract.recognize(canvas, 'kor+eng', {
          logger: m => console.log(m)
        });
        fullText += text + '\n\n';
      }
    }

    return fullText;
  } catch (error) {
    console.error('OCR Error:', error);
    return '';
  }
}

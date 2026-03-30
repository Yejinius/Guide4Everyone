import Tesseract from 'tesseract.js';
import { pdfjs } from 'react-pdf';

// Set worker source
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export async function extractTextFromPdf(fileBlob: Blob): Promise<string> {
  try {
    const arrayBuffer = await fileBlob.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;

    // Process up to 10 pages as requested
    const maxPages = Math.min(pdf.numPages, 10);
    const pagesText: string[] = new Array(maxPages).fill('');
    
    // First pass: Try to extract text using pdfjs (very fast)
    let totalExtractedTextLength = 0;
    const pagesToOcr: number[] = [];

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      pagesText[i - 1] = pageText;
      
      if (pageText.trim().length > 50) {
        totalExtractedTextLength += pageText.trim().length;
      } else {
        pagesToOcr.push(i);
      }
    }

    // If we extracted a reasonable amount of text, it's likely a text-based PDF.
    // We don't need OCR for the few pages that might be blank or have little text.
    if (totalExtractedTextLength > maxPages * 20) {
      return pagesText.map(t => t.trim()).filter(t => t.length > 0).join('\n---PAGE_BREAK---\n');
    }

    // If we are here, it's a scanned PDF. We need OCR.
    if (pagesToOcr.length > 0) {
      // Initialize a single worker to avoid crashing the browser and save memory/initialization time.
      console.log('Initializing Tesseract worker...');
      const worker = await Tesseract.createWorker('kor+eng');
      
      for (const pageNum of pagesToOcr) {
        console.log(`Processing OCR for page ${pageNum}...`);
        const page = await pdf.getPage(pageNum);
        
        // Lower scale for much faster OCR (0.8 is a good balance for speed vs accuracy)
        const viewport = page.getViewport({ scale: 0.8 }); 
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport } as any).promise;
        
        const { data: { text } } = await worker.recognize(canvas);
        pagesText[pageNum - 1] = text;
      }
      
      await worker.terminate();
      console.log('OCR processing completed.');
    }

    return pagesText.map(t => t.trim()).filter(t => t.length > 0).join('\n---PAGE_BREAK---\n');
  } catch (error) {
    console.error('OCR Error:', error);
    return '';
  }
}

export async function detectPageCount(file: File): Promise<number | null> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') return detectPdfPageCount(file);
  if (ext === 'docx') return detectDocxPageCount(file);
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return 1;
  // .doc is legacy binary format — cannot reliably detect client-side
  return null;
}

async function detectPdfPageCount(file: File): Promise<number | null> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const buffer = await file.arrayBuffer();
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

async function detectDocxPageCount(file: File): Promise<number | null> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);
    const appXml = await zip.file('docProps/app.xml')?.async('string');
    if (!appXml) return null;
    const match = appXml.match(/<Pages>(\d+)<\/Pages>/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

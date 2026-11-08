// 阶段 6：在浏览器里从 PDF 抽文字（pdfjs-dist，按需加载，文件不离开本机）。
// 按坐标把同一行的文字块拼起来，列之间留两个空格，方便规则识别「名称 …… 20%」。

export class PdfNoTextError extends Error {
  constructor() {
    super('这个 PDF 里没有可选中的文字（可能是扫描件或图片），请复制文字粘贴进来，或用下面的 AI 兜底。');
  }
}

const MAX_PAGES = 40;

interface Chunk {
  x: number;
  y: number;
  w: number;
  h: number;
  str: string;
}

/** 同一行（y 接近）的块按 x 排序拼起来；间隔大的地方插两个空格（表格列） */
export function chunksToText(chunks: Chunk[]): string {
  const sorted = chunks.filter((c) => c.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Chunk[][] = [];
  for (const c of sorted) {
    const line = lines[lines.length - 1];
    const tol = Math.max(2, Math.min(c.h || 10, line?.[0].h || 10) * 0.5);
    if (line && Math.abs(line[0].y - c.y) <= tol) line.push(c);
    else lines.push([c]);
  }
  return lines
    .map((line) => {
      line.sort((a, b) => a.x - b.x);
      let out = '';
      let end = -Infinity;
      for (const c of line) {
        const gap = c.x - end;
        const charW = c.str.length ? c.w / c.str.length : 5;
        if (out) out += gap > charW * 2.5 ? '  ' : gap > charW * 0.2 && !/\s$/.test(out) && !/^\s/.test(c.str) ? ' ' : '';
        out += c.str;
        end = c.x + c.w;
      }
      return out.trimEnd();
    })
    .join('\n');
}

export async function extractPdfText(file: Blob): Promise<string> {
  // 用 legacy 构建：默认构建用到 Promise.try 等新 API，iOS 18.2 以前的 Safari 跑不了
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  // 中文 PDF 常用没嵌入的 CJK 字体，没有 CMap 就抽不出字；CMap 由 vite.config.ts 复制到 pdfjs/cmaps/，按需加载
  const task = pdfjs.getDocument({ data, cMapUrl: new URL('pdfjs/cmaps/', document.baseURI).href, cMapPacked: true });
  const doc = await task.promise;
  try {
    const pages: string[] = [];
    for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const chunks: Chunk[] = [];
      for (const it of content.items) {
        if (!('str' in it)) continue;
        chunks.push({ x: it.transform[4], y: it.transform[5], w: it.width, h: it.height, str: it.str });
      }
      pages.push(chunksToText(chunks));
      page.cleanup();
    }
    const text = pages.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.replace(/\s/g, '').length < 10) throw new PdfNoTextError();
    return text;
  } finally {
    // v6 起由 loading task 负责销毁文档和 worker
    await task.destroy();
  }
}

/** .pdf 走 pdfjs；.txt / .md / 其他文本直接读 */
export async function readSyllabusFile(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) return extractPdfText(file);
  if (!/^text\//.test(file.type) && !/\.(txt|md|markdown|text)$/i.test(file.name)) {
    throw new Error('只支持 PDF、.txt 和 .md 文件；Word 文档请另存为 PDF 或复制文字粘贴。');
  }
  return (await file.text()).trim();
}

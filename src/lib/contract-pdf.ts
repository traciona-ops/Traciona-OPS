import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { TRACIONA_LOGO_PNG } from "@/lib/data/contract-templates/traciona-logo";

// Texto do contrato → PDF A4 formatado.
// Convenções do texto: 1ª linha = título; linhas "N. TÍTULO" e "ASSINATURAS"
// = cabeçalhos de cláusula; "[[ASSINATURA]]Nome|Papel" = bloco de assinatura;
// demais linhas = parágrafos justificados.

export async function contractTextToPdf(text: string): Promise<Uint8Array> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 64, bottom: 64, left: 56, right: 56 },
    info: { Title: text.split("\n")[0] ?? "Contrato", Author: "Traciona" },
  });

  const chunks: Uint8Array[] = [];
  doc.on("data", (c: Uint8Array) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  const wid = doc.page.width - 56 * 2;

  // Logo da Traciona centralizada no topo (como no modelo Word).
  // Data URI: o build standalone do pdfkit não reconhece Buffer do Node.
  try {
    const logoW = 150; // proporção ~5:1 → altura ~30
    doc.image(
      `data:image/png;base64,${TRACIONA_LOGO_PNG}`,
      (doc.page.width - logoW) / 2,
      48,
      { width: logoW }
    );
    doc.y = 48 + 44;
  } catch {
    // sem logo, segue só com o texto
  }

  const lines = text.split("\n");
  let first = true;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      doc.moveDown(0.4);
      continue;
    }

    if (first) {
      doc
        .font("Helvetica-Bold")
        .fontSize(13)
        .text(line, { align: "center", width: wid });
      doc.moveDown(1);
      first = false;
      continue;
    }

    if (line.startsWith("[[ASSINATURA]]")) {
      const [nome, papel] = line.replace("[[ASSINATURA]]", "").split("|");
      // bloco não pode quebrar de página no meio
      if (doc.y > doc.page.height - 170) doc.addPage();
      doc.moveDown(2.4);
      const cx = doc.page.width / 2;
      const lineW = 260;
      doc
        .moveTo(cx - lineW / 2, doc.y)
        .lineTo(cx + lineW / 2, doc.y)
        .lineWidth(0.7)
        .stroke();
      doc.moveDown(0.25);
      doc
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .text(nome ?? "", { align: "center", width: wid });
      doc
        .font("Helvetica")
        .fontSize(9.5)
        .text(papel ?? "", { align: "center", width: wid });
      continue;
    }

    const isHeading = /^\d{1,2}\.\s+[A-ZÀ-Ú]/.test(line) || line === "ASSINATURAS";
    if (isHeading) {
      doc.moveDown(0.7);
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(line, { width: wid });
      doc.moveDown(0.15);
      continue;
    }

    doc
      .font("Helvetica")
      .fontSize(10.5)
      .text(line, { align: "justify", width: wid, lineGap: 1.5 });
    doc.moveDown(0.2);
  }

  doc.end();
  await done;
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

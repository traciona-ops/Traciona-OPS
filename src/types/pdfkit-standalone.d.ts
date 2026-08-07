// O build standalone do pdfkit embute as fontes padrão em base64 —
// obrigatório no serverless (o build normal procura arquivos .afm no disco).
declare module "pdfkit/js/pdfkit.standalone.js" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PDFDocument: any;
  export default PDFDocument;
}

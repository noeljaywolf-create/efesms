declare module 'html2pdf.js' {
  interface Html2PdfInstance {
    set(options: Record<string, unknown>): Html2PdfInstance
    from(element: Element | string): Html2PdfInstance
    save(): Promise<void>
  }
  interface Html2PdfStatic {
    (): Html2PdfInstance
  }
  const html2pdf: Html2PdfStatic
  export default html2pdf
}

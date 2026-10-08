import html2pdf from 'html2pdf.js'

// User and customer fields are interpolated into several legacy document templates.
// Remove active HTML before inserting those templates into the live DOM or a DOC file.
const sanitizePrintableHtml = (html: string) => {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  parsed.querySelectorAll('script, iframe, object, embed, form, input, button, foreignObject, link, meta').forEach((node) => node.remove())
  parsed.body.querySelectorAll('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase()
      if (name.startsWith('on') || (['src', 'href', 'xlink:href', 'action', 'formaction'].includes(name)
        && (value.startsWith('javascript:') || value.startsWith('vbscript:') || value.startsWith('data:text/html')))) {
        element.removeAttribute(attribute.name)
      }
    }
  })
  return parsed.body.innerHTML
}

const safeFilename = (filename: string) => filename.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'document'

// Render card HTML → real PDF (client-side via html2pdf.js).
export async function downloadAsPdf(html: string, css: string, filename: string) {
  const wrap = document.createElement('div')
  wrap.setAttribute('style', 'position:fixed;left:-10000px;top:0;width:760px;background:#fff;color:#111827')
  wrap.innerHTML = `<style>${css}</style>${sanitizePrintableHtml(html)}`
  document.body.appendChild(wrap)
  try {
    // Wait for the shared logo to finish loading before html2canvas snapshots the document.
    await Promise.all([...wrap.querySelectorAll('img')].map((img) => img.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })))
    await (html2pdf as any)()
      .set({
        margin: [10, 10],
        filename: `${safeFilename(filename)}.pdf`,
        image: { type: 'jpeg', quality: 0.97 },
        html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(wrap)
      .save()
  } finally {
    wrap.remove()
  }
}

// Same card HTML as a Word-openable .doc (MS Word reads HTML with this mime).
export async function downloadAsDoc(html: string, css: string, filename: string) {
  let logoSource = '/logo.png'
  try {
    // Embed the mark so Word documents keep their letterhead when opened offline.
    const logoResponse = await fetch('/logo.png')
    if (!logoResponse.ok) throw new Error('Logo asset unavailable')
    const logoBlob = await logoResponse.blob()
    logoSource = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(logoBlob)
    })
  } catch { /* Keep the same-origin logo path as a fallback. */ }
  const safeHtml = sanitizePrintableHtml(html).replace(/src=(['"])\/logo\.png\1/g, `src="${logoSource}"`)
  const full =
    `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
    `<head><meta charset="utf-8"><title>${safeFilename(filename)}</title><style>${css}</style></head><body>${safeHtml}</body></html>`
  const blob = new Blob(['\ufeff', full], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFilename(filename)}.doc`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

import { useRef, useState } from 'react'
import { PDFDocument, degrees } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import {
  Archive,
  ArrowRight,
  ChevronDown,
  Combine,
  Download,
  FileImage,
  FileText,
  Image,
  Menu,
  RotateCw,
  Scissors,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import './App.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type ToolId = 'merge' | 'image' | 'compress' | 'split' | 'rotate' | 'pdfjpg'

const tools = [
  { id: 'merge' as ToolId, title: 'Merge PDF', desc: 'Combine PDFs in the order you want', icon: Combine, color: '#f04438', soft: '#fff1f0' },
  { id: 'image' as ToolId, title: 'JPG to PDF', desc: 'Convert JPG or PNG images to PDF', icon: Image, color: '#f79009', soft: '#fff7e6' },
  { id: 'compress' as ToolId, title: 'Compress PDF', desc: 'Reduce file size while keeping quality', icon: Archive, color: '#12b76a', soft: '#ecfdf3' },
  { id: 'split' as ToolId, title: 'Split PDF', desc: 'Extract selected pages from a PDF', icon: Scissors, color: '#7f56d9', soft: '#f4f3ff' },
  { id: 'rotate' as ToolId, title: 'Rotate PDF', desc: 'Rotate PDF pages easily', icon: RotateCw, color: '#2e90fa', soft: '#eff8ff' },
  { id: 'pdfjpg' as ToolId, title: 'PDF to JPG', desc: 'Convert PDF pages into JPG images', icon: FileImage, color: '#e5489a', soft: '#fdf2fa' },
]

function downloadBytes(bytes: Uint8Array, name: string, type = 'application/pdf') {
  const copy = new Uint8Array(bytes)
  const blob = new Blob([copy.buffer], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function App() {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const tool = tools.find((item) => item.id === activeTool)

  const accept = activeTool === 'merge' || activeTool === 'compress' || activeTool === 'split' || activeTool === 'rotate'
    ? '.pdf,application/pdf'
    : activeTool === 'image' ? '.jpg,.jpeg,.png,image/jpeg,image/png' : '.pdf,application/pdf'

  const openTool = (id: ToolId) => {
    setActiveTool(id)
    setFiles([])
    setError('')
  }

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return
    setError('')
    setFiles((old) => [...old, ...Array.from(incoming)])
  }

  const removeFile = (index: number) => setFiles((old) => old.filter((_, i) => i !== index))

  const process = async () => {
    if (!activeTool || !files.length) return
    setBusy(true)
    setError('')
    try {
      if (activeTool === 'merge') {
        const out = await PDFDocument.create()
        for (const file of files) {
          const source = await PDFDocument.load(await file.arrayBuffer())
          const pages = await out.copyPages(source, source.getPageIndices())
          pages.forEach((page) => out.addPage(page))
        }
        downloadBytes(await out.save({ useObjectStreams: true }), 'merged.pdf')
      }

      if (activeTool === 'image') {
        const out = await PDFDocument.create()
        for (const file of files) {
          const bytes = await file.arrayBuffer()
          const image = file.type === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes)
          const page = out.addPage([image.width, image.height])
          page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
        }
        downloadBytes(await out.save(), 'images.pdf')
      }

      if (activeTool === 'compress') {
        const source = await PDFDocument.load(await files[0].arrayBuffer(), { ignoreEncryption: true })
        source.setTitle('Compressed PDF')
        const out = await PDFDocument.create()
        const pages = await out.copyPages(source, source.getPageIndices())
        pages.forEach((page) => out.addPage(page))
        out.setProducer('PDFilo')
        downloadBytes(await out.save({ useObjectStreams: true, addDefaultPage: false }), 'compressed.pdf')
      }

      if (activeTool === 'split') {
        const source = await PDFDocument.load(await files[0].arrayBuffer())
        const rangeInput = (document.querySelector('#page-range') as HTMLInputElement)?.value || '1'
        const indices = new Set<number>()
        for (const part of rangeInput.split(',')) {
          if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number)
            for (let i = Math.max(1, start); i <= Math.min(source.getPageCount(), end); i++) indices.add(i - 1)
          } else if (Number(part) >= 1) indices.add(Number(part) - 1)
        }
        const out = await PDFDocument.create()
        const valid = [...indices].filter((i) => i >= 0 && i < source.getPageCount())
        if (!valid.length) throw new Error('Please enter a valid page range.')
        const pages = await out.copyPages(source, valid)
        pages.forEach((page) => out.addPage(page))
        downloadBytes(await out.save(), 'split.pdf')
      }

      if (activeTool === 'rotate') {
        const source = await PDFDocument.load(await files[0].arrayBuffer())
        const angle = Number((document.querySelector('#rotate-angle') as HTMLSelectElement)?.value || 90)
        source.getPages().forEach((page) => page.setRotation(degrees(page.getRotation().angle + angle)))
        downloadBytes(await source.save(), 'rotated.pdf')
      }

      if (activeTool === 'pdfjpg') {
        const data = new Uint8Array(await files[0].arrayBuffer())
        const pdf = await pdfjsLib.getDocument({ data }).promise
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          const page = await pdf.getPage(pageNumber)
          const viewport = page.getViewport({ scale: 1.6 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const context = canvas.getContext('2d')
          if (!context) continue
          await page.render({ canvasContext: context, canvas, viewport }).promise
          const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value || new Blob()), 'image/jpeg', 0.92))
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `page-${pageNumber}.jpg`
          link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try another file.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="nav">
        <button className="brand" onClick={() => setActiveTool(null)} aria-label="PDFilo home">
          <span className="brand-mark"><FileText size={21} strokeWidth={2.6} /></span>
          <span>PDFilo</span>
        </button>
        <nav className="nav-links">
          <button>All PDF Tools <ChevronDown size={15} /></button>
          <button>Convert PDF <ChevronDown size={15} /></button>
          <button>Compress PDF</button>
        </nav>
        <div className="nav-actions">
          <button className="login">Log in</button>
          <button className="signup">Sign up</button>
          <button className="menu"><Menu size={22} /></button>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-badge"><Zap size={14} fill="currentColor" /> Simple. Fast. Private.</div>
          <h1>Every PDF tool you need,<br /><span>in one place</span></h1>
          <p>Convert, merge, compress and edit PDFs directly in your browser.</p>
        </section>

        <section className="tools-grid" aria-label="PDF tools">
          {tools.map((item) => {
            const Icon = item.icon
            return (
              <button className="tool-card" key={item.id} onClick={() => openTool(item.id)}>
                <span className="tool-icon" style={{ color: item.color, background: item.soft }}><Icon size={29} /></span>
                <span className="tool-copy">
                  <strong>{item.title}</strong>
                  <small>{item.desc}</small>
                </span>
                <ArrowRight className="tool-arrow" size={19} />
              </button>
            )
          })}
        </section>

        <section className="trust">
          <div><strong>100%</strong><span>Browser-based</span></div>
          <div><strong>Free</strong><span>No hidden costs</span></div>
          <div><strong>Secure</strong><span>Files stay private</span></div>
        </section>
      </main>

      {activeTool && tool && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setActiveTool(null)}>
          <div className="tool-modal">
            <button className="close" onClick={() => setActiveTool(null)} aria-label="Close"><X size={20} /></button>
            <div className="modal-icon" style={{ color: tool.color, background: tool.soft }}><tool.icon size={32} /></div>
            <h2>{tool.title}</h2>
            <p>{tool.desc}</p>

            {files.length === 0 ? (
              <div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files) }}>
                <button className="upload-button" onClick={() => inputRef.current?.click()}>
                  <Upload size={20} /> Select {activeTool === 'image' ? 'images' : 'PDF files'}
                </button>
                <span>or drop files here</span>
              </div>
            ) : (
              <div className="file-list">
                {files.map((file, index) => (
                  <div className="file-row" key={`${file.name}-${index}`}>
                    <span className="file-icon"><FileText size={18} /></span>
                    <div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></div>
                    <button onClick={() => removeFile(index)} aria-label="Remove file"><X size={17} /></button>
                  </div>
                ))}
                <button className="add-more" onClick={() => inputRef.current?.click()}>+ Add more files</button>
              </div>
            )}

            <input ref={inputRef} className="hidden-input" type="file" accept={accept} multiple={activeTool === 'merge' || activeTool === 'image'} onChange={(event) => addFiles(event.target.files)} />

            {activeTool === 'split' && files.length > 0 && (
              <label className="option-row">Pages <input id="page-range" defaultValue="1" placeholder="e.g. 1-3, 5" /></label>
            )}
            {activeTool === 'rotate' && files.length > 0 && (
              <label className="option-row">Angle <select id="rotate-angle"><option value="90">90° clockwise</option><option value="180">180°</option><option value="270">90° counterclockwise</option></select></label>
            )}

            {error && <div className="error">{error}</div>}
            {files.length > 0 && <button className="process-button" disabled={busy} onClick={process}>{busy ? 'Processing...' : tool.title} <Download size={18} /></button>}
          </div>
        </div>
      )}
    </div>
  )
}

export default App

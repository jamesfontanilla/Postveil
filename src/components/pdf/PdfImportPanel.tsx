import { pdfImportBoundary } from "./pdfOperations";
export default function PdfImportPanel() { return <section><h2>Import and preview</h2><p>{pdfImportBoundary().message}</p><button type="button" disabled>PDF import/preview setup required</button></section>; }

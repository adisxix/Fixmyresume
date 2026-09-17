const coverPdfPreview = document.getElementById("coverPdfPreview");
const coverExportFormat = document.getElementById("coverExportFormat");
const downloadCoverBtn = document.getElementById("downloadCoverBtn");
const coverSizeHint = document.getElementById("coverSizeHint");

const AI_STORAGE_KEY = "fixmyresume.aiData.v1";

function loadAIData() {
  const raw = localStorage.getItem(AI_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isValidData(data) {
  return Boolean(
    data &&
      typeof data.coverLetterText === "string" &&
      data.coverLetterText.trim().length > 0
  );
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createWordDocBlob(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #111; margin: 40px; }
    p { margin-bottom: 12px; }
  </style>
</head>
<body>${escaped}</body>
</html>`;
  return new Blob([html], { type: "application/msword" });
}

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function cleanPdfText(text) {
  return String(text || "")
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, "- ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\r\n/g, "\n");
}

function createPdfBlob(text) {
  const plain = cleanPdfText(text);
  const rawLines = plain.split("\n");
  const lines = [];

  for (const rawLine of rawLines) {
    if (!rawLine.length) {
      lines.push("");
      continue;
    }
    for (let i = 0; i < rawLine.length; i += 85) {
      lines.push(rawLine.slice(i, i + 85));
    }
  }

  const visibleLines = lines.slice(0, 52);
  const contentStream = ["BT", "/F1 11 Tf", "45 780 Td", "14 TL"];
  visibleLines.forEach((line, index) => {
    const escaped = escapePdfText(line);
    if (index === 0) {
      contentStream.push(`(${escaped}) Tj`);
    } else {
      contentStream.push("T*");
      contentStream.push(`(${escaped}) Tj`);
    }
  });
  contentStream.push("ET");
  const streamBody = contentStream.join("\n");

  const objects = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
  );
  objects.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  objects.push(
    `5 0 obj\n<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream\nendobj\n`
  );

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function formatPreviewHtml(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            margin: 0;
            padding: 24px;
            background: #1e1d1a;
            color: #FFFCF2;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 15px;
            line-height: 1.65;
            white-space: pre-wrap;
            word-break: break-word;
          }
        </style>
      </head>
      <body>${escaped}</body>
    </html>
  `;
}

function applyCoverData() {
  const data = loadAIData();

  if (!isValidData(data)) {
    if (coverPdfPreview) {
      coverPdfPreview.srcdoc = `
        <html>
          <body style="margin:0;padding:24px;background:#252422;color:#FFFCF2;font-family:sans-serif;">
            <p>No cover letter found. <a href="index.html" style="color:#EB5E28;">Upload a resume</a> to generate one.</p>
          </body>
        </html>
      `;
    }
    return;
  }

  if (coverPdfPreview && data.coverLetterText) {
    coverPdfPreview.srcdoc = formatPreviewHtml(data.coverLetterText);
  }

  if (coverExportFormat && coverSizeHint) {
    coverExportFormat.addEventListener("change", () => {
      coverSizeHint.textContent = coverExportFormat.value.toUpperCase();
    });
  }

  if (downloadCoverBtn) {
    downloadCoverBtn.addEventListener("click", () => {
      const selectedFormat = coverExportFormat?.value || "pdf";
      if (selectedFormat === "docx") {
        downloadBlob("cover-letter.doc", createWordDocBlob(data.coverLetterText));
        return;
      }
      downloadBlob("cover-letter.pdf", createPdfBlob(data.coverLetterText));
    });
  }
}

applyCoverData();

const resumePdfPreview = document.getElementById("resumePdfPreview");
const thingsImprovedList = document.getElementById("thingsImprovedList");
const downloadResumeBtn = document.getElementById("downloadResumeBtn");
const exportFormat = document.getElementById("exportFormat");
const fileSizeHint = document.getElementById("fileSizeHint");

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
      typeof data.craftedResumeText === "string" &&
      data.craftedResumeText.trim().length > 0
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
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.4; color: #111; margin: 40px; }
    h1 { font-size: 18pt; color: #000; margin-bottom: 4px; }
    h2 { font-size: 13pt; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 2px; margin-top: 14px; }
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
  const contentStream = ["BT", "/F1 10.5 Tf", "45 780 Td", "13.5 TL"];
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

  const formatted = escaped
    .replace(/^### (.*$)/gim, '<h3 style="color:#EB5E28;margin:12px 0 4px 0;font-size:1.1rem;font-weight:bold;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="color:#EB5E28;margin:16px 0 6px 0;font-size:1.25rem;font-weight:bold;border-bottom:1px solid #403D39;padding-bottom:3px;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="color:#EB5E28;margin:0 0 10px 0;font-size:1.5rem;font-weight:bold;text-align:center;">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#FFFFFF;">$1</strong>');

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
            font-size: 14.5px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-break: break-word;
          }
        </style>
      </head>
      <body>${formatted}</body>
    </html>
  `;
}

function applyResumeData() {
  const data = loadAIData();

  if (!isValidData(data)) {
    if (thingsImprovedList) {
      thingsImprovedList.innerHTML =
        '<li class="text-red-400">Resume data missing. Please upload and analyze your resume first.</li>';
    }
    if (resumePdfPreview) {
      resumePdfPreview.srcdoc = `
        <html>
          <body style="margin:0;padding:24px;background:#252422;color:#FFFCF2;font-family:sans-serif;">
            <p>No resume output found. <a href="index.html" style="color:#EB5E28;">Upload a resume</a> to get started.</p>
          </body>
        </html>
      `;
    }
    return;
  }

  if (thingsImprovedList) {
    const points = Array.isArray(data.improvements) ? data.improvements.slice(0, 10) : [];
    thingsImprovedList.innerHTML = points.length
      ? points.map((point) => `<li class="break-words">${point}</li>`).join("")
      : "<li>Resume structure and ATS compatibility improved.</li>";
  }

  if (resumePdfPreview && data.craftedResumeText) {
    resumePdfPreview.srcdoc = formatPreviewHtml(data.craftedResumeText);
  }

  if (exportFormat && fileSizeHint) {
    exportFormat.addEventListener("change", () => {
      fileSizeHint.textContent = exportFormat.value.toUpperCase();
    });
  }

  if (downloadResumeBtn) {
    downloadResumeBtn.addEventListener("click", () => {
      const selectedFormat = exportFormat?.value || "pdf";
      if (selectedFormat === "word") {
        downloadBlob("crafted-resume.doc", createWordDocBlob(data.craftedResumeText));
        return;
      }
      downloadBlob("crafted-resume.pdf", createPdfBlob(data.craftedResumeText));
    });
  }
}

applyResumeData();

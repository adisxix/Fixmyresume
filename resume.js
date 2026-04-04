const resumePdfPreview = document.getElementById("resumePdfPreview");
const thingsImprovedList = document.getElementById("thingsImprovedList");
const downloadResumeBtn = document.getElementById("downloadResumeBtn");
const exportFormat = document.getElementById("exportFormat");
const AI_STORAGE_KEY = "fixmyresume.aiData.v1";

function loadAIData() {
	const raw = localStorage.getItem(AI_STORAGE_KEY);
	if (!raw) {
		return null;
	}

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
			data.craftedResumeText.trim().length > 0,
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
	const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${escaped}</body></html>`;
	return new Blob([html], { type: "application/msword" });
}

function escapePdfText(value) {
	return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function createPdfBlob(text) {
	const plain = String(text || "")
		.replace(/[^\x20-\x7E\n\r\t]/g, " ")
		.replace(/\r\n/g, "\n");
	const rawLines = plain.split("\n");
	const lines = [];

	for (const rawLine of rawLines) {
		if (!rawLine.length) {
			lines.push("");
			continue;
		}
		for (let i = 0; i < rawLine.length; i += 90) {
			lines.push(rawLine.slice(i, i + 90));
		}
	}

	const visibleLines = lines.slice(0, 45);
	const contentStream = ["BT", "/F1 11 Tf", "50 780 Td", "14 TL"];
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
		"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
	);
	objects.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
	objects.push(
		`5 0 obj\n<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream\nendobj\n`,
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

function applyResumeData() {
	const rawData = loadAIData();
	if (!isValidData(rawData)) {
		if (thingsImprovedList) {
			thingsImprovedList.innerHTML =
				"<li>AI resume data missing. Please run the full analysis first.</li>";
		}
		if (resumePdfPreview) {
			resumePdfPreview.srcdoc = `
				<html>
					<body style="margin:0;padding:20px;background:#252422;color:#FFFCF2;font-family:Georgia,serif;line-height:1.4;">
						AI resume output not found. Please go back and run analysis again.
					</body>
				</html>
			`;
		}
		return;
	}

	const data = rawData;

	if (thingsImprovedList) {
		const points = Array.isArray(data.improvements) ? data.improvements.slice(0, 10) : [];
		thingsImprovedList.innerHTML = points.length
			? points.map((point) => `<li>${point}</li>`).join("")
			: "<li>AI did not return improvement points for this run.</li>";
	}

	if (resumePdfPreview && data.craftedResumeText) {
		resumePdfPreview.srcdoc = `
			<html>
				<body style="margin:0;padding:20px;background:#252422;color:#FFFCF2;font-family:Georgia,serif;line-height:1.4;white-space:pre-wrap;">
					${data.craftedResumeText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
				</body>
			</html>
		`;
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

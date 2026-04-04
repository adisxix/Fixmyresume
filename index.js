const resumeForm = document.getElementById("resumeForm");
const resumeFileInput = document.getElementById("resumeFile");
const fileLabel = document.getElementById("fileLabel");
const analyzeBtn = document.getElementById("analyzeBtn");
const processingScreen = document.getElementById("processingScreen");
const processingText = document.getElementById("processingText");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BYTEZ_API_KEY = "7a5e6270dcb384ad75fe6cc924d06460";
const BYTEZ_MODEL_ID = "openai/gpt-4o";
const AI_STORAGE_KEY = "fixmyresume.aiData.v1";

let cachedModel = null;
let analysisInFlight = false;

function parseOutputToText(output) {
	if (typeof output === "string") {
		return output;
	}

	if (output?.output && typeof output.output === "string") {
		return output.output;
	}

	if (output?.message?.content) {
		return String(output.message.content);
	}

	if (Array.isArray(output)) {
		return output
			.map((item) => {
				if (typeof item === "string") {
					return item;
				}
				return item?.content || item?.text || JSON.stringify(item);
			})
			.join("\n");
	}

	if (output && typeof output === "object") {
		return output.content || output.text || JSON.stringify(output);
	}

	return "";
}

function extractJsonObject(text) {
	if (!text) {
		return null;
	}

	const fenced = text.match(/```json\s*([\s\S]*?)```/i);
	const candidate = fenced?.[1] || text;
	const firstBrace = candidate.indexOf("{");
	const lastBrace = candidate.lastIndexOf("}");

	if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
		return null;
	}

	const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);
	try {
		return JSON.parse(jsonSlice);
	} catch {
		try {
			return Function(`"use strict"; return (${jsonSlice});`)();
		} catch {
			return null;
		}
	}
}

function sanitizeString(value) {
	return typeof value === "string" ? value.trim() : "";
}

function validateAIData(raw) {
	if (!raw || typeof raw !== "object") {
		throw new Error("AI returned empty data.");
	}

	const scoreRaw = Number(raw?.analysis?.overallScore ?? raw?.overallScore);
	const hasValidScore = Number.isFinite(scoreRaw) && scoreRaw >= 1 && scoreRaw <= 5;
	const score = hasValidScore ? scoreRaw : 3;
	const atsFriendly = sanitizeString(raw?.analysis?.atsFriendly ?? raw?.atsFriendly) || "Unknown";
	const tone = sanitizeString(raw?.analysis?.tone ?? raw?.tone) || "Unknown";
	const clarity = sanitizeString(raw?.analysis?.clarity ?? raw?.clarity) || "Unknown";

	const suggestions = Array.isArray(raw?.suggestions) ? raw.suggestions.map(sanitizeString).filter(Boolean) : [];
	if (suggestions.length < 1) {
		suggestions.push("No suggestions returned by AI.");
	}

	const improvements = Array.isArray(raw?.improvements) ? raw.improvements.map(sanitizeString).filter(Boolean) : [];
	if (improvements.length < 1) {
		improvements.push("No improvement points returned by AI.");
	}

	const sectionsRaw = Array.isArray(raw?.sections) ? raw.sections : [];
	if (!sectionsRaw.length) {
		sectionsRaw.push({ name: "Resume", status: "Reviewed" });
	}

	const sections = sectionsRaw
		.map((section) => {
			if (typeof section === "string") {
				return { name: sanitizeString(section), status: "Checked" };
			}

			return {
				name: sanitizeString(section?.name),
				status: sanitizeString(section?.status ?? section?.assessment),
			};
		})
		.filter((section) => section.name && section.status);

	if (!sections.length) {
		throw new Error("AI response sections are invalid.");
	}

	const craftedResumeText = sanitizeString(raw?.craftedResumeText);
	const coverLetterText = sanitizeString(raw?.coverLetterText);

	if (!craftedResumeText || !coverLetterText) {
		throw new Error("AI response missing resume or cover letter text.");
	}

	return {
		analysis: {
			overallScore: Math.round(score),
			atsFriendly,
			tone,
			clarity,
		},
		suggestions: suggestions.slice(0, 4),
		sections,
		improvements: improvements.slice(0, 10),
		craftedResumeText,
		coverLetterText,
	};
}

function saveAIData(data) {
	localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(data));
}

function clearAIData() {
	localStorage.removeItem(AI_STORAGE_KEY);
}

async function getModel() {
	if (cachedModel) {
		return cachedModel;
	}

	const { default: Bytez } = await import("https://esm.sh/bytez.js");
	const sdk = new Bytez(BYTEZ_API_KEY);
	cachedModel = sdk.model(BYTEZ_MODEL_ID);
	return cachedModel;
}

async function analyzeResumeWithAI(resumeText) {
	const model = await getModel();
	const prompt = `Analyze this resume text and return ONLY valid JSON with this exact schema:\n\n{\n  "analysis": {\n    "overallScore": number_from_1_to_5,\n    "atsFriendly": "Yes_or_No",\n    "tone": "single word",\n    "clarity": "single word"\n  },\n  "suggestions": ["4 short points only"],\n  "sections": [{"name":"section","status":"single short assessment"}],\n  "improvements": ["10 concise improved points"],\n  "craftedResumeText": "full improved resume in plain text",\n  "coverLetterText": "full generated cover letter in plain text"\n}\n\nRules:\n- suggestions must be exactly 4 items\n- improvements must be exactly 10 items\n- sections should include only sections found in the resume\n- do not include markdown or extra explanation\n\nResume text:\n${resumeText.slice(0, 14000)}`;

	const { error, output } = await model.run([
		{
			role: "user",
			content: prompt,
		},
	]);

	if (error) {
		throw new Error(typeof error === "string" ? error : JSON.stringify(error));
	}

	const outputText = parseOutputToText(output);
	const parsed = extractJsonObject(outputText);

	if (parsed) {
		return validateAIData(parsed);
	}

	const resumePart = outputText.trim();
	const coverPart = outputText.trim();

	if (!resumePart) {
		throw new Error("AI response could not be parsed into resume and cover sections.");
	}

	return {
		analysis: {
			overallScore: 3,
			atsFriendly: "Unknown",
			tone: "Unknown",
			clarity: "Unknown",
		},
		suggestions: ["AI did not return structured suggestions in this run."],
		sections: [{ name: "Resume", status: "Reviewed" }],
		improvements: ["AI returned unstructured output; showing generated documents only."],
		craftedResumeText: resumePart,
		coverLetterText: coverPart,
	};
}

async function readResumeText(file) {
	try {
		const content = await file.text();
		const cleanContent = content
			.replace(/[^\x20-\x7E\n\r\t]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (!cleanContent) {
			return `Resume filename: ${file.name}. Resume text extraction was limited; infer structure and generate best output.`;
		}
		return cleanContent.slice(0, 14000);
	} catch {
		return `Resume filename: ${file.name}. Resume text extraction failed; infer likely structure and produce best possible resume and cover letter.`;
	}
}

if (
	resumeForm &&
	resumeFileInput &&
	fileLabel &&
	analyzeBtn &&
	processingScreen &&
	processingText
) {
	const processingMessages = [
		"Your resume sucks. We'll fix it.",
		"Bad resume in. Great resume out.",
		"Diagnose. Rebuild. Land the job.",
	];

	resumeFileInput.addEventListener("change", () => {
		const selectedFile = resumeFileInput.files?.[0];
		fileLabel.textContent = selectedFile
			? `Selected: ${selectedFile.name}`
			: "Click to choose a PDF or DOCX resume";
	});

	resumeForm.addEventListener("submit", async (event) => {
		event.preventDefault();

		if (analysisInFlight) {
			fileLabel.textContent = "Analysis already in progress. Please wait.";
			return;
		}

		if (!resumeFileInput.files?.length) {
			fileLabel.textContent = "Please select a resume file first";
			return;
		}

		analysisInFlight = true;

		analyzeBtn.disabled = true;
		processingScreen.classList.remove("hidden");
		processingScreen.classList.add("flex");
		processingText.textContent = processingMessages[0];
		processingText.style.opacity = "1";

		const textDuration = 2000;
		const fadeDuration = 300;
		const totalDuration = 8000;
		const startTime = Date.now();
		const selectedFile = resumeFileInput.files[0];
		const resumeText = await readResumeText(selectedFile);
		const aiPromise = analyzeResumeWithAI(resumeText)
			.then((aiData) => {
				saveAIData(aiData);
				return aiData;
			})
			.catch((error) => {
				clearAIData();
				throw error;
			});

		const loaderPromise = (async () => {
			for (let i = 1; i < processingMessages.length; i += 1) {
				await sleep(textDuration);
				processingText.style.opacity = "0";
				await sleep(fadeDuration);
				processingText.textContent = processingMessages[i];
				processingText.style.opacity = "1";
			}
		})();

		try {
			await Promise.all([aiPromise, loaderPromise]);
		} catch (error) {
			clearAIData();
			analysisInFlight = false;
			analyzeBtn.disabled = false;
			processingScreen.classList.remove("flex");
			processingScreen.classList.add("hidden");
			const message = String(error?.message || "Unknown error");
			if (/rate limited|1 request at a time/i.test(message)) {
				fileLabel.textContent = "AI rate limit reached. Wait a few seconds and try once again.";
			} else {
				fileLabel.textContent = `AI failed: ${message}`;
			}
			console.error("AI analysis failed:", error);
			return;
		}

		const elapsed = Date.now() - startTime;
		const remaining = Math.max(0, totalDuration - elapsed);
		await sleep(remaining);
		analysisInFlight = false;

		window.location.href = "analysis.html";
	});
}

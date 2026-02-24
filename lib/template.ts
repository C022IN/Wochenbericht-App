import { access, readFile } from "node:fs/promises";
import path from "node:path";

// Falls back to the bundled blank template shipped in examples/empty/.
// Override via TEMPLATE_XLSX_PATH in .env.local to use your own file.
const DEFAULT_TEMPLATE_PATH = path.join(
  process.cwd(),
  "examples",
  "empty",
  "AXIANS OFM Wochenbericht Februar 2026 KW 9.xlsx"
);

export function getTemplateUrl(): string | null {
  return process.env.TEMPLATE_XLSX_URL?.trim() || null;
}

export function getTemplatePath(): string {
  return process.env.TEMPLATE_XLSX_PATH?.trim() || DEFAULT_TEMPLATE_PATH;
}

export async function getTemplateStatus() {
  const templateUrl = getTemplateUrl();
  if (templateUrl) {
    return {
      ok: true as const,
      templatePath: templateUrl
    };
  }

  const templatePath = getTemplatePath();
  try {
    await access(templatePath);
    return {
      ok: true as const,
      templatePath
    };
  } catch {
    return {
      ok: false as const,
      templatePath,
      error:
        "Excel template not found. Set TEMPLATE_XLSX_PATH in .env.local to your Wochenbericht .xlsx file."
    };
  }
}

export async function loadTemplateBytes() {
  const templateUrl = getTemplateUrl();
  if (templateUrl) {
    const res = await fetch(templateUrl, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Template download failed (${res.status})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      filename: path.basename(new URL(templateUrl).pathname) || "template.xlsx",
      bytes: Buffer.from(arrayBuffer)
    };
  }

  const templatePath = getTemplatePath();
  return {
    filename: path.basename(templatePath),
    bytes: await readFile(templatePath)
  };
}

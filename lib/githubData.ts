const OWNER = "ZurtanCasa";
const REPO = "ZurtanCasa";
const BRANCH = "main";

function ghHeaders() {
  const token = process.env.GITHUB_API_TOKEN;
  if (!token) {
    throw new Error("Falta configurar GITHUB_API_TOKEN en las variables de entorno de Vercel.");
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

export async function readDataFile(filePath: string): Promise<{ content: any; sha: string }> {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`,
    { headers: ghHeaders(), cache: "no-store" }
  );
  if (!res.ok) {
    throw new Error(`No se pudo leer ${filePath} desde GitHub (${res.status})`);
  }
  const json = await res.json();
  const content = JSON.parse(Buffer.from(json.content, "base64").toString("utf-8"));
  return { content, sha: json.sha as string };
}

export async function writeDataFile(filePath: string, content: any, sha: string, message: string): Promise<void> {
  const body = {
    message,
    content: Buffer.from(JSON.stringify(content, null, 2) + "\n", "utf-8").toString("base64"),
    sha,
    branch: BRANCH,
    committer: { name: "zurtancasa-bot", email: "bot@zurtancasa.com" },
  };
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`, {
    method: "PUT",
    headers: ghHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `No se pudo actualizar ${filePath} (${res.status})`);
  }
}

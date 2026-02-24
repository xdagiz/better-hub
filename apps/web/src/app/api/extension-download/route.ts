import { readFile } from "fs/promises";
import { join } from "path";

export async function GET() {
	const filePath = join(process.cwd(), "public", "extension", "better-hub-chrome.zip");
	const buffer = await readFile(filePath);

	return new Response(buffer, {
		headers: {
			"Content-Type": "application/zip",
			"Content-Disposition": 'attachment; filename="better-hub-chrome.zip"',
			"Content-Length": buffer.byteLength.toString(),
			"Content-Encoding": "identity",
			"Cache-Control": "no-transform",
		},
	});
}

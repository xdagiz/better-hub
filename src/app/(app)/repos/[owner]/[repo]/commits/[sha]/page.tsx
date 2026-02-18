import { getCommit } from "@/lib/github";
import { highlightDiffLines, type SyntaxToken } from "@/lib/shiki";
import { CommitDetail } from "@/components/repo/commit-detail";

export default async function CommitDetailPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; sha: string }>;
}) {
  const { owner, repo, sha } = await params;

  const commit = await getCommit(owner, repo, sha);

  if (!commit) {
    return (
      <div className="py-16 text-center">
        <p className="text-xs text-muted-foreground font-mono">
          Commit not found
        </p>
      </div>
    );
  }

  // Pre-highlight diff lines with Shiki
  const highlightData: Record<string, Record<string, SyntaxToken[]>> = {};
  if (commit.files && commit.files.length > 0) {
    await Promise.all(
      commit.files.map(async (file: any) => {
        if (file.patch) {
          try {
            highlightData[file.filename] = await highlightDiffLines(
              file.patch,
              file.filename
            );
          } catch {
            // silent — fall back to plain text
          }
        }
      })
    );
  }

  return (
    <CommitDetail
      owner={owner}
      repo={repo}
      commit={commit as any}
      highlightData={highlightData}
    />
  );
}

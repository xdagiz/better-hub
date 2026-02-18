import { getRepoWorkflows, getRepoWorkflowRuns } from "@/lib/github";
import { ActionsList } from "@/components/actions/actions-list";

export default async function ActionsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;

  const [workflows, runs] = await Promise.all([
    getRepoWorkflows(owner, repo),
    getRepoWorkflowRuns(owner, repo),
  ]);

  return (
    <ActionsList
      owner={owner}
      repo={repo}
      workflows={workflows as any}
      runs={runs as any}
    />
  );
}

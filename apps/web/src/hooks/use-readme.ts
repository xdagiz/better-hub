import { useQuery } from "@tanstack/react-query";
import { revalidateReadme } from "@/app/(app)/repos/[owner]/[repo]/readme-actions";

export function useReadme(
	owner: string,
	repo: string,
	branch: string,
	initialHtml: string | null,
) {
	return useQuery({
		queryKey: ["readme", owner, repo],
		queryFn: () => revalidateReadme(owner, repo, branch),
		initialData: initialHtml ?? undefined,
		staleTime: Infinity,
		gcTime: Infinity,
		refetchOnMount: "always",
	});
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitFork, Loader2 } from "lucide-react";
import { forkRepo } from "@/app/(app)/repos/actions";
import { cn, formatNumber } from "@/lib/utils";

interface ForkButtonProps {
	owner: string;
	repo: string;
	forkCount: number;
}

export function ForkButton({ owner, repo, forkCount }: ForkButtonProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const handleFork = () => {
		setError(null);
		startTransition(async () => {
			const res = await forkRepo(owner, repo);
			if (res.error) {
				setError(res.error);
				return;
			}
			if (res.full_name) {
				router.push(`/${res.full_name}`);
			}
		});
	};

	return (
		<div className="flex flex-col items-center">
			<button
				onClick={handleFork}
				disabled={isPending}
				className={cn(
					"flex items-center justify-center gap-1.5 text-[11px] font-mono py-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full",
					isPending && "opacity-60 pointer-events-none",
				)}
			>
				{isPending ? (
					<Loader2 className="w-3 h-3 animate-spin" />
				) : (
					<GitFork className="w-3 h-3" />
				)}
				{isPending ? "Forking..." : "Fork"}
				<span className="text-muted-foreground/50 tabular-nums">
					{formatNumber(forkCount)}
				</span>
			</button>
			{error && (
				<p className="text-[10px] text-destructive font-mono mt-0.5">
					{error}
				</p>
			)}
		</div>
	);
}

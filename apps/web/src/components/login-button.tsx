"use client";

import { signIn } from "@/lib/auth-client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

function GithubIcon({ className }: { className?: string }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
			<path
				fill="currentColor"
				d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489c.5.092.682-.217.682-.482c0-.237-.008-.866-.013-1.7c-2.782.603-3.369-1.342-3.369-1.342c-.454-1.155-1.11-1.462-1.11-1.462c-.908-.62.069-.608.069-.608c1.003.07 1.531 1.03 1.531 1.03c.892 1.529 2.341 1.087 2.91.832c.092-.647.35-1.088.636-1.338c-2.22-.253-4.555-1.11-4.555-4.943c0-1.091.39-1.984 1.029-2.683c-.103-.253-.446-1.27.098-2.647c0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025c.546 1.377.203 2.394.1 2.647c.64.699 1.028 1.592 1.028 2.683c0 3.842-2.339 4.687-4.566 4.935c.359.309.678.919.678 1.852c0 1.336-.012 2.415-.012 2.743c0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10"
			/>
		</svg>
	);
}

function ArrowRightIcon({ className }: { className?: string }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
			<path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
				d="M5 12h14m-7-7l7 7l-7 7"
			/>
		</svg>
	);
}

function LoadingSpinner({ className }: { className?: string }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
			<g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
				<path
					strokeDasharray="60"
					strokeDashoffset="60"
					strokeOpacity=".3"
					d="M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z"
				>
					<animate
						fill="freeze"
						attributeName="stroke-dashoffset"
						dur="1.3s"
						values="60;0"
					/>
				</path>
				<path
					strokeDasharray="15"
					strokeDashoffset="15"
					d="M12 3C16.9706 3 21 7.02944 21 12"
				>
					<animate
						fill="freeze"
						attributeName="stroke-dashoffset"
						dur="0.3s"
						values="15;0"
					/>
					<animateTransform
						attributeName="transform"
						dur="1.5s"
						repeatCount="indefinite"
						type="rotate"
						values="0 12 12;360 12 12"
					/>
				</path>
			</g>
		</svg>
	);
}

export function LoginButton() {
	const { setTheme } = useTheme();
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		setTheme("light");
	}, [setTheme]);

	return (
		<button
			onClick={() => {
				setLoading(true);
				signIn.social({
					provider: "github",
					callbackURL: "/dashboard",
				});
			}}
			disabled={loading}
			className="w-full flex items-center justify-center gap-3 bg-foreground text-background font-medium py-3 px-6 rounded-md text-sm hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
		>
			{loading ? (
				<LoadingSpinner className="w-4 h-4" />
			) : (
				<GithubIcon className="w-4 h-4" />
			)}
			{loading ? "Redirecting..." : "Continue with GitHub"}
			{!loading && <ArrowRightIcon className="w-3.5 h-3.5 ml-auto" />}
		</button>
	);
}

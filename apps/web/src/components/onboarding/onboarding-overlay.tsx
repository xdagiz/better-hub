"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalChatOptional } from "@/components/shared/global-chat-provider";
import { authClient } from "@/lib/auth-client";

interface OnboardingOverlayProps {
	userName: string;
	userAvatar: string;
	bio: string;
	company: string;
	location: string;
	publicRepos: number;
	followers: number;
	createdAt: string;
	onboardingDone: boolean;
}

const GHOST_WELCOME_USER = "Hey Ghost! I just got here. What can you help me with?";

const GHOST_WELCOME_RESPONSE = `Hey! Welcome to Better Hub. I'm Ghost, your AI assistant. Here's what I can help with:

- **Review PRs and code** — I can summarize changes, spot issues, and help you understand diffs
- **Navigate repos** — ask me about any file, function, or piece of code
- **Triage issues** — I'll help you understand context and suggest next steps
- **Write and refine** — commit messages, PR descriptions, comments

**Three shortcuts to know:**
- **⌘K** — Command Center. Search repos, switch themes, navigate anywhere
- **⌘I** — Toggle me (Ghost) open or closed
- **⌘/** — Quick search across repos

**Things to try first:**
1. Open a repo and ask me about the code
2. Hit ⌘K and explore the Command Center
3. Check out Prompt Requests on any repo — submit a prompt and an AI agent implements it`;

export function OnboardingOverlay({
	userName,
	userAvatar,
	onboardingDone,
}: OnboardingOverlayProps) {
	const [mounted, setMounted] = useState(false);
	const [visible, setVisible] = useState(false);
	const [exiting, setExiting] = useState(false);
	const globalChat = useGlobalChatOptional();
	const ghostOpenedRef = useRef(false);

	useEffect(() => {
		setMounted(true);
		if (typeof window !== "undefined") {
			const params = new URLSearchParams(window.location.search);
			const force = params.has("onboarding");
			if (!force && onboardingDone) return;
			const t = setTimeout(() => setVisible(true), 400);
			return () => clearTimeout(t);
		}
	}, [onboardingDone]);

	const markDone = useCallback(() => {
		authClient.updateUser({
			onboardingDone: true,
		});
	}, []);

	const dismiss = useCallback(() => {
		if (globalChat && !ghostOpenedRef.current) {
			ghostOpenedRef.current = true;
			globalChat.toggleChat();
			// Small delay so the panel opens, then inject with fake "thinking" pause
			setTimeout(() => {
				window.dispatchEvent(
					new CustomEvent("ghost-welcome-inject", {
						detail: {
							userMessage: GHOST_WELCOME_USER,
							assistantMessage: GHOST_WELCOME_RESPONSE,
							// Chat component will show a brief loading state before revealing
							simulateDelay: 1200,
						},
					}),
				);
			}, 500);
		}
		markDone();
		setExiting(true);
		setTimeout(() => {
			setVisible(false);
		}, 500);
	}, [globalChat, markDone]);

	// Enter to dismiss
	useEffect(() => {
		if (!visible) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape" || e.key === "Enter") {
				e.preventDefault();
				dismiss();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [visible, dismiss]);

	if (!mounted || !visible) return null;

	const firstName = userName.split(" ")[0] || userName;

	return createPortal(
		<div
			className={cn(
				"fixed inset-0 z-[60] transition-all duration-500",
				exiting && "opacity-0 scale-[1.02] pointer-events-none",
			)}
		>
			<div className="absolute inset-0 bg-black overflow-hidden">
				{/* ── Gradient orbs ── */}
				<div className="absolute inset-0 overflow-hidden pointer-events-none">
					<div
						className="absolute rounded-full blur-[140px]"
						style={{
							width: 700,
							height: 700,
							background: "radial-gradient(circle, rgba(99,102,241,0.35), transparent 70%)",
							top: "-10%",
							left: "-15%",
							animation: "onboarding-orb-float-1 28s ease-in-out infinite",
							opacity: 0.045,
						}}
					/>
					<div
						className="absolute rounded-full blur-[120px]"
						style={{
							width: 550,
							height: 550,
							background: "radial-gradient(circle, rgba(168,85,247,0.3), transparent 70%)",
							bottom: "-5%",
							right: "-10%",
							animation: "onboarding-orb-float-2 34s ease-in-out infinite",
							opacity: 0.035,
						}}
					/>
					<div
						className="absolute rounded-full blur-[100px]"
						style={{
							width: 400,
							height: 400,
							background: "radial-gradient(circle, rgba(236,72,153,0.2), transparent 70%)",
							top: "40%",
							left: "50%",
							animation: "onboarding-orb-float-3 22s ease-in-out infinite",
							opacity: 0.03,
						}}
					/>
				</div>

				{/* ── Background video ── */}
				<video
					autoPlay
					muted
					loop
					playsInline
					className="absolute inset-0 w-full h-full object-cover opacity-[0.2] blur-sm"
					style={{ minWidth: "100%", minHeight: "100%" }}
				>
					<source src="/onboarding.mp4" type="video/mp4" />
				</video>

				{/* ── Halftone ── */}
				<div
					className="absolute inset-0 pointer-events-none opacity-[0.35]"
					style={{
						backgroundImage:
							"radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px), radial-gradient(circle, rgba(255,255,255,0.035) 0.5px, transparent 0.5px)",
						backgroundSize: "24px 24px, 12px 12px",
						backgroundPosition: "0 0, 6px 6px",
					}}
				/>

				{/* ── Film grain ── */}
				<div
					className="absolute pointer-events-none opacity-[0.025]"
					style={{
						inset: "-50%",
						width: "200%",
						height: "200%",
						backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
						animation: "onboarding-grain 8s steps(10) infinite",
					}}
				/>

				{/* ── Gradient overlays (darken edges, keep center visible) ── */}
				<div className="absolute inset-0 bg-black/40 pointer-events-none" />
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,black_90%)] pointer-events-none" />

				{/* ── Content ── */}
				<div className="relative z-10 flex items-center justify-center w-full h-full px-6 sm:px-10">
					<div className="w-full max-w-md text-left ob-fade-up">
						<span>B.</span>

						<p className="text-[13px] sm:text-[14px] text-white/50 leading-[1.8] sm:leading-[1.85]">
							Hey{firstName ? ` ${firstName}` : ""},
						</p>

						<p className="text-[13px] sm:text-[14px] text-white/50 leading-[1.8] sm:leading-[1.85] mt-4 ob-fade-up-d1">
							Welcome to Better Hub. This is built by the
							team behind{" "}
							<a
								href="https://better-auth.com"
								target="_blank"
								rel="noopener noreferrer"
								className="text-white/70 underline underline-offset-2 decoration-white/20 hover:text-white/90 transition-colors"
							>
								Better Auth
							</a>
							. We spend a lot of our time on GitHub, so
							we wanted to improve our own experience.
						</p>

						<p className="text-[13px] sm:text-[14px] text-white/50 leading-[1.8] sm:leading-[1.85] mt-4 ob-fade-up-d2">
							We&apos;re trying to improve everything from
							the home page experience to repo overview,
							PR reviews, and AI integration. Faster and
							more pleasant overall. Still GitHub
							underneath. On desktop, most things are
							accessible through keyboard shortcuts.{" "}
							<kbd className="text-[11px] px-1 py-0.5 rounded-sm font-mono text-white/40">
								⌘K
							</kbd>{" "}
							opens the command center,{" "}
							<kbd className="text-[11px] px-1 py-0.5 rounded-sm font-mono text-white/40">
								⌘I
							</kbd>{" "}
							opens Ghost, a super helpful AI assistant.
						</p>

						<p className="text-[13px] sm:text-[14px] text-white/50 leading-[1.8] sm:leading-[1.85] mt-4 ob-fade-up-d3">
							We&apos;re also trying new ideas like Prompt
							Requests, where teams and communities
							collaborate on a prompt and the actual
							implementation is made by an agent.
						</p>

						<p className="text-[13px] sm:text-[14px] text-white/50 leading-[1.8] sm:leading-[1.85] mt-4 ob-fade-up-d4">
							Hope you like it.
						</p>

						<p className="text-[13px] sm:text-[14px] text-white/40 mt-4 ob-fade-up-d5">
							— Bereket
						</p>

						<button
							onClick={dismiss}
							className="group mt-7 inline-flex items-center gap-2.5 px-5 py-2 rounded-sm bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all duration-300 cursor-pointer ob-fade-up-d6"
						>
							Get started
							<ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
						</button>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}

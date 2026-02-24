export interface ProfileScoreInput {
	followers: number;
	following: number;
	publicRepos: number;
	accountCreated: string;
	hasBio: boolean;
	totalStars: number;
	topRepoStars: number;
	totalForks: number;
	totalContributions: number;
	orgCount: number;
	languageCount: number;
}

export interface ProfileScoreResult {
	total: number; // 0-100
	communityPresence: number; // 0-25
	ossImpact: number; // 0-30
	activity: number; // 0-25
	ecosystem: number; // 0-20
}

function accountAgeYears(created: string): number {
	return (Date.now() - new Date(created).getTime()) / 3.154e10;
}

function scoreCommunityPresence(input: ProfileScoreInput): number {
	let s = 0;

	// Account age: <1y=1, 1-3y=2, 3-6y=3, 6-10y=4, 10+=5
	const years = accountAgeYears(input.accountCreated);
	s += years < 1 ? 1 : years < 3 ? 2 : years < 6 ? 3 : years < 10 ? 4 : 5;

	// Followers: 0-5=1, 5-25=3, 25-100=5, 100-500=8, 500-2k=10, 2k+=12
	const f = input.followers;
	s += f < 5 ? 1 : f < 25 ? 3 : f < 100 ? 5 : f < 500 ? 8 : f < 2000 ? 10 : 12;

	// Follower/following ratio: <0.5=0, 0.5-1=1, 1-3=2, 3-10=3, 10+=4
	const ratio = input.following > 0 ? input.followers / input.following : input.followers > 0 ? 10 : 0;
	s += ratio < 0.5 ? 0 : ratio < 1 ? 1 : ratio < 3 ? 2 : ratio < 10 ? 3 : 4;

	// Has bio: yes=4, no=0
	if (input.hasBio) s += 4;

	return Math.min(s, 25);
}

function scoreOSSImpact(input: ProfileScoreInput): number {
	let s = 0;

	// Top repo stars: 0=0, 1-10=2, 10-50=5, 50-200=8, 200-1k=11, 1k+=15
	const top = input.topRepoStars;
	s += top === 0 ? 0 : top <= 10 ? 2 : top <= 50 ? 5 : top <= 200 ? 8 : top <= 1000 ? 11 : 15;

	// Total stars: 0=0, 1-20=2, 20-100=4, 100-500=6, 500-2k=8, 2k+=10
	const ts = input.totalStars;
	s += ts === 0 ? 0 : ts <= 20 ? 2 : ts <= 100 ? 4 : ts <= 500 ? 6 : ts <= 2000 ? 8 : 10;

	// Total forks: 0=0, 1-10=1, 10-50=2, 50-200=3, 200+=5
	const fk = input.totalForks;
	s += fk === 0 ? 0 : fk <= 10 ? 1 : fk <= 50 ? 2 : fk <= 200 ? 3 : 5;

	return Math.min(s, 30);
}

function scoreActivity(input: ProfileScoreInput): number {
	let s = 0;

	// Yearly contributions: 0=0, 1-50=2, 50-200=5, 200-500=8, 500-1k=11, 1k+=15
	const c = input.totalContributions;
	s += c === 0 ? 0 : c <= 50 ? 2 : c <= 200 ? 5 : c <= 500 ? 8 : c <= 1000 ? 11 : 15;

	// Public repos: 0=0, 1-5=2, 5-15=4, 15-40=6, 40-100=8, 100+=10
	const r = input.publicRepos;
	s += r === 0 ? 0 : r <= 5 ? 2 : r <= 15 ? 4 : r <= 40 ? 6 : r <= 100 ? 8 : 10;

	return Math.min(s, 25);
}

function scoreEcosystem(input: ProfileScoreInput): number {
	let s = 0;

	// Org memberships: 0=0, 1=3, 2-3=6, 4-7=9, 8+=12
	const o = input.orgCount;
	s += o === 0 ? 0 : o === 1 ? 3 : o <= 3 ? 6 : o <= 7 ? 9 : 12;

	// Language diversity: 0-1=0, 2=2, 3-4=4, 5-7=6, 8+=8
	const l = input.languageCount;
	s += l <= 1 ? 0 : l === 2 ? 2 : l <= 4 ? 4 : l <= 7 ? 6 : 8;

	return Math.min(s, 20);
}

export function computeUserProfileScore(input: ProfileScoreInput): ProfileScoreResult {
	const communityPresence = scoreCommunityPresence(input);
	const ossImpact = scoreOSSImpact(input);
	const activity = scoreActivity(input);
	const ecosystem = scoreEcosystem(input);

	return {
		total: communityPresence + ossImpact + activity + ecosystem,
		communityPresence,
		ossImpact,
		activity,
		ecosystem,
	};
}

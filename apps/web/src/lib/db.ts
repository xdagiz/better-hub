import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function makePrisma() {
	const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
	return new PrismaClient({ adapter });
}

type ExtendedPrismaClient = ReturnType<typeof makePrisma>;

const globalForPrisma = globalThis as typeof globalThis & {
	__prisma?: ExtendedPrismaClient;
};

export const prisma: ExtendedPrismaClient = globalForPrisma.__prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.__prisma = prisma;
}

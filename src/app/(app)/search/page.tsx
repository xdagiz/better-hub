import { SearchContent } from "@/components/search/search-content";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; lang?: string; page?: string; type?: string }>;
}) {
  const params = await searchParams;
  return (
    <SearchContent
      initialQuery={params.q || ""}
      initialLanguage={params.lang || ""}
      initialPage={Number(params.page) || 1}
      initialType={(params.type as any) || "code"}
    />
  );
}

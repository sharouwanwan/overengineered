// Normalize once per catalog entry; queries use literal matching, never Lua patterns.
export function normalizeBlockSearch(text: string): string {
	return text
		.fullLower()
		.gsub("1/4", " quarter ")[0]
		.gsub("1/2", " half ")[0]
		.gsub("1/8", " eighth ")[0]
		.gsub("[%p%s]+", " ")[0]
		.trim();
}
export function blockSearchScore(
	fields: readonly string[],
	query: string,
	tokens: readonly string[],
): number | undefined {
	if (fields.includes(query)) return 0;
	if (fields.any((field) => field.startsWith(query))) return 1;
	if (fields.any((field) => field.find(query, 1, true)[0] !== undefined)) return 2;
	if (tokens.all((token) => fields.any((field) => field.split(" ").any((word) => word.startsWith(token))))) return 3;
	if (tokens.all((token) => fields.any((field) => field.find(token, 1, true)[0] !== undefined))) return 4;
	return undefined;
}

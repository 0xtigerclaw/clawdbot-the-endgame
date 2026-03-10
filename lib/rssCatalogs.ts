import type { ImportSource } from "./rssImport";

export const NEOLABS_NAMES: string[] = [
  "Thinking Machines Lab",
  "SSI (Safe Superintelligence)",
  "Skild AI",
  "Poolside",
  "Reflection AI",
  "Project Prometheus",
  "Physical Intelligence",
  "Unconventional AI",
  "Humans8n",
  "Inflection AI",
  "Isomorphic Labs",
  "AIM Labs",
  "Decart",
  "Xaira Therapeutics",
  "Sakana AI",
  "General Intuition",
  "Liquid AI",
  "H (The H Company)",
  "Magic",
  "Periodic Labs",
  "Harmonic",
  "AI21 Labs",
  "Lila Sciences",
  "Chai Discovery",
  "Flapping Airplanes",
  "Recursive",
  "World Labs",
  "EvolutionaryScale",
  "AAI",
  "Kyutai",
  "Goodfire",
  "Imbue",
  "Reka",
  "Essential AI",
  "Zyphra",
  "Nous Research",
  "Aaru",
  "Simile",
  "Isara",
  "Moonvalley",
  "Hark",
  "Prime Intellect",
  "Ndea",
  "Inception Labs",
  "Adaption Labs",
  "Eldorian",
  "Genesis AI",
  "CuspAI",
  "Poetiq",
  "Axiom Math",
];

function googleNewsRssFor(query: string): string {
  const q = encodeURIComponent(`"${query}" AI`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

export function buildNeoLabsCatalog(category = "NeoLabs"): ImportSource[] {
  return NEOLABS_NAMES.map((name) => ({
    name,
    category,
    url: googleNewsRssFor(name),
  }));
}

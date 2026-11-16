/**
 * Instructions envoyées aux modèles de vision et de texte.
 * Elles sont centralisées ici pour être relues, testées et améliorées facilement.
 */
import { STYLE_LABELS, type StyleId } from "../shared/types.js";
import { LIGHTING_OPTIONS, MOOD_OPTIONS } from "./styles.js";

export type PromptLanguage = "en" | "fr";
const LANG_NAME: Record<PromptLanguage, string> = { en: "anglais", fr: "français" };

const HONESTY_RULES = `Règles d'exactitude :
- Décris uniquement ce qui est réellement visible dans l'image. N'invente aucun objet, lieu, marque, texte ou détail absent.
- N'identifie pas les personnes réelles (pas de nom, pas de célébrité) : décris seulement leur apparence visible.
- Quand une information ne peut pas être déterminée avec certitude (focale, heure, matière, âge…), formule une estimation prudente (« semble », « probablement ») et ajoute-la aussi à la liste « uncertainties ».
- Si une rubrique ne s'applique pas (aucun personnage, aucun texte visible…), renvoie une liste vide ou une chaîne vide plutôt que d'inventer.`;

export function analysisSystem(lang: PromptLanguage): string {
  return `Tu es directeur artistique et ingénieur de prompts pour les générateurs d'images (Stable Diffusion, gpt-image, Flux, Midjourney). On te montre une image : tu l'analyses avec précision, puis tu rédiges des prompts qui permettent de recréer une image aussi proche que possible (même sujet, composition, lumière, palette et style).

${HONESTY_RULES}

Rédige les champs d'analyse en français, de façon concrète et concise (phrases courtes, vocabulaire de photographe ou d'illustrateur).
- « colors.dominant » : 3 à 6 couleurs nommées précisément (ex. « bleu canard profond »).
- « keyElements » : les caractéristiques indispensables pour obtenir une image proche (ce qui la rend reconnaissable).

Rédige TOUS les prompts en ${LANG_NAME[lang]} :
- « detailed » : description complète et fluide (80 à 150 mots) couvrant sujet, décor, composition, caméra, lumière, couleurs, style, textures.
- « professional » : formulation optimisée pour un générateur : descripteurs séparés par des virgules, du plus important au moins important (sujet, action, décor, style, lumière, cadrage et optique, palette, qualité). 40 à 80 mots.
- « short » : version concise et efficace, 10 à 25 mots.
- « cinematic » : met l'accent sur la lumière, la caméra (angle, focale, profondeur de champ), l'atmosphère et l'étalonnage des couleurs. 50 à 90 mots.
- « negative » : éléments à éviter, séparés par des virgules : défauts courants (flou, artefacts, mains déformées si des mains sont visibles, texte parasite, filigrane) et styles ou éléments qui éloigneraient le résultat de cette image. Ne contredis jamais ce qui est visible.
- « structured » : chaque rubrique en une ou deux phrases ; « technical » mentionne le format (rapport largeur/hauteur) indiqué dans la demande.`;
}

export function analysisUserText(input: {
  width: number;
  height: number;
  ratio: string;
  nearest: string;
  orientation: string;
  palette: string[];
  notes: string;
}): string {
  const lines = [
    "Analyse cette image et produis les prompts demandés.",
    `Mesures exactes (calculées par le logiciel, fiables) : ${input.width} × ${input.height} px, rapport ${input.ratio} (format standard le plus proche : ${input.nearest}, ${input.orientation}).`,
  ];
  if (input.palette.length) {
    lines.push(`Palette mesurée sur les pixels (indicative, en hexadécimal) : ${input.palette.join(", ")}.`);
  }
  if (input.notes.trim()) {
    lines.push(`Précision de l'utilisateur (à prendre en compte sans inventer ce qui n'est pas visible) : ${input.notes.trim()}`);
  }
  return lines.join("\n");
}

export interface EnhanceOptions {
  detail: number; // 1 à 5
  style: StyleId;
  lighting: string;
  mood: string;
  vertical: boolean;
  character: string;
  language: PromptLanguage;
}

const DETAIL_TARGET: Record<number, string> = {
  1: "très concis : 15 à 30 mots",
  2: "concis : 30 à 50 mots",
  3: "équilibré : 50 à 80 mots",
  4: "riche : 80 à 120 mots",
  5: "très détaillé : 120 à 180 mots",
};

export const ENHANCE_SYSTEM = `Tu es un ingénieur de prompts spécialisé dans les images générées par IA. Tu transformes une idée, même très simple, en un prompt visuel professionnel, précis et structuré, directement utilisable par un générateur d'images.

Principes :
- Respecte l'intention de l'utilisateur : garde son sujet, ses choix et ses contraintes. Ne change pas le sujet.
- Ajoute ce qui manque pour une image réussie : détails du sujet, décor, moment et lumière, cadrage et optique, palette, matières et textures, style et niveau de finition.
- Préfère des descripteurs visuels concrets aux adjectifs vagues (« sublime », « incroyable »).
- N'ajoute ni texte à écrire dans l'image, ni marque, ni personne réelle, sauf demande explicite.
- Le prompt négatif liste ce qu'il faut éviter (défauts techniques et éléments contraires à l'intention), séparé par des virgules.
- « changes » : 2 à 5 puces très courtes, en français, expliquant ce que tu as amélioré.

Exemple de niveau attendu (ne pas recopier) :
Idée : « Un renard dans une forêt. »
Prompt amélioré : « Un renard roux au pelage détaillé se tient au milieu d'une forêt dense à l'aube, rayons de soleil traversant les arbres, brume légère au ras du sol, composition cinématographique, profondeur de champ naturelle, textures réalistes, éclairage volumétrique, détails fins, qualité visuelle haut de gamme. »`;

export function enhanceUserText(prompt: string, o: EnhanceOptions): string {
  const lines = [`Idée ou prompt de départ :\n"""\n${prompt.trim()}\n"""`, "", "Consignes :"];
  lines.push(`- Langue du prompt final : ${LANG_NAME[o.language]}.`);
  lines.push(`- Niveau de détail : ${DETAIL_TARGET[o.detail] ?? DETAIL_TARGET[3]}.`);
  if (o.style !== "aucun") lines.push(`- Style artistique imposé : ${STYLE_LABELS[o.style]}.`);
  const lighting = LIGHTING_OPTIONS[o.lighting];
  if (lighting) lines.push(`- Éclairage souhaité : ${lighting}.`);
  const mood = MOOD_OPTIONS[o.mood];
  if (mood) lines.push(`- Ambiance souhaitée : ${mood}.`);
  if (o.vertical) {
    lines.push(
      "- Format vertical 9:16 pour TikTok / Instagram Reels : composition pensée pour la verticale, sujet principal lisible au centre, éléments importants hors des marges haute et basse (zones masquées par l'interface), cadrage serré et dynamique.",
    );
  }
  if (o.character.trim()) {
    lines.push(
      `- Personnage de référence à préserver à l'identique (reprends ces caractéristiques mot pour mot ou presque, sans les modifier) :\n"""\n${o.character.trim()}\n"""`,
    );
  }
  return lines.join("\n");
}

export function translateSystem(target: PromptLanguage): string {
  return `Tu traduis des prompts destinés à des générateurs d'images vers le ${LANG_NAME[target]}.
- Traduis fidèlement, sans rien ajouter ni retirer.
- Conserve la structure (virgules, ordre des descripteurs) et la syntaxe spéciale éventuelle (parenthèses de pondération, « :1.2 », « --ar »).
- Garde les termes techniques usuels de photo et de cinéma sous leur forme consacrée (bokeh, 35mm, f/1.8, golden hour en anglais).
- Si le texte est déjà dans la langue cible, renvoie-le tel quel.`;
}

export const REWRITE_SYSTEMS = {
  reecrire: `Tu réécris des prompts pour générateurs d'images. Propose une nouvelle formulation du prompt donné, plus claire et mieux ordonnée (sujet d'abord, puis décor, style, lumière, cadrage), en conservant exactement le même contenu visuel. N'ajoute aucun élément nouveau. Garde la langue d'origine.`,
  enrichir: `Tu enrichis des prompts pour générateurs d'images. Conserve tout le contenu du prompt donné et ajoute des détails visuels cohérents qui le rendent plus précis : matières et textures, lumière, atmosphère, cadrage et optique, palette. N'en change pas le sujet ni le style. Garde la langue d'origine. Longueur finale : environ 1,5 à 2 fois l'original.`,
} as const;

export const SERIES_SYSTEM = `Tu es directeur artistique. Tu conçois une série d'images cohérentes (même histoire, même personnage, même univers visuel) pour un générateur d'images.
- « characterSheet » : fiche du personnage principal décrivant ses caractéristiques visuelles invariables (silhouette, visage, cheveux, couleurs, vêtements, accessoires). Si l'utilisateur fournit une fiche, reprends-la fidèlement.
- « styleGuide » : règles visuelles communes (style, palette, lumière, optique, grain, format).
- « scenes » : une entrée par image demandée, dans l'ordre du récit. Chaque prompt doit être autonome : il répète intégralement la description du personnage et les règles de style, puis décrit l'action, le décor et le cadrage propres à la scène. Varie les plans (large, moyen, gros plan) pour raconter l'histoire.
- « negativePrompt » : commun à toute la série.
Ne fais apparaître aucune personne réelle ni marque.`;

export function seriesUserText(input: { story: string; count: number; character: string; style: StyleId; vertical: boolean; language: PromptLanguage }): string {
  const lines = [
    `Histoire ou scène à décliner :\n"""\n${input.story.trim()}\n"""`,
    `Nombre d'images : ${input.count}.`,
    `Langue des prompts : ${LANG_NAME[input.language]} (la fiche et le guide de style aussi).`,
  ];
  if (input.style !== "aucun") lines.push(`Style imposé : ${STYLE_LABELS[input.style]}.`);
  if (input.vertical) lines.push("Format vertical 9:16 (TikTok / Reels) pour toutes les images.");
  if (input.character.trim()) lines.push(`Personnage de référence fourni :\n"""\n${input.character.trim()}\n"""`);
  return lines.join("\n");
}

export function characterSystem(lang: PromptLanguage): string {
  return `Tu rédiges des fiches de personnage pour obtenir le même personnage d'une image générée à l'autre.
À partir de l'image, décris en ${LANG_NAME[lang]} l'apparence visible du personnage principal : morphologie, visage, coiffure et couleur des cheveux, couleur des yeux si visible, tenue (coupe, matières, couleurs), accessoires, signes distinctifs.
${HONESTY_RULES}
- « description » : un paragraphe de 40 à 80 mots, directement insérable dans un prompt.
- « invariants » : les 4 à 8 caractéristiques à ne jamais changer.`;
}

# Moteurs d'IA : intégration, paramètres et ajout d'un nouveau moteur

Ce document décrit précisément comment Studio IA dialogue avec chaque moteur, ce qui est
réellement pris en charge, et comment en ajouter un. Le principe directeur : **aucun résultat
n'est jamais simulé**. Si aucun moteur compatible n'est connecté, la fonctionnalité affiche
un message explicite et reste indisponible.

## Vue d'ensemble

| Moteur | Type | Fonctions | Coût | Code |
|---|---|---|---|---|
| Claude (Anthropic) | API | Analyse d'image, amélioration / réécriture / traduction de prompts, séries, fiche personnage | Payant à l'usage | `server/src/engines/anthropic.ts` |
| Ollama | Local | Mêmes fonctions que Claude, hors ligne | Gratuit | `server/src/engines/ollama.ts` |
| OpenAI Images | API | Texte → image, image de référence, variantes | Payant à l'image | `server/src/engines/openai-images.ts` |
| Stability AI | API | Texte → image, référence, variantes, prompt négatif, graine, agrandissement ×4 | Payant (crédits) | `server/src/engines/stability.ts` |
| Stable Diffusion WebUI (Forge / AUTOMATIC1111) | Local | Texte → image, référence, variantes, négatif, graine, étapes, CFG, agrandissement ×2 | Gratuit | `server/src/engines/sdwebui.ts` |

Les tarifs affichés dans l'interface sont des **ordres de grandeur relevés en novembre 2026** et
sont présentés comme tels ; la grille officielle de chaque fournisseur fait foi (liens dans
Paramètres › Moteurs).

## Claude (Anthropic)

- SDK officiel `@anthropic-ai/sdk`, point d'accès `POST /v1/messages` (via `client.beta.messages.parse`).
- Modèle par défaut : `claude-opus-5-5` (`ANTHROPIC_MODEL`). Effort : `ANTHROPIC_EFFORT` (défaut `medium`).
- **Sorties structurées** : chaque tâche fournit un schéma Zod (`server/src/shared/schemas.ts`)
  converti en JSON Schema (`output_config.format`). La réponse est validée avant affichage.
- **Repli automatique** : `fallbacks: "default"` (bêta `server-side-fallback-2026-07-01`). Si le modèle
  décline une demande pour raison de sécurité, l'API la relance sur le modèle de repli recommandé.
  Un refus définitif (`stop_reason: "refusal"`) est signalé clairement à l'utilisateur.
- Les images sont envoyées en base64, réduites à 1 568 px maximum par l'interface (5 Mo max).
- Vérification de disponibilité : `GET /v1/models/{modèle}` (gratuit).
- Erreurs traduites : 401 (clé), 403, 404 (modèle), 429 (limite, avec délai), 5xx, délai dépassé.

## Ollama (local)

- `POST {OLLAMA_URL}/api/chat` avec `stream: false`, l'image en base64 dans `images`, et le
  **JSON Schema** de la tâche dans `format` (sorties structurées d'Ollama).
- Vérifications : `GET /api/tags` (modèle installé ?) et `POST /api/show` (le modèle sait-il lire
  les images ? champ `capabilities`).
- Modèles conseillés : `qwen2.5vl:7b` (≈ 6 Go, bon équilibre), `qwen2.5vl:3b` (machines modestes),
  `gemma3:12b` (plus précis). `OLLAMA_TEXT_MODEL` permet un modèle texte distinct.
- Les petits modèles respectent parfois mal les schémas complexes : la réponse est validée et,
  si elle est incomplète, l'utilisateur est invité à réessayer ou à choisir un modèle plus grand.

## OpenAI Images

- Génération : `POST /v1/images/generations` (`model`, `prompt`, `n`, `size`, `quality`, `output_format: png`).
- Image de référence et variantes : `POST /v1/images/edits` (multipart, champ `image`).
- Modèle par défaut `gpt-image-2` (`OPENAI_IMAGE_MODEL`). Le diagnostic interroge `GET /v1/models` et
  signale si le modèle choisi n'est pas disponible pour le compte.
- Formats : tailles d'environ 1 mégapixel, multiples de 16 (1:1 → 1024×1024, 3:2 → 1536×1024,
  16:9 → 1536×864, 9:16 → 864×1536, 4:5 → 1024×1280). Si un modèle refuse ces tailles, réglez
  `OPENAI_FLEXIBLE_SIZES=false` : les tailles historiques (1024×1024, 1536×1024, 1024×1536) sont
  alors utilisées et 16:9 / 4:5 sont approchés — l'interface l'indique.
- Qualité : brouillon → `low`, standard → `medium`, haute → `high`.
- **Pas de prompt négatif natif** : les éléments à éviter sont ajoutés en fin de prompt
  (`Avoid: …`). Le prompt exact envoyé est conservé et visible dans l'aperçu de l'image.
- Pas de graine : l'interface ne propose pas ce réglage pour ce moteur.

## Stability AI

- Génération : `POST /v2beta/stable-image/generate/{core|ultra}` ou `/generate/sd3` (champ `model`),
  multipart, `Accept: application/json` → `{ image, finish_reason, seed }`.
- Paramètres : `aspect_ratio` (les 5 formats sont natifs), `negative_prompt`, `seed`,
  `style_preset` (Core uniquement, quand le style choisi a un équivalent), `output_format: png`.
- Une requête par image : 4 images = 4 fois le coût unitaire (l'interface le rappelle).
- Image de référence : `generate/sd3` en `mode=image-to-image` avec `strength` (modèle `sd3.5-large`
  si le modèle configuré est Core ou Ultra). Le format de sortie suit alors celui de la référence.
- Agrandissement : `POST /v2beta/stable-image/upscale/fast` (×4, image d'environ 1 mégapixel maximum).
- Diagnostic : `GET /v1/user/balance` (affiche le solde de crédits).
- `finish_reason: CONTENT_FILTERED` est signalé comme un filtrage, jamais remplacé par une autre image.

## Stable Diffusion WebUI (Forge / AUTOMATIC1111)

- Lancer WebUI avec `--api`. Adresse par défaut `http://127.0.0.1:7860` (`SD_WEBUI_URL`).
- Texte → image : `POST /sdapi/v1/txt2img` ; référence : `POST /sdapi/v1/img2img`
  (`init_images`, `denoising_strength`) ; agrandissement : `POST /sdapi/v1/extra-single-image` (×2,
  agrandisseur `SD_WEBUI_UPSCALER`).
- Dimensions calculées pour chaque format à partir de `SD_WEBUI_BASE_SIZE` (1024 pour SDXL, 512 pour
  SD 1.5), arrondies au multiple de 8. Les graines réellement utilisées sont lues dans `info.all_seeds`.
- Qualité → nombre d'étapes : brouillon 16, standard 28, haute 40 (modifiable dans les paramètres avancés).
- Diagnostic : `GET /sdapi/v1/sd-models` (404 = API désactivée, liste vide = aucun modèle installé).

## Ajouter un moteur

1. Créez `server/src/engines/mon-moteur.ts` qui implémente l'une des interfaces de
   `server/src/engines/types.ts` :
   - `ImageEngine` : `describe()`, `probe()`, `generate()` et, si possible, `upscale()` ;
   - `VisionTextEngine` : `describe()`, `probe()`, `structured()` (réponse JSON validée par le schéma Zod fourni).
2. Dans `describe()`, déclarez honnêtement les **capacités** (`generate`, `reference`, `negative`,
   `seed`, `upscale`, `vision`, `text`), le **type** (`api` ou `local`), le **coût** et les **limites**
   (`maxImages`, qualités, réglages avancés). L'interface s'adapte automatiquement : options proposées,
   matrice des modes, messages.
3. `probe()` doit faire un appel léger et **gratuit** (liste des modèles, solde…) et ne jamais générer.
4. Utilisez `httpJson()` (`server/src/lib/http.ts`) pour bénéficier des délais maximaux et de la
   traduction des erreurs HTTP en messages français.
5. Ajoutez vos réglages dans `server/src/config.ts` (`EngineSettings`, `SETTING_DEFAULTS`, `SETTING_ENV`
   et, pour une clé, `SECRET_SETTINGS`), puis les champs dans `web/src/pages/Settings.tsx` (`ENGINE_FIELDS`).
6. Enregistrez le moteur dans la liste de `server/src/engines/registry.ts`.
7. Ajoutez une doublure de protocole dans `e2e/stubs/server.ts` et des tests dans
   `server/tests/engines.test.ts`.

Exemples d'extensions possibles : ComfyUI (API `/prompt` + graphe de nœuds), Replicate ou fal.ai
(FLUX), Google Imagen, modèles de vision servis par LM Studio ou vLLM.

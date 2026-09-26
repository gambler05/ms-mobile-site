# Design system « Precision Atelier »

## Tokens

Définis dans `src/app/globals.css` (`:root` = Obsidian, `[data-theme="light"]` = Porcelain) et exposés à Tailwind via `@theme inline` (`bg-surface`, `text-muted`, `border-border-strong`, `bg-accent-soft`, …). Densité `[data-density="compact"]` : hauteurs de lignes et de contrôles, paddings et taille de corps réduits. Le thème et la densité sont persistés en cookie (rendu serveur sans flash) ; le thème « système » est résolu avant le premier rendu par un script inline.

## Contrastes mesurés (WCAG 2.x, ratio texte/fond)

| Combinaison | Obsidian | Porcelain |
|---|---|---|
| Texte principal / fond | `#F3F5F7` sur `#090B10` : 17,4:1 | `#171C26` sur `#FFFFFF` : 15,6:1 |
| Texte secondaire / surface | `#A5ADBC` sur `#121620` : 8,4:1 | `#626C7B` sur `#FFFFFF` : 5,3:1 |
| Texte discret (aides, 11,5 px et plus) | `#7D8899` sur `#121620` : 5,5:1 | `#66707F` sur blanc : 4,9:1 |
| Accent / fond | `#8ABEFF` : 10,6:1 | `#285DE5` : 5,6:1 |
| Texte sur bouton accent | `#0B1220` sur `#8ABEFF` : 9,9:1 | blanc sur `#285DE5` : 5,6:1 |
| Succès / alerte / erreur (texte) | `#61D6A6` 10,5:1 · `#F2C46D` 12:1 · `#F18693` 8:1 | `#1B7F5C` 5,0:1 · `#8A5B00` 5,6:1 · `#B3261E` 6,1:1 |

Les statuts sont toujours identifiés par un texte et un symbole (numéro d'étape `01`–`08`, `×`, `⏸`, `!`), jamais par la couleur seule.

## Palette des graphiques

Validée avec le script `validate_palette.js` (bande de luminance, chroma, séparation daltonienne ΔE ≥ 8, contraste ≥ 3:1) :

- Obsidian : `#4A8BE6` (ventes), `#C27F24` (réparations facturées), `#7D6AF0` (encaissements)
- Porcelain : `#285DE5`, `#C2600B`, `#6A4FD8`

Le graphique de chiffre d'affaires est accompagné d'un résumé textuel et d'un tableau de données accessible. Les barres de charge et de répartition utilisent une seule teinte (magnitude).

## Typographie et géométrie

Geist Sans (titres, `letter-spacing: -0.015em`), Inter Variable (corps 14,5 px, chiffres tabulaires `.tnum`), Geist Mono (`.mono` : références, SKU, IMEI). Espacement 4/8 px ; rayons 4 (contrôles) · 6 (boutons, champs) · 10 (cartes) · 14 (dialogues) · 20 (feuilles mobiles). Animations 120–220 ms, `prefers-reduced-motion` respecté, curseur système conservé.

## Logotype

`src/components/ui/logo.tsx` : deux pistes de circuit en boucle, l'une qui se referme sur un point (retour de l'appareil), avec une petite fourche en « flux ». Icônes PWA générées dans `public/`.

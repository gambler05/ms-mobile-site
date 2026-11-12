window.REEL = {
  id: 'batterie',
  caption:
    "3 erreurs qui tuent ta batterie 🔋\n\n1. La chaleur\n2. Les extrêmes 0 % et 100 %\n3. Le chargeur sans marque\n\nEnregistre ce reel pour t'en souvenir, et envoie-le à celui qui recharge son téléphone sur le tableau de bord.\n\n#batterie #smartphone #astuce #iphone #android #reparation #lyon",
  scenes: [
    { type: 'hook', dur: 3.2, kicker: 'Stop', lines: ['3 erreurs', 'qui *tuent*', 'ta batterie'], visual: 'drain' },
    { type: 'point', dur: 4.6, title: 'La *chaleur*', text: 'Au-delà de 35 °C, elle s’use beaucoup plus vite. Jamais en plein soleil.', visual: 'thermo' },
    { type: 'point', dur: 4.6, title: '0 % et *100 %*', text: 'Reste entre 20 et 80 % : c’est là qu’elle vieillit le moins.', visual: 'range' },
    { type: 'point', dur: 4.6, title: 'Le chargeur *sans marque*', text: 'Tension instable, surchauffe. Prends un chargeur certifié.', visual: 'bolt' },
    { type: 'outro', dur: 3.4, lines: ['Enregistre', 'pour ne pas', '*oublier*'] },
  ],
};

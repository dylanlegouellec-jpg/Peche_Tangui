/** Historique des nouveautés, la plus récente en premier (affiché dans Réglages → Diagnostic). */
export interface Release {
  date: string // AAAA-MM-JJ
  title: string
  items: string[]
}

export const CHANGELOG: Release[] = [
  {
    date: '2026-10-19',
    title: 'Quantité par prise, glisser entre onglets',
    items: [
      'Glisser à gauche ou à droite pour changer d’onglet (la page suit le doigt)',
      'Transition fluide entre Mes sorties et Amis, avec une pastille qui glisse',
      'Carte : plus de lignes blanches entre les morceaux de carte sur iPhone',
      'Pastille de la barre d’onglets avec un petit rebond sur place : elle ne dépasse plus aux extrémités',
      'Sélecteurs Liste/Carte, Mes sorties/Amis et Bord/Sous-marine : pastille arrondie qui glisse, contenu qui arrive par le côté',
      'Nombre de prises par espèce avec − / + (ex. 6 × Araignée de mer) : compté partout (carnet, bilan, carte, amis, PDF)',
      'Taille « max » et poids « total » quand il y a plusieurs prises de la même espèce',
      'Carte : le balayage vert du relief disparaît bien après son passage',
    ],
  },
  {
    date: '2026-10-15',
    title: 'Refonte graphique : 3 styles et animations',
    items: [
      'Trois styles au choix dans Réglages → Apparence : Océan vivant, Verre liquide, Carnet de bord',
      'Océan vivant : la mer en fond suit la houle, le vent, la pluie et l’heure (aube, jour, crépuscule, nuit) du spot affiché',
      'Score dans un hublot qui se remplit d’eau, boussole du vent et de la houle, lune avec sa vraie phase',
      'Courbe de marée qui se dessine et petite scène de port où l’eau monte et descend au niveau réel',
      'Tirer pour actualiser avec une vague, écran de démarrage ; effets au toucher (bioluminescence, ondes, encre) désactivés par défaut, à activer dans Apparence → Effets',
      'Carte : marqueurs qui tombent, position GPS en sonar · Carnet : sorties en cartes, poisson qui saute à chaque prise, bulles pour un record, photos qui s’agrandissent',
      'Animations complètes, légères ou aucune, et chaque effet activable à part ; « Réduire les animations » de l’iPhone est respecté',
      'Historique des nouveautés dans le Diagnostic',
    ],
  },
  {
    date: '2026-10-14',
    title: 'Webcams au choix, sécurité et fiabilité',
    items: [
      'Webcams Windy au choix par spot : glisser-déposer pour l’ordre, recherche par nom, ajout par lien, jusqu’à 250 km',
      'Webcams perso par spot : image en direct, direct YouTube ou page web',
      'Pastille sur l’onglet Carnet quand une demande d’ami attend',
      'Changer de mot de passe, déconnecter ses autres appareils, supprimer son compte',
      'Restaurer une sauvegarde ; photos d’une sortie supprimée effacées ; limite d’essais de connexion',
      'Corrections : heure prise en compte dans le score, spots de départ propres à chaque compte, changement de compte sans mélange, pas de rechargement pendant une saisie',
    ],
  },
  {
    date: '2026-10-09',
    title: 'GPS, coins marqués et indices de poisson',
    items: [
      'Carte : position GPS en direct et marqueurs « coin à homard, crabes, bon coin » posés exactement où tu es, avec itinéraire',
      'Le score tient compte de la température de l’eau et de sa tendance, des fronts thermiques (Copernicus) et de ton historique de sorties',
    ],
  },
  {
    date: '2026-10-07',
    title: 'Données marines, amis et comptes',
    items: [
      'Marées et coefficient calculés dans l’appli, niveau d’eau réel mesuré par le SHOM',
      'Relief marin et profondeurs (EMODnet), courant et houle Copernicus à 3 km, chlorophylle satellite, vigilance Météo-France',
      'Webcams Windy proches du spot',
      'Plusieurs comptes avec invitations, amis et fil de leurs sorties (sorties privées possibles)',
      '« Ce que ton journal t’apprend » dans le bilan, classement « Où aller ? » (option)',
      'Pastille de connexion sur la photo de profil, mode PC avec menu latéral',
    ],
  },
  {
    date: '2026-10-06',
    title: 'Première version',
    items: [
      'Score de pêche par heure et par jour pour le bord et la chasse sous-marine, jusqu’à 16 jours',
      'Espèces du mois, carnet de sorties avec photos, bilan de saison en PDF',
      'Spots du Morbihan, carte, synchronisation en ligne avec un compte',
      'Comportement d’une vraie appli : hors ligne, mise à jour automatique, mode paysage',
    ],
  },
]

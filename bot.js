const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('fs');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

const TOKEN     = process.env.TOKEN     || 'TON_TOKEN_ICI';
const CLIENT_ID = process.env.CLIENT_ID || 'TON_CLIENT_ID_ICI';
const SITE_URL  = process.env.SITE_URL  || 'http://localhost:3000';

// ─── VÉRIFICATION ABONNEMENT ─────────────────────────────────────────────────
// Toutes les commandes sont libres par défaut — restreins uniquement celles que tu veux
const FREE_COMMANDS = [
  'setup', 'profil', 'solde', 'help', 'metiers',
  'arrest', 'release', 'prison', 'detenus', 'ticket', 'status',
];

async function checkSubscription(guildId) {
  try {
    const res = await axios.get(`${SITE_URL}/api/check-guild/${guildId}`, { timeout: 5000 });
    return res.data;
  } catch {
    return { access: true, daysLeft: 999, reason: 'Site injoignable - acces autorise par defaut' };
  }
}

function noSubEmbed(daysLeft = null, siteUrl = SITE_URL) {
  const desc = daysLeft === null
    ? `Tu n'as pas d'abonnement actif.\nAbonne-toi sur **[notre site](${siteUrl})** pour accéder au bot !`
    : `Ton abonnement a expiré !\nRenouvelle-le sur **[notre site](${siteUrl})**.`;
  return new EmbedBuilder()
    .setTitle('🔒 Accès refusé — Abonnement requis')
    .setColor(0xe8212a)
    .setDescription(desc)
    .addFields({ name: '💳 Prix', value: '10€/mois', inline: true }, { name: '🌐 Site', value: `[Cliquer ici](${siteUrl})`, inline: true })
    .setFooter({ text: 'Astra RP • Abonnement' });
}

// ─── BASE DE DONNÉES SIMPLE (JSON) ───────────────────────────────────────────
const DB_FILE = './database.json';

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ players: {}, bank: {}, inventory: {}, storage: {}, housing: {}, driving_license: {}, wanted: {}, sanctions: {} }));
  }
  const raw = JSON.parse(fs.readFileSync(DB_FILE));
  if (!raw.storage)   raw.storage   = {};
  if (!raw.housing)   raw.housing   = {};
  if (!raw.sanctions) raw.sanctions = {};
  if (!raw.wanted)    raw.wanted    = {};
  return raw;
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ─── LOG MODÉRATION vers #logs-bot ──────────────────────────────────────────
async function logModeration(guild, embed) {
  try {
    const logChan = guild.channels.cache.find(c => c.name === '📋・logs-bot');
    if (logChan) await logChan.send({ embeds: [embed] });
  } catch {}
}

function getPlayer(db, userId) {
  if (!db.players[userId]) {
    db.players[userId] = { name: null, prenom: null, nom: null, age: null, job: 'Sans emploi', level: 1, xp: 0, created: false };
    db.bank[userId]    = { cash: 500, bank: 1000 };
    db.inventory[userId] = {};
    db.storage[userId]   = { unlocked: false, items: {} };
    db.housing[userId]   = { has: false, address: null, level: 1 };
    db.driving_license[userId] = { has: false, points: 12 };
    db.wanted[userId]    = { level: 0, reason: null };
    saveDB(db);
  }
  if (!db.storage[userId])  db.storage[userId]  = { unlocked: false, items: {} };
  if (!db.housing[userId])  db.housing[userId]  = { has: false, address: null, level: 1 };
  if (db.players[userId].created    === undefined) db.players[userId].created    = false;
  if (db.players[userId].xp         === undefined) db.players[userId].xp         = 0;
  if (db.players[userId].level      === undefined) db.players[userId].level      = 1;
  if (db.players[userId].lastSalaire === undefined) db.players[userId].lastSalaire = 0;
  if (db.players[userId].imprisoned === undefined) db.players[userId].imprisoned  = { active: false, until: 0, reason: null };
  return db;
}

// ─── DÉFINITION DES MÉTIERS ──────────────────────────────────────────────────
const METIERS = [
  {
    id: 'police',
    nom: '👮 Police Nationale',
    emoji: '👮',
    salaire: 2500,
    ageMin: 15,
    illegal: false,
    description: 'Protéger les citoyens, maintenir l\'ordre public et faire respecter la loi sur le territoire de la ville.',
    regles: [
      '🔞 Âge minimum : **15 ans** (IC)',
      '📋 Casier judiciaire vierge obligatoire',
      '🎓 Formation de 3 jours obligatoire avant toute patrouille',
      '🚫 Interdiction d\'utiliser sa force de manière abusive',
      '🤝 Respecter le code de déontologie policière',
      '📻 Communication radio obligatoire en service',
      '⚖️ Toujours lire ses droits avant une arrestation',
      '🚗 Respecter le code de la route même en service (sauf urgences)',
    ],
    commandes: ['+arrest @joueur [raison]', '+release @joueur', '+fine @joueur [montant] [raison]', '+wanted @joueur [raison]', '+unwanted @joueur'],
  },
  {
    id: 'medecin',
    nom: '🏥 Médecin / SAMU',
    emoji: '🏥',
    salaire: 3500,
    ageMin: 18,
    illegal: false,
    description: 'Soigner les blessés, répondre aux urgences médicales et assurer le bien-être sanitaire de la ville.',
    regles: [
      '🔞 Âge minimum : **18 ans** (IC)',
      '🎓 Diplôme de médecine requis (obtenu via RP)',
      '🚑 Toujours répondre aux appels d\'urgence médicale',
      '🤐 Secret médical absolu — aucune information patient divulguée',
      '💊 Interdiction de vendre des médicaments hors protocole',
      '📋 Dossier patient à remplir après chaque intervention',
      '🚫 Refus de soins interdit sauf danger immédiat',
    ],
    commandes: ['+heal @joueur', '+revive @joueur', '+diagnose @joueur', '+medkit give @joueur'],
  },
  {
    id: 'pompier',
    nom: '🚒 Pompier / Secours',
    emoji: '🚒',
    salaire: 2800,
    ageMin: 16,
    illegal: false,
    description: 'Intervenir sur les incendies, accidents de la route et situations de catastrophe naturelle.',
    regles: [
      '🔞 Âge minimum : **16 ans** (IC)',
      '🏋️ Condition physique excellente requise',
      '🎓 Formation secourisme PSC1 obligatoire (RP)',
      '📻 Permanence radio obligatoire lors des gardes',
      '🚒 Intervenir dans un délai de 5 minutes sur les urgences',
      '🔥 Toujours évaluer les risques avant d\'intervenir',
      '🤝 Coordination obligatoire avec la police et le SAMU',
    ],
    commandes: ['+extinguish [lieu]', '+rescue @joueur', '+evacuate [zone]'],
  },
  {
    id: 'mecanicien',
    nom: '🔧 Mécanicien',
    emoji: '🔧',
    salaire: 2200,
    ageMin: 15,
    illegal: false,
    description: 'Réparer les véhicules, effectuer des révisions et proposer des améliorations mécaniques.',
    regles: [
      '🔞 Âge minimum : **15 ans** (IC)',
      '🔧 Permis de conduire obligatoire pour tester les véhicules',
      '💰 Tarifs affichés obligatoirement avant toute réparation',
      '🚫 Interdiction de voler ou détourner des pièces',
      '📋 Devis obligatoire pour toute réparation > 500€',
      '⏱️ Délai de réparation annoncé et respecté',
    ],
    commandes: ['+repair @joueur [véhicule]', '+upgrade @joueur [pièce]', '+garage add [plaque]'],
  },
  {
    id: 'pharmacien',
    nom: '💊 Pharmacien',
    emoji: '💊',
    salaire: 3000,
    ageMin: 18,
    illegal: false,
    description: 'Délivrer les médicaments sur ordonnance, conseiller les patients et gérer les stocks pharmaceutiques.',
    regles: [
      '🔞 Âge minimum : **18 ans** (IC)',
      '🎓 Diplôme de pharmacie requis (RP)',
      '📋 Ordonnance médicale obligatoire pour les médicaments contrôlés',
      '🔒 Coffre-fort sécurisé pour les substances contrôlées',
      '🚫 Vente de stupéfiants absolument interdite',
      '📊 Inventaire journalier obligatoire',
    ],
    commandes: ['+dispense @joueur [médicament]', '+prescribe @joueur [médicament]'],
  },
  {
    id: 'avocat',
    nom: '⚖️ Avocat',
    emoji: '⚖️',
    salaire: 4000,
    ageMin: 18,
    illegal: false,
    description: 'Défendre les accusés, plaider devant les tribunaux et conseiller les citoyens sur leurs droits.',
    regles: [
      '🔞 Âge minimum : **18 ans** (IC)',
      '🎓 Barreau du Barreau de la ville — inscription obligatoire',
      '🤐 Secret professionnel absolu avec les clients',
      '⚖️ Défense de tout suspect, même coupable',
      '🚫 Conflit d\'intérêts interdit',
      '📋 Contrat signé avec chaque client',
      '💰 Honoraires affichés et respectés',
    ],
    commandes: ['+defend @joueur', '+bail @joueur [montant]', '+plead @joueur [jugement]'],
  },
  {
    id: 'taxi',
    nom: '🚕 Chauffeur de Taxi',
    emoji: '🚕',
    salaire: 1800,
    ageMin: 16,
    illegal: false,
    description: 'Transporter les citoyens à travers la ville de manière sécurisée et professionnelle.',
    regles: [
      '🔞 Âge minimum : **16 ans** (IC)',
      '🚗 Permis de conduire valide obligatoire',
      '🏎️ Respect strict du code de la route',
      '💰 Compteur activé à chaque course — pas de prix arbitraire',
      '🚫 Refus de transport de personnes armées visiblement',
      '🧹 Véhicule propre et entretenu',
      '⭐ Comportement professionnel avec les clients',
    ],
    commandes: ['+taxi call [destination]', '+taxi fare @joueur [montant]'],
  },
  {
    id: 'livreur',
    nom: '🚚 Livreur',
    emoji: '🚚',
    salaire: 1600,
    ageMin: 15,
    illegal: false,
    description: 'Livrer des colis, marchandises et denrées à travers toute la ville dans les délais impartis.',
    regles: [
      '🔞 Âge minimum : **15 ans** (IC)',
      '🚗 Permis de conduire obligatoire',
      '📦 Vérifier l\'état des colis avant livraison',
      '⏱️ Respecter les créneaux de livraison',
      '🚫 Ouverture des colis interdite',
      '📋 Signature de livraison obligatoire',
    ],
    commandes: ['+deliver @joueur [colis]', '+pickup [adresse]'],
  },
  {
    id: 'boulanger',
    nom: '🍞 Boulanger',
    emoji: '🍞',
    salaire: 1500,
    ageMin: 14,
    illegal: false,
    description: 'Fabriquer et vendre des produits boulangers, pâtisseries et viennoiseries aux habitants de la ville.',
    regles: [
      '🔞 Âge minimum : **14 ans** (IC)',
      '🧹 Hygiène irréprochable obligatoire',
      '📋 Respect des normes alimentaires',
      '⏰ Ouverture du magasin aux horaires annoncés',
      '💰 Prix affichés sur chaque produit',
      '🚫 Vente de produits périmés interdite',
    ],
    commandes: ['+bake [produit]', '+sell [produit] @joueur [prix]'],
  },
  {
    id: 'agriculteur',
    nom: '🌾 Agriculteur',
    emoji: '🌾',
    salaire: 1400,
    ageMin: 14,
    illegal: false,
    description: 'Cultiver les terres, élever des animaux et fournir des denrées alimentaires à la ville.',
    regles: [
      '🔞 Âge minimum : **14 ans** (IC)',
      '🌱 Respect de l\'environnement obligatoire',
      '💊 Pesticides utilisés dans les limites légales',
      '📋 Traçabilité des produits obligatoire',
      '🚜 Permis de conduire tracteur requis',
      '🐄 Respect du bien-être animal',
    ],
    commandes: ['+harvest [culture]', '+sell_crops [produit] [quantité]', '+feed [animal]'],
  },
  {
    id: 'immobilier',
    nom: '🏠 Agent Immobilier',
    emoji: '🏠',
    salaire: 3200,
    ageMin: 17,
    illegal: false,
    description: 'Gérer les transactions immobilières, louer et vendre des propriétés sur la ville.',
    regles: [
      '🔞 Âge minimum : **17 ans** (IC)',
      '📋 Carte professionnelle immobilière obligatoire',
      '🤝 Transparence totale sur les biens',
      '💰 Commission légale uniquement (max 5%)',
      '🚫 Interdiction de vendre des biens occupés sans consentement',
      '📝 Contrat signé pour chaque transaction',
    ],
    commandes: ['+house buy @joueur [adresse]', '+house rent @joueur [adresse] [prix]', '+house sell @joueur [adresse] [prix]'],
  },
  {
    id: 'militaire',
    nom: '🪖 Militaire / GIGN',
    emoji: '🪖',
    salaire: 3000,
    ageMin: 17,
    illegal: false,
    description: 'Intervenir sur les situations de crise extrême, assurer la sécurité nationale et soutenir la police lors d\'opérations spéciales.',
    regles: [
      '🔞 Âge minimum : **17 ans** (IC)',
      '💪 Excellente condition physique et mentale requise',
      '🎓 Formation militaire de 7 jours obligatoire',
      '📋 Autorisation spéciale pour chaque déploiement',
      '🔫 Usage des armes de guerre uniquement sur ordre hiérarchique',
      '🤝 Coordination obligatoire avec la police nationale',
      '🚫 Agir hors mission strictement interdit',
    ],
    commandes: ['+deploy [zone]', '+neutralize @joueur', '+hostage_rescue [lieu]'],
  },
  {
    id: 'cuisinier',
    nom: '👨‍🍳 Chef Cuisinier',
    emoji: '👨‍🍳',
    salaire: 2000,
    ageMin: 15,
    illegal: false,
    description: 'Préparer des plats de qualité dans les restaurants de la ville, gérer la cuisine et former les commis.',
    regles: [
      '🔞 Âge minimum : **15 ans** (IC)',
      '🧹 Hygiène HACCP respectée en permanence',
      '📋 Menu mis à jour régulièrement',
      '💰 Tarifs affichés à l\'entrée',
      '🚫 Vente d\'alcool sans licence interdite',
      '⏰ Horaires d\'ouverture respectés',
    ],
    commandes: ['+cook [plat]', '+serve @joueur [plat]', '+menu add [plat] [prix]'],
  },
  {
    id: 'journaliste',
    nom: '📰 Journaliste',
    emoji: '📰',
    salaire: 2200,
    ageMin: 16,
    illegal: false,
    description: 'Couvrir l\'actualité de la ville, rédiger des articles et informer les citoyens en temps réel.',
    regles: [
      '🔞 Âge minimum : **16 ans** (IC)',
      '📋 Carte de presse obligatoire',
      '✅ Vérification des sources avant publication',
      '🤐 Protection des sources confidentielles',
      '🚫 Diffamation absolument interdite',
      '📸 Accord requis pour photographier des personnes',
      '⚖️ Respect de la vie privée',
    ],
    commandes: ['+publish [titre] [contenu]', '+interview @joueur', '+breaking [nouvelle]'],
  },
  {
    id: 'btp',
    nom: '🏗️ Ouvrier BTP',
    emoji: '🏗️',
    salaire: 1700,
    ageMin: 16,
    illegal: false,
    description: 'Construire et rénover les bâtiments, routes et infrastructures de la ville.',
    regles: [
      '🔞 Âge minimum : **16 ans** (IC)',
      '🦺 Port des EPI (équipements de protection) obligatoire',
      '📋 Plan de chantier validé avant tout travaux',
      '⏱️ Respect des délais de construction',
      '🚫 Travaux de nuit entre 22h et 6h interdits',
      '🔒 Périmètre de sécurité obligatoire sur chantier',
    ],
    commandes: ['+build [structure] [lieu]', '+renovate [bâtiment]', '+demolish [bâtiment]'],
  },
  {
    id: 'hackeur',
    nom: '💻 Hackeur',
    emoji: '💻',
    salaire: 0,
    ageMin: 16,
    illegal: true,
    description: 'Pirater des systèmes informatiques, voler des données sensibles et trafiquer des documents officiels. ⚠️ Métier ILLÉGAL.',
    regles: [
      '🔞 Âge minimum : **16 ans** (IC)',
      '⚠️ Métier illégal — risque d\'arrestation permanent',
      '💻 Hacking en public interdit (doit être discret)',
      '🤝 Pas de trahison entre hackers (code de l\'honneur)',
      '🚫 Hacker les systèmes policiers = risque maximal',
      '💰 Paiement uniquement en cryptomonnaie',
      '🏃 Fuite organisée en cas d\'intervention policière',
    ],
    commandes: ['+hack [cible]', '+forge [document] @joueur', '+launder [montant]'],
  },
  {
    id: 'braqueur',
    nom: '🔫 Braqueur',
    emoji: '🔫',
    salaire: 0,
    ageMin: 16,
    illegal: true,
    description: 'Organiser et réaliser des braquages de banques, magasins et convois. ⚠️ Métier ILLÉGAL.',
    regles: [
      '🔞 Âge minimum : **16 ans** (IC)',
      '⚠️ Métier illégal — risque d\'emprisonnement très élevé',
      '🤝 Équipe de 2 à 4 personnes minimum pour un braquage',
      '🚫 Tuer des otages = punition sévère (OOC)',
      '📋 Planification obligatoire avant l\'opération',
      '🚗 Véhicule de fuite préparé à l\'avance',
      '💰 Partage équitable du butin',
    ],
    commandes: ['+rob bank [type]', '+hostage take @joueur', '+getaway [véhicule]'],
  },
  {
    id: 'dealer',
    nom: '💈 Dealer',
    emoji: '💈',
    salaire: 0,
    ageMin: 16,
    illegal: true,
    description: 'Vendre des substances illicites sur le marché noir de la ville. ⚠️ Métier ILLÉGAL.',
    regles: [
      '🔞 Âge minimum : **16 ans** (IC)',
      '⚠️ Métier illégal — arrestation possible à tout moment',
      '🚫 Vente interdite à moins de 100m d\'une école',
      '🤫 Discrétion absolue — pas de deal en public exposé',
      '🤝 Respect des territoires des autres gangs',
      '💰 Prix du marché à respecter',
      '🏃 Plan de fuite toujours préparé',
    ],
    commandes: ['+deal @joueur [substance] [quantité]', '+territory claim [zone]', '+launder [montant]'],
  },
];

// ─── STRUCTURE DES CATÉGORIES ET SALONS ─────────────────────────────────────
function getServerStructure() {
  return [
    {
      name: '╔══ 📋 INFORMATIONS ══╗',
      type: ChannelType.GuildCategory,
      channels: [
        {
          name: '📌・règlement',
          type: ChannelType.GuildText,
          topic: 'Le règlement officiel du serveur — à lire obligatoirement.',
          explanation: {
            title: '📌 Règlement du Serveur',
            description: `Bienvenue sur **Astra RP** ! Avant de commencer à jouer, veuillez lire attentivement le règlement ci-dessous.\n\nLe non-respect de ces règles entraîne des sanctions allant de l'avertissement au bannissement définitif.`,
            fields: [
              { name: '§1 — Respect', value: 'Le respect est obligatoire envers tous les membres, qu\'ils soient joueurs ou staff. Toute forme d\'insulte, harcèlement ou discrimination est strictement interdite.' },
              { name: '§2 — Roleplay', value: 'Le RP doit rester cohérent et réaliste. Pas de PG (PowerGaming), MG (MetaGaming), ou DM (DeathMatch) injustifié.' },
              { name: '§3 — Personnage', value: 'Chaque joueur doit avoir un personnage unique avec un prénom, un nom et un âge cohérent. Plusieurs personnages sur un même compte sont interdits.' },
              { name: '§4 — Staff', value: 'Les décisions du staff sont finales et doivent être respectées. Toute contestation se fait en ticket, pas en vocal ou en public.' },
              { name: '§5 — Sanctions', value: '1er écart : Avertissement\n2ème écart : Kick\n3ème écart : Ban temporaire\n4ème écart : Ban définitif' },
            ],
          },
        },
        {
          name: '📢・annonces',
          type: ChannelType.GuildText,
          topic: 'Annonces officielles du serveur.',
          explanation: {
            title: '📢 Annonces Officielles',
            description: 'Ce salon est réservé aux annonces officielles du staff d\'**Astra RP**.\n\n🔔 Activez les notifications de ce salon pour ne rien manquer !\n\n> Seuls les membres du staff peuvent écrire ici.',
            fields: [
              { name: '📌 Commandes utiles', value: '`/profil` — Voir votre fiche personnage\n`/help` — Aide sur les commandes\n`/rules` — Afficher le règlement' },
            ],
          },
        },
        {
          name: '🆕・nouveautés',
          type: ChannelType.GuildText,
          topic: 'Mises à jour et nouvelles fonctionnalités.',
          explanation: {
            title: '🆕 Nouveautés & Mises à Jour',
            description: 'Retrouvez ici toutes les nouveautés, mises à jour et changements apportés au serveur **Astra RP**.\n\n> Ce salon est mis à jour à chaque patch note.',
            fields: [
              { name: '🔔 Comment être notifié ?', value: 'Cliquez sur la cloche en haut du salon pour activer les notifications !' },
            ],
          },
        },
        {
          name: '🤝・partenariats',
          type: ChannelType.GuildText,
          topic: 'Partenariats officiels du serveur.',
          explanation: {
            title: '🤝 Partenariats',
            description: 'Vous souhaitez établir un partenariat avec **Astra RP** ?\n\nOuvrez un ticket et présentez votre serveur au staff.',
            fields: [
              { name: '📋 Conditions de partenariat', value: '✅ Minimum 50 membres\n✅ Serveur actif\n✅ Pas de contenu NSFW\n✅ Bot Astra RP présent' },
            ],
          },
        },
      ],
    },
    {
      name: '╠══ 🎮 ROLEPLAY ══╣',
      type: ChannelType.GuildCategory,
      channels: [
        {
          name: '💬・discussion-ic',
          type: ChannelType.GuildText,
          topic: 'Discussion In-Character générale.',
          explanation: {
            title: '💬 Discussion In-Character',
            description: 'Ce salon est dédié aux échanges **en jeu (IC)**. Parlez uniquement en tant que votre personnage.\n\n> Toute discussion hors-jeu (OOC) doit se faire dans le salon prévu à cet effet.',
            fields: [
              { name: '📌 Rappel RP', value: '`/me [action]` — Effectuer une action\n`/do [description]` — Décrire l\'environnement\n`/say [texte]` — Parler en IC\n`+profil` — Voir votre fiche' },
              { name: '🚫 Interdit ici', value: 'Discussions OOC • Spam • Publicité • Insultes' },
            ],
          },
        },
        {
          name: '💭・discussion-ooc',
          type: ChannelType.GuildText,
          topic: 'Discussion hors-jeu (OOC).',
          explanation: {
            title: '💭 Discussion Hors-Jeu (OOC)',
            description: 'Bienvenue dans le salon de discussion générale **hors-jeu** !\n\nParlez librement de tout et de rien, mais restez respectueux.',
            fields: [
              { name: '📌 Commandes sympas', value: '`+profil` — Voir votre profil\n`+solde` — Voir votre argent\n`+help` — Aide générale' },
            ],
          },
        },
        {
          name: '🔒・prison',
          type: ChannelType.GuildText,
          topic: 'Registre des incarcérations IC — Suivi des détenus en temps réel.',
          explanation: {
            title: '🔒 Prison d\'Astra City',
            description: 'Ce salon affiche en temps réel toutes les **incarcérations et libérations** IC.\n\n> Seuls les officiers de police et le staff peuvent effectuer des arrestations.',
            fields: [
              { name: '👮 Commandes Police', value: '`/arrest @joueur [durée en min] [raison]` — Emprisonner un joueur\n`/release @joueur [raison]` — Libérer un joueur\n`/detenus` — Voir tous les détenus actuels' },
              { name: '👤 Commandes Joueur', value: '`/prison` — Voir votre statut de détention\n`/prison @joueur` — Voir le statut d\'un autre joueur' },
              { name: '⚙️ Infos', value: '🔄 Libération automatique à la fin de la peine\n🏷️ Rôle **🔒 Emprisonné** attribué automatiquement\n⏰ Compte à rebours visible avec l\'heure de libération' },
            ],
          },
        },
        {
          name: '🆘・urgences-ic',
          type: ChannelType.GuildText,
          topic: 'Appels d\'urgence IC — Police, SAMU, Pompiers.',
          explanation: {
            title: '🆘 Urgences — Numéro d\'appel IC',
            description: `Utilisez ce salon pour passer vos appels d'urgence **en jeu**.\n\n📞 **Police :** 17\n🚑 **SAMU :** 15\n🚒 **Pompiers :** 18\n\n> Format requis : **Localisation • Nature de l'urgence • Nombre de personnes impliquées**`,
            fields: [
              { name: '📌 Exemple d\'appel', value: '`📍 Rue de la Paix | 🔫 Fusillade | 👥 3 personnes blessées`' },
              { name: '⚡ Commandes d\'urgence', value: '`/urgence police [message]`\n`/urgence samu [message]`\n`/urgence pompier [message]`' },
            ],
          },
        },
        {
          name: '🏙️・ville-générale',
          type: ChannelType.GuildText,
          topic: 'Vie quotidienne IC de la ville.',
          explanation: {
            title: '🏙️ Vie en Ville',
            description: 'Ce salon représente la **vie quotidienne** de la ville. Interactions sociales, commerces, rencontres fortuites...\n\nSoyez créatifs dans vos RP !',
            fields: [
              { name: '📌 Commandes utiles', value: '`+meteo` — Météo actuelle de la ville\n`+heure` — Heure IC\n`+lieu [endroit]` — Décrire votre lieu' },
            ],
          },
        },
      ],
    },
    {
      name: '╠══ 💼 RECRUTEMENT ══╣',
      type: ChannelType.GuildCategory,
      channels: METIERS.map(m => ({
        name: `${m.emoji}・recrutement-${m.id}`,
        type: ChannelType.GuildText,
        topic: `Recrutement — ${m.nom} | Salaire : ${m.illegal ? 'Variable (illégal)' : m.salaire + '€/h'}`,
        isRecruitment: true,
        metier: m,
      })),
    },
    {
      name: '╠══ 🤖 COMMANDES BOT ══╣',
      type: ChannelType.GuildCategory,
      channels: [
        {
          name: '💳・mon-profil',
          type: ChannelType.GuildText,
          topic: 'Consultez et gérez votre fiche personnage.',
          explanation: {
            title: '💳 Gestion du Profil',
            description: 'Ce salon vous permet de **créer et gérer votre personnage** sur Astra RP.\n\nCommencez par créer votre personnage avec la commande ci-dessous !',
            fields: [
              { name: '🆕 Créer son personnage', value: '`+create` — Lancer la création de personnage' },
              { name: '👁️ Consulter son profil', value: '`+profil` — Voir votre fiche complète\n`+profil @joueur` — Voir la fiche d\'un autre joueur' },
              { name: '✏️ Modifier son profil', value: '`+setjob [métier]` — Changer de métier\n`+setage [âge]` — Modifier votre âge IC' },
              { name: '📊 Progression', value: '`+xp` — Voir vos points d\'expérience\n`+level` — Voir votre niveau' },
            ],
          },
        },
        {
          name: '💰・économie',
          type: ChannelType.GuildText,
          topic: 'Gérez votre argent et vos transactions.',
          explanation: {
            title: '💰 Système Économique',
            description: 'Bienvenue dans le salon d\'**économie** d\'Astra RP !\n\nGérez votre argent, effectuez des transactions et consultez votre fortune.',
            fields: [
              { name: '💵 Argent liquide', value: '`+solde` — Voir votre solde\n`+pay @joueur [montant]` — Payer un joueur\n`+salaire` — Collecter votre salaire' },
              { name: '🏦 Banque', value: '`+depot [montant]` — Déposer de l\'argent\n`+retrait [montant]` — Retirer de l\'argent\n`+virement @joueur [montant]` — Virement bancaire' },
              { name: '📊 Infos', value: '`+richesse` — Classement des joueurs les plus riches\n`+historique` — Voir vos dernières transactions' },
            ],
          },
        },
        {
          name: '🎒・inventaire',
          type: ChannelType.GuildText,
          topic: 'Gérez votre inventaire et objets.',
          explanation: {
            title: '🎒 Inventaire & Objets',
            description: 'Consultez et gérez tous vos **objets et équipements** dans ce salon.',
            fields: [
              { name: '👜 Inventaire', value: '`+inventaire` — Voir votre inventaire\n`+inventaire @joueur` — Voir l\'inventaire d\'un joueur\n`+drop [objet] [quantité]` — Lâcher un objet' },
              { name: '🤝 Échanges', value: '`+give @joueur [objet] [quantité]` — Donner un objet\n`+trade @joueur` — Proposer un échange' },
              { name: '🔓 Stockage', value: '`+storage` — Accéder à votre stockage\n`+storage unlock` — Débloquer le stockage (500€)' },
            ],
          },
        },
        {
          name: '🏦・banque',
          type: ChannelType.GuildText,
          topic: 'Toutes les commandes bancaires.',
          explanation: {
            title: '🏦 Banque d\'Astra City',
            description: 'Gérez vos finances depuis ce salon. La **Banque d\'Astra City** est à votre service 24h/24.',
            fields: [
              { name: '💳 Compte courant', value: '`+solde` — Consulter solde\n`+depot [montant]` — Déposer\n`+retrait [montant]` — Retirer' },
              { name: '💸 Transactions', value: '`+virement @joueur [montant]` — Virement\n`+historique` — Historique des transactions' },
              { name: '🏠 Prêts immobiliers', value: '`+pret [montant]` — Demander un prêt\n`+remboursement` — Rembourser un prêt' },
            ],
          },
        },
        {
          name: '🚗・permis-vehicules',
          type: ChannelType.GuildText,
          topic: 'Permis de conduire et véhicules.',
          explanation: {
            title: '🚗 Permis & Véhicules',
            description: 'Gérez votre **permis de conduire** et vos véhicules dans ce salon.',
            fields: [
              { name: '📋 Permis de conduire', value: '`+permis` — Voir votre permis\n`+permis passer` — Passer le permis (500€)\n`+points` — Voir vos points de permis' },
              { name: '🚘 Véhicules', value: '`+garage` — Voir vos véhicules\n`+vehicule acheter [modèle]` — Acheter un véhicule\n`+vehicule vendre [plaque]` — Vendre un véhicule' },
              { name: '⚠️ Infractions', value: '`+infractions` — Voir vos infractions\n`+amende payer [id]` — Payer une amende' },
            ],
          },
        },
        {
          name: '🏠・immobilier',
          type: ChannelType.GuildText,
          topic: 'Logements et propriétés.',
          explanation: {
            title: '🏠 Immobilier',
            description: 'Trouvez et gérez votre **logement** sur Astra City.',
            fields: [
              { name: '🔑 Logement', value: '`+maison` — Voir votre logement\n`+maison acheter [adresse]` — Acheter une maison\n`+maison louer [adresse]` — Louer un appartement' },
              { name: '🏘️ Annonces', value: '`+annonces immobilier` — Voir les biens disponibles\n`+estimer [adresse]` — Estimer un bien' },
            ],
          },
        },
      ],
    },
    {
      name: '╠══ 🔊 VOCAL ══╣',
      type: ChannelType.GuildCategory,
      channels: [
        { name: '𝗟𝗼𝗯𝗯𝘆 ✦ 𝗚é𝗻é𝗿𝗮𝗹', type: ChannelType.GuildVoice },
        { name: '🎮 ﹒ 𝗥𝗼𝗹𝗲𝗽𝗹𝗮𝘆 𝗚é𝗻é𝗿𝗮𝗹', type: ChannelType.GuildVoice },
        { name: '👮 ﹒ 𝗤𝘂𝗮𝗿𝘁𝗶𝗲𝗿 𝗣𝗼𝗹𝗶𝗰𝗲', type: ChannelType.GuildVoice },
        { name: '🏥 ﹒ 𝗛ô𝗽𝗶𝘁𝗮𝗹 𝗖𝗲𝗻𝘁𝗿𝗮𝗹', type: ChannelType.GuildVoice },
        { name: '🔧 ﹒ 𝗚𝗮𝗿𝗮𝗴𝗲 𝗠é𝗰𝗮𝗻𝗶𝗾𝘀𝗲', type: ChannelType.GuildVoice },
        { name: '⚖️ ﹒ 𝗧𝗿𝗶𝗯𝘂𝗻𝗮𝗹', type: ChannelType.GuildVoice },
        { name: '🏙️ ﹒ 𝗩𝗶𝗹𝗹𝗲 𝗛𝗮𝘂𝘁𝗲', type: ChannelType.GuildVoice },
        { name: '🌆 ﹒ 𝗭𝗼𝗻𝗲 𝗜𝗻𝗱𝘂𝘀𝘁𝗿𝗶𝗲𝗹𝗹𝗲', type: ChannelType.GuildVoice },
        { name: '🌃 ﹒ 𝗤𝘂𝗮𝗿𝘁𝗶𝗲𝗿 𝗦𝗼𝗺𝗯𝗿𝗲', type: ChannelType.GuildVoice },
        { name: '🎵 ﹒ 𝗠𝘂𝘀𝗶𝗸 & 𝗖𝗵𝗶𝗹𝗹', type: ChannelType.GuildVoice },
        { name: '🔇 ﹒ 𝗔𝗙𝗞 ✦ 𝗜𝗻𝗮𝗰𝘁𝗶𝗳', type: ChannelType.GuildVoice },
      ],
    },
    {
      name: '╠══ 🎫 TICKETS ══╣',
      type: ChannelType.GuildCategory,
      channels: [
        {
          name: '🎫・ouvrir-un-ticket',
          type: ChannelType.GuildText,
          topic: 'Utilisez /ticket pour contacter le staff.',
          explanation: {
            title: '🎫 Support — Ouvrir un Ticket',
            description: 'Tu as besoin d\'aide ? Un problème avec un joueur ? Une question pour le staff ?\n\nUtilise la commande `/ticket` pour ouvrir un salon privé avec le staff.',
            fields: [
              { name: '📋 Sujets disponibles', value: '⚠️ Signalement de joueur\n❓ Question générale\n💼 Candidature staff\n🐛 Rapport de bug\n⚖️ Contester une sanction\n📋 Autre' },
              { name: '⌨️ Commande', value: '`/ticket [sujet]` — Ouvre un ticket privé instantanément' },
              { name: '⏱️ Délai de réponse', value: 'Le staff répond sous **24h maximum**.' },
            ],
          },
        },
      ],
    },
    {
      name: '╚══ ⚙️ ADMINISTRATION ══╝',
      type: ChannelType.GuildCategory,
      channels: [
        {
          name: '📋・logs-bot',
          type: ChannelType.GuildText,
          topic: 'Logs automatiques des actions du bot.',
          explanation: {
            title: '📋 Logs du Bot',
            description: 'Ce salon enregistre automatiquement toutes les **actions importantes** effectuées via le bot.\n\n> Réservé au staff uniquement.',
            fields: [
              { name: '📊 Types de logs', value: '🔨 Sanctions • 💰 Transactions importantes • 👤 Créations de personnages • ⚙️ Modifications admin' },
            ],
          },
        },
        {
          name: '🎫・tickets',
          type: ChannelType.GuildText,
          topic: 'Ouvrez un ticket pour contacter le staff.',
          explanation: {
            title: '🎫 Support — Tickets',
            description: 'Besoin d\'aide ? Un problème avec un joueur ? Une question pour le staff ?\n\n**Ouvrez un ticket** en utilisant la commande ci-dessous et un membre du staff vous répondra dans les plus brefs délais.',
            fields: [
              { name: '🎟️ Ouvrir un ticket', value: '`/ticket` — Ouvrir un nouveau ticket\n`+ticket [raison]` — Ticket rapide' },
              { name: '📋 Types de tickets', value: '⚠️ Signalement de joueur\n❓ Question générale\n💼 Candidature staff\n🐛 Rapport de bug' },
            ],
          },
        },
        {
          name: '🔨・sanctions',
          type: ChannelType.GuildText,
          topic: 'Historique des sanctions. Staff uniquement.',
          explanation: {
            title: '🔨 Sanctions — Staff Only',
            description: 'Ce salon est réservé à la gestion des **sanctions** par le staff.\n\n> Accès restreint au staff.',
            fields: [
              { name: '⚠️ Commandes de sanction', value: '`+warn @joueur [raison]` — Avertissement\n`+kick @joueur [raison]` — Expulser\n`+ban @joueur [durée] [raison]` — Bannir\n`+unban @joueur` — Débannir' },
              { name: '📋 Consulter les sanctions', value: '`+sanctions @joueur` — Voir les sanctions d\'un joueur\n`+clearsanctions @joueur` — Effacer les sanctions' },
            ],
          },
        },
        {
          name: '⚙️・config-bot',
          type: ChannelType.GuildText,
          topic: 'Configuration avancée du bot. Admin uniquement.',
          explanation: {
            title: '⚙️ Configuration du Bot',
            description: 'Configurez le bot Astra RP depuis ce salon.\n\n> Réservé aux **administrateurs** uniquement.',
            fields: [
              { name: '🔧 Commandes +set', value: '`+set salaire [métier] [montant]` — Modifier le salaire d\'un métier\n`+set agemin [métier] [âge]` — Modifier l\'âge minimum\n`+set startcash [montant]` — Modifier l\'argent de départ\n`+set startbank [montant]` — Modifier la banque de départ\n`+set prefix [préfixe]` — Changer le préfixe des commandes' },
              { name: '📊 Infos serveur', value: '`+stats` — Statistiques du serveur\n`+players` — Liste des joueurs inscrits\n`+economy stats` — Stats économiques' },
              { name: '🔄 Maintenance', value: '`+resetdb @joueur` — Réinitialiser un joueur\n`+backup` — Sauvegarder la base de données' },
            ],
          },
        },
      ],
    },
  ];
}

// ─── FONCTION SETUP PRINCIPAL ────────────────────────────────────────────────
async function runSetup(guild, interaction = null) {
  const originChannelId = interaction?.channelId || null;
  const originUserId    = interaction?.user?.id   || null;

  const dmUser = async (msg) => {
    if (!originUserId) return;
    try {
      const u = await guild.client.users.fetch(originUserId);
      await u.send(msg);
    } catch {}
  };

  try {
    await dmUser('⏳ **[1/4]** Suppression des anciens salons...');

    // 1. Supprimer tous les salons sauf le salon d'origine
    const channels = [...guild.channels.cache.values()];
    for (const ch of channels) {
      if (ch.id === originChannelId) continue;
      try { await ch.delete(); await sleep(200); } catch {}
    }

    await dmUser('⏳ **[2/4]** Création des catégories et salons...');

    const structure = getServerStructure();
    const createdChannels = {};

    // 2. Créer toutes les catégories et leurs salons
    for (const cat of structure) {
      let category;
      try {
        category = await guild.channels.create({
          name: cat.name,
          type: ChannelType.GuildCategory,
        });
      } catch (e) {
        console.error('Erreur création catégorie:', e.message);
        continue;
      }

      for (const ch of cat.channels) {
        try {
          const created = await guild.channels.create({
            name: ch.name,
            type: ch.type,
            parent: category.id,
            topic: ch.topic || null,
          });
          createdChannels[ch.name] = created;
        } catch (e) {
          console.error('Erreur création salon:', ch.name, e.message);
        }
        await sleep(300);
      }
      await sleep(500);
    }

    await dmUser('⏳ **[3/4]** Publication des explications et règles...');

    // 3. Poster les explications dans chaque salon texte
    for (const cat of structure) {
      for (const ch of cat.channels) {
        const created = createdChannels[ch.name];
        if (!created || ch.type !== ChannelType.GuildText) continue;

        if (ch.isRecruitment && ch.metier) {
          await postRecruitmentEmbed(created, ch.metier);
        } else if (ch.explanation) {
          await postExplanationEmbed(created, ch.explanation);
        }
        await sleep(400);
      }
    }

    await dmUser('⏳ **[4/4]** Création du règlement complet...');

    // 4. Poster le règlement complet
    const reglementChannel = Object.values(createdChannels).find(c => c.name === '📌・règlement');
    if (reglementChannel) {
      await postReglementComplet(reglementChannel);
    }

    // 5. Supprimer le salon d'origine
    await sleep(2000);
    if (originChannelId) {
      try {
        const originChan = guild.channels.cache.get(originChannelId);
        if (originChan) await originChan.delete();
      } catch {}
    }

    await dmUser('✅ **Setup Astra RP terminé !** Le serveur a été entièrement recréé avec succès. 🎉');

  } catch (e) {
    console.error('Erreur runSetup:', e.message);
    await dmUser(`❌ **Erreur durant le setup :** ${e.message}\nCertains salons ont peut-être été créés. Relance \`/setup\` si nécessaire.`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postExplanationEmbed(channel, explanation) {
  try {
    const embed = new EmbedBuilder()
      .setTitle(explanation.title)
      .setDescription(explanation.description)
      .setColor(0x5865F2)
      .setTimestamp()
      .setFooter({ text: 'Astra RP • Bot Officiel' });

    if (explanation.fields) {
      for (const f of explanation.fields) {
        embed.addFields({ name: f.name, value: f.value, inline: f.inline || false });
      }
    }

    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('Erreur postExplanation:', e.message);
  }
}

async function postRecruitmentEmbed(channel, metier) {
  try {
    const color = metier.illegal ? 0xe8212a : 0x57F287;

    const embed = new EmbedBuilder()
      .setTitle(`${metier.emoji} Recrutement — ${metier.nom}`)
      .setColor(color)
      .setDescription(metier.description)
      .addFields(
        {
          name: '💰 Salaire',
          value: metier.illegal ? '⚠️ Variable (activités illégales)' : `**${metier.salaire}€/heure**`,
          inline: true,
        },
        {
          name: '🔞 Âge minimum',
          value: `**${metier.ageMin} ans** (IC)`,
          inline: true,
        },
        {
          name: metier.illegal ? '⚠️ Avertissement' : '✅ Type',
          value: metier.illegal ? '**Métier illégal** — Risque d\'arrestation permanent' : '**Métier légal** — Emploi reconnu',
          inline: true,
        },
        {
          name: '📋 Règlement du métier',
          value: metier.regles.join('\n'),
          inline: false,
        },
        {
          name: '⌨️ Commandes associées',
          value: '```\n' + metier.commandes.join('\n') + '\n```',
          inline: false,
        },
        {
          name: '📝 Comment postuler ?',
          value: metier.illegal
            ? `Trouvez les bonnes personnes en jeu pour rejoindre ce milieu...\n\n> Aucune candidature officielle — tout se passe **en IC**.`
            : `Répondez à ce message avec votre candidature en utilisant ce format :\n\`\`\`\n📛 Nom IC :\n🎂 Âge IC :\n📖 Expérience :\n❓ Pourquoi ce métier :\n\`\`\``,
          inline: false,
        },
      )
      .setTimestamp()
      .setFooter({ text: `Astra RP • Recrutement ${metier.nom}` });

    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('Erreur postRecruitment:', e.message);
  }
}

async function postReglementComplet(channel) {
  try {
    const welcomeEmbed = new EmbedBuilder()
      .setTitle('⚖️ Règlement Officiel — Astra RP')
      .setDescription('> Bienvenue sur **Astra RP** ! Ce règlement est obligatoire. Son non-respect entraîne des sanctions.\n> En rejoignant le serveur, vous acceptez automatiquement ce règlement.')
      .setColor(0xFEE75C)
      .setTimestamp()
      .setFooter({ text: 'Astra RP • Règlement v1.0' });
    await channel.send({ embeds: [welcomeEmbed] });
    await sleep(500);

    const generalEmbed = new EmbedBuilder()
      .setTitle('📋 Règles Générales')
      .setColor(0x5865F2)
      .addFields(
        { name: '§1 — Respect mutuel', value: 'Le respect est la base de toute communauté. Insultes, harcèlement, racisme, sexisme et homophobie sont **bannis définitivement**.' },
        { name: '§2 — Langue', value: 'La langue officielle du serveur est le **français**. Parlez français dans les salons publics.' },
        { name: '§3 — Publicité', value: 'Toute publicité non autorisée (liens Discord, réseaux sociaux, etc.) est interdite sous peine de bannissement.' },
        { name: '§4 — NSFW', value: 'Tout contenu à caractère sexuel, violent ou choquant est **strictement interdit**.' },
        { name: '§5 — Pseudonyme', value: 'Votre pseudo Discord doit être lisible et ne pas contenir d\'insultes ou de références inappropriées.' },
      )
      .setFooter({ text: 'Astra RP • Règlement' });
    await channel.send({ embeds: [generalEmbed] });
    await sleep(500);

    const rpEmbed = new EmbedBuilder()
      .setTitle('🎭 Règles de Roleplay')
      .setColor(0x57F287)
      .addFields(
        { name: '§6 — PowerGaming (PG)', value: 'Interdiction d\'imposer des actions impossibles à votre personnage ou à un autre joueur. Ex: `*Je te tue instantanément sans que tu puisses réagir*`' },
        { name: '§7 — MetaGaming (MG)', value: 'Interdiction d\'utiliser des informations OOC (Discord, messages privés, etc.) dans le RP. Votre personnage ne sait que ce qu\'il a vécu IC.' },
        { name: '§8 — DeathMatch (DM)', value: 'Tuer ou blesser un joueur sans raison RP valable est interdit. Tout acte de violence doit avoir une justification roleplay.' },
        { name: '§9 — FearRP', value: 'Votre personnage doit **craindre pour sa vie** dans les situations dangereuses (arme pointée, supériorité numérique, etc.).' },
        { name: '§10 — NLR (New Life Rule)', value: 'Après votre mort IC, vous ne vous souvenez de rien. Interdiction de retourner sur le lieu de votre mort ou de vous venger.' },
        { name: '§11 — Personnage', value: 'Chaque joueur = 1 personnage. Prénom, nom et âge cohérents obligatoires. Age minimum personnage : **14 ans**.' },
      )
      .setFooter({ text: 'Astra RP • Règlement' });
    await channel.send({ embeds: [rpEmbed] });
    await sleep(500);

    const jobsEmbed = new EmbedBuilder()
      .setTitle('💼 Règles des Métiers')
      .setColor(0xEB459E)
      .addFields(
        { name: '§12 — Âge minimum métiers', value: METIERS.filter(m => !m.illegal).map(m => `${m.emoji} **${m.nom}** : ${m.ageMin} ans minimum`).join('\n') },
        { name: '§13 — Métiers illégaux', value: METIERS.filter(m => m.illegal).map(m => `${m.emoji} **${m.nom}** : ${m.ageMin} ans minimum — ⚠️ Illégal`).join('\n') },
        { name: '§14 — Respect des règles métier', value: 'Chaque métier a son propre règlement. Il doit être **lu et respecté** avant de prendre le poste. Consultez le salon de recrutement correspondant.' },
        { name: '§15 — Corruption IC', value: 'La corruption des agents de l\'État (police, militaire) n\'est autorisée **qu\'avec accord du staff** et dans le cadre d\'un RP scénarisé.' },
      )
      .setFooter({ text: 'Astra RP • Règlement' });
    await channel.send({ embeds: [jobsEmbed] });
    await sleep(500);

    const sanctionsEmbed = new EmbedBuilder()
      .setTitle('🔨 Système de Sanctions')
      .setColor(0xED4245)
      .addFields(
        { name: '⚠️ Niveau 1 — Avertissement', value: 'Infraction légère (spam, langage inapproprié, micro-manquement RP).\nAction : Avertissement écrit.' },
        { name: '👢 Niveau 2 — Kick', value: 'Infractions répétées après avertissement.\nAction : Expulsion temporaire du serveur.' },
        { name: '🔇 Niveau 3 — Mute/Ban temporaire', value: 'Infraction grave ou récidive.\nAction : Mute ou bannissement de 1 à 30 jours selon gravité.' },
        { name: '🔨 Niveau 4 — Ban définitif', value: 'Infraction très grave (DoxX, harcèlement grave, cheat, insultes racistes).\nAction : Bannissement permanent, sans possibilité de retour.' },
        { name: '📩 Contester une sanction', value: 'Ouvrez un ticket dans <#tickets>. Toute contestation agressive sera ignorée.' },
      )
      .setTimestamp()
      .setFooter({ text: 'Astra RP • Règlement v1.0 — Dernière mise à jour : ' + new Date().toLocaleDateString('fr-FR') });
    await channel.send({ embeds: [sanctionsEmbed] });
  } catch (e) {
    console.error('Erreur postReglementComplet:', e.message);
  }
}

// ─── SYSTÈME DE PRISON ───────────────────────────────────────────────────────
const PRISON_ROLE_NAME = '🔒 Emprisonné';
const prisonTimers = {};

async function imprisonPlayer(guild, userId, dureeMinutes, raison, officierTag) {
  const db = loadDB();
  getPlayer(db, userId);

  const until = Date.now() + dureeMinutes * 60000;
  db.players[userId].imprisoned = { active: true, until, reason: raison, by: officierTag };
  saveDB(db);

  try {
    let role = guild.roles.cache.find(r => r.name === PRISON_ROLE_NAME);
    if (!role) {
      role = await guild.roles.create({
        name: PRISON_ROLE_NAME,
        color: 0x2b2d31,
        reason: 'Rôle prison automatique Astra RP',
      });
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) await member.roles.add(role);
  } catch {}

  const prisonChan = guild.channels.cache.find(c => c.name === '🔒・prison');
  if (prisonChan) {
    const embed = new EmbedBuilder()
      .setTitle('🚔 Nouvelle Incarcération')
      .setColor(0xED4245)
      .addFields(
        { name: '👤 Détenu', value: `<@${userId}>`, inline: true },
        { name: '⏱️ Durée', value: `**${dureeMinutes} minutes**`, inline: true },
        { name: '📋 Raison', value: raison, inline: false },
        { name: '👮 Officier', value: officierTag, inline: true },
        { name: '🕐 Libération prévue', value: `<t:${Math.floor(until / 1000)}:R>`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Astra RP • Système Carcéral' });
    await prisonChan.send({ embeds: [embed] });
  }

  if (prisonTimers[userId]) clearTimeout(prisonTimers[userId]);

  prisonTimers[userId] = setTimeout(async () => {
    await releasePlayer(guild, userId, 'Peine purgée automatiquement');
  }, dureeMinutes * 60000);
}

async function releasePlayer(guild, userId, raison = 'Libéré par un officier') {
  const db = loadDB();
  getPlayer(db, userId);

  db.players[userId].imprisoned = { active: false, until: 0, reason: null, by: null };
  saveDB(db);

  try {
    const role = guild.roles.cache.find(r => r.name === PRISON_ROLE_NAME);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member && role) await member.roles.remove(role);
  } catch {}

  if (prisonTimers[userId]) {
    clearTimeout(prisonTimers[userId]);
    delete prisonTimers[userId];
  }

  const prisonChan = guild.channels.cache.find(c => c.name === '🔒・prison');
  if (prisonChan) {
    const embed = new EmbedBuilder()
      .setTitle('🔓 Libération')
      .setColor(0x57F287)
      .addFields(
        { name: '👤 Détenu libéré', value: `<@${userId}>`, inline: true },
        { name: '📋 Motif', value: raison, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Astra RP • Système Carcéral' });
    await prisonChan.send({ embeds: [embed] });
  }
}

function restorePrisonTimers(guild) {
  const db = loadDB();
  const now = Date.now();
  for (const [userId, p] of Object.entries(db.players)) {
    if (p.imprisoned?.active) {
      const remaining = p.imprisoned.until - now;
      if (remaining <= 0) {
        releasePlayer(guild, userId, 'Peine purgée (bot redémarré)');
      } else {
        prisonTimers[userId] = setTimeout(async () => {
          await releasePlayer(guild, userId, 'Peine purgée automatiquement');
        }, remaining);
      }
    }
  }
}

function isImprisoned(db, userId) {
  const p = db.players[userId];
  if (!p?.imprisoned?.active) return false;
  if (Date.now() > p.imprisoned.until) {
    p.imprisoned.active = false;
    saveDB(db);
    return false;
  }
  return true;
}

// ─── COMMANDES SLASH ─────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('🔧 Recrée entièrement le serveur (catégories, salons, règles). Admin uniquement.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('profil')
    .setDescription('👤 Afficher votre fiche personnage ou celle d\'un autre joueur.')
    .addUserOption(opt => opt.setName('joueur').setDescription('Le joueur à consulter').setRequired(false)),

  new SlashCommandBuilder()
    .setName('solde')
    .setDescription('💰 Voir votre argent (liquide + banque).'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('📖 Afficher l\'aide du bot.'),

  new SlashCommandBuilder()
    .setName('metiers')
    .setDescription('💼 Voir la liste de tous les métiers disponibles.'),

  new SlashCommandBuilder()
    .setName('arrest')
    .setDescription('👮 Emprisonner un joueur IC. Réservé à la police.')
    .addUserOption(opt => opt.setName('joueur').setDescription('Le joueur à arrêter').setRequired(true))
    .addIntegerOption(opt => opt.setName('duree').setDescription('Durée en minutes').setRequired(true).setMinValue(1).setMaxValue(1440))
    .addStringOption(opt => opt.setName('raison').setDescription('Motif de l\'arrestation').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),

  new SlashCommandBuilder()
    .setName('release')
    .setDescription('👮 Libérer un joueur de prison. Réservé à la police.')
    .addUserOption(opt => opt.setName('joueur').setDescription('Le joueur à libérer').setRequired(true))
    .addStringOption(opt => opt.setName('raison').setDescription('Motif de la libération').setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),

  new SlashCommandBuilder()
    .setName('prison')
    .setDescription('🔒 Voir le statut de prison d\'un joueur.')
    .addUserOption(opt => opt.setName('joueur').setDescription('Le joueur à vérifier').setRequired(false)),

  new SlashCommandBuilder()
    .setName('detenus')
    .setDescription('📋 Voir la liste de tous les détenus actuels.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),

  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('🎫 Ouvrir un ticket pour contacter le staff.')
    .addStringOption(opt =>
      opt.setName('sujet')
        .setDescription('Sujet de votre ticket')
        .setRequired(true)
        .addChoices(
          { name: '⚠️ Signalement de joueur', value: 'signalement' },
          { name: '❓ Question générale', value: 'question' },
          { name: '💼 Candidature staff', value: 'candidature' },
          { name: '🐛 Rapport de bug', value: 'bug' },
          { name: '⚖️ Contester une sanction', value: 'sanction' },
          { name: '📋 Autre', value: 'autre' },
        )),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('🤖 Changer le statut d\'activité du bot. Admin uniquement.')
    .addStringOption(opt => opt.setName('texte').setDescription('Le texte du statut').setRequired(true))
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Type d\'activité')
        .setRequired(false)
        .addChoices(
          { name: 'Joue à', value: 'PLAYING' },
          { name: 'Regarde', value: 'WATCHING' },
          { name: 'Écoute', value: 'LISTENING' },
          { name: 'En compétition', value: 'COMPETING' },
        ))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

].map(c => c.toJSON());

// ─── ENREGISTREMENT DES COMMANDES ────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Bot connecté : ${client.user.tag}`);

  client.user.setActivity('Astra RP • /help', { type: ActivityType.Playing });

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commandes slash enregistrées.');
  } catch (e) {
    console.error('❌ Erreur enregistrement commandes:', e.message);
  }

  for (const guild of client.guilds.cache.values()) {
    try { restorePrisonTimers(guild); } catch {}
  }
  console.log('✅ Timers de prison rétablis.');
});

// ─── GESTION DES INTERACTIONS (SLASH + BOUTONS) ───────────────────────────────
client.on('interactionCreate', async interaction => {

  // ─── BOUTONS TICKET ───────────────────────────────────────────────────────
  if (interaction.isButton()) {
    const { guild } = interaction;

    if (interaction.customId.startsWith('ticket_close_')) {
      const ownerId = interaction.customId.replace('ticket_close_', '');
      const isStaff = interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers);

      if (interaction.user.id !== ownerId && !isStaff) {
        return interaction.reply({ content: '❌ Seul le créateur du ticket ou le staff peut le fermer.', ephemeral: true });
      }

      const confirmBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_confirm_close_${ownerId}`)
          .setLabel('✅ Confirmer la fermeture')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('ticket_cancel_close')
          .setLabel('❌ Annuler')
          .setStyle(ButtonStyle.Secondary),
      );

      return interaction.reply({
        content: '⚠️ Es-tu sûr de vouloir fermer ce ticket ?',
        components: [confirmBtn],
        ephemeral: true,
      });
    }

    if (interaction.customId.startsWith('ticket_confirm_close_')) {
      await logModeration(guild, new EmbedBuilder()
        .setTitle('🔒 Ticket Fermé')
        .setColor(0xED4245)
        .addFields(
          { name: '📌 Salon', value: interaction.channel.name, inline: true },
          { name: '🔒 Fermé par', value: interaction.user.tag, inline: true },
        )
        .setTimestamp());

      await interaction.reply({ content: '🔒 Ticket fermé. Suppression dans 5 secondes...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }

    if (interaction.customId === 'ticket_cancel_close') {
      return interaction.reply({ content: '✅ Fermeture annulée.', ephemeral: true });
    }

    return;
  }

  // ─── COMMANDES SLASH UNIQUEMENT ───────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member } = interaction;

  // Commandes qui doivent rester éphémères (visibles seulement par l'utilisateur)
  const EPHEMERAL_COMMANDS = ['solde', 'help', 'detenus', 'prison'];
  const isEphemeral = EPHEMERAL_COMMANDS.includes(commandName);

  // defer IMMÉDIATEMENT — évite le timeout Discord de 3 secondes
  try {
    await interaction.deferReply({ ephemeral: isEphemeral });
  } catch {
    return;
  }

  // Vérification abonnement (sauf commandes gratuites)
  if (!FREE_COMMANDS.includes(commandName)) {
    const sub = await checkSubscription(guild.id);
    if (!sub.access) {
      return interaction.editReply({ embeds: [noSubEmbed(sub.daysLeft)] });
    }
  }

  // ─── /setup ───────────────────────────────────────────────────────────────
  if (commandName === 'setup') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply({ content: '❌ Vous devez être administrateur pour utiliser cette commande.' });
    }

    // Répondre immédiatement pour éviter le timeout Discord (3s)
    await interaction.editReply({ content: '⚙️ **Setup lancé !** Tu vas recevoir un DM avec la progression. Cela peut prendre 1 à 2 minutes...' });

    // Lancer le setup en arrière-plan (sans await ici pour ne pas bloquer)
    runSetup(guild, interaction).catch(e => console.error('Erreur runSetup:', e.message));
    return;
  }

  // ─── /profil ──────────────────────────────────────────────────────────────
  if (commandName === 'profil') {
    const target = interaction.options.getUser('joueur') || interaction.user;
    const db = loadDB();
    getPlayer(db, target.id);
    const p = db.players[target.id];
    const b = db.bank[target.id];

    if (!p.created) {
      return interaction.editReply({ content: '❌ Ce joueur n\'a pas encore créé son personnage. Utilisez `+create` pour commencer !' });
    }

    const metier = METIERS.find(m => m.id === p.job) || null;

    const embed = new EmbedBuilder()
      .setTitle(`👤 Fiche Personnage — ${p.prenom} ${p.nom}`)
      .setColor(0x5865F2)
      .addFields(
        { name: '📛 Identité', value: `**Prénom :** ${p.prenom || 'N/A'}\n**Nom :** ${p.nom || 'N/A'}\n**Âge :** ${p.age || 'N/A'} ans`, inline: true },
        { name: '💼 Emploi', value: metier ? `${metier.emoji} ${metier.nom}` : '😴 Sans emploi', inline: true },
        { name: '💰 Finances', value: `💵 Liquide : **${b?.cash || 0}€**\n🏦 Banque : **${b?.bank || 0}€**`, inline: true },
        { name: '📊 Progression', value: `⭐ Niveau : **${p.level}**\n✨ XP : **${p.xp}**`, inline: true },
        { name: '🚗 Permis', value: db.driving_license[target.id]?.has ? `✅ Valide — ${db.driving_license[target.id]?.points} pts` : '❌ Pas de permis', inline: true },
        { name: '🏠 Logement', value: db.housing[target.id]?.has ? `✅ ${db.housing[target.id]?.address}` : '❌ Sans domicile fixe', inline: true },
      )
      .setThumbnail(target.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: `Astra RP • Fiche de ${p.prenom} ${p.nom}` });

    return interaction.editReply({ embeds: [embed] });
  }

  // ─── /solde ───────────────────────────────────────────────────────────────
  if (commandName === 'solde') {
    const db = loadDB();
    getPlayer(db, interaction.user.id);
    const b = db.bank[interaction.user.id];

    const embed = new EmbedBuilder()
      .setTitle('💰 Votre Portefeuille')
      .setColor(0x57F287)
      .addFields(
        { name: '💵 Argent liquide', value: `**${b.cash}€**`, inline: true },
        { name: '🏦 Compte bancaire', value: `**${b.bank}€**`, inline: true },
        { name: '💎 Fortune totale', value: `**${b.cash + b.bank}€**`, inline: true },
      )
      .setFooter({ text: 'Astra RP • Économie' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  // ─── /help ────────────────────────────────────────────────────────────────
  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('📖 Aide — Astra RP Bot')
      .setColor(0x5865F2)
      .setDescription('Voici toutes les commandes disponibles sur le bot Astra RP.')
      .addFields(
        { name: '🎮 Commandes RP', value: '`+create` — Créer son personnage\n`/profil` — Voir sa fiche\n`/solde` — Voir son argent\n`+inventaire` — Voir son inventaire' },
        { name: '💰 Économie', value: '`+pay @joueur [montant]` — Payer un joueur\n`+depot [montant]` — Déposer en banque\n`+retrait [montant]` — Retirer de la banque\n`+salaire` — Collecter son salaire' },
        { name: '🏠 Logement & Véhicules', value: '`+maison` — Voir son logement\n`+garage` — Voir ses véhicules\n`+permis` — Voir son permis' },
        { name: '⚙️ Admin (+set)', value: '`+set salaire [métier] [montant]` — Changer un salaire\n`+set agemin [métier] [âge]` — Changer l\'âge min\n`+set startcash [montant]` — Argent de départ\n`+set prefix [préfixe]` — Changer le préfixe' },
        { name: '🔧 Setup & Admin', value: '`/setup` — Recréer tout le serveur *(Admin)*\n`/status [texte]` — Changer le statut du bot *(Admin)*' },
      )
      .setFooter({ text: 'Astra RP • Aide' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  // ─── /metiers ─────────────────────────────────────────────────────────────
  if (commandName === 'metiers') {
    const legaux = METIERS.filter(m => !m.illegal);
    const illegaux = METIERS.filter(m => m.illegal);

    const embed = new EmbedBuilder()
      .setTitle('💼 Métiers disponibles sur Astra RP')
      .setColor(0x5865F2)
      .addFields(
        {
          name: '✅ Métiers Légaux',
          value: legaux.map(m => `${m.emoji} **${m.nom}** — ${m.salaire}€/h | Min ${m.ageMin} ans`).join('\n'),
        },
        {
          name: '⚠️ Métiers Illégaux',
          value: illegaux.map(m => `${m.emoji} **${m.nom}** — Variable | Min ${m.ageMin} ans`).join('\n'),
        },
      )
      .setFooter({ text: 'Astra RP • Consultez les salons de recrutement pour postuler' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  // ─── /arrest ──────────────────────────────────────────────────────────────
  if (commandName === 'arrest') {
    const target = interaction.options.getUser('joueur');
    const duree  = interaction.options.getInteger('duree');
    const raison = interaction.options.getString('raison');

    if (target.id === interaction.user.id) {
      return interaction.editReply({ content: '❌ Tu ne peux pas t\'arrêter toi-même.' });
    }

    const db2 = loadDB();
    getPlayer(db2, target.id);

    if (isImprisoned(db2, target.id)) {
      const until = db2.players[target.id].imprisoned.until;
      return interaction.editReply({ content: `❌ Ce joueur est déjà en prison. Libération prévue <t:${Math.floor(until / 1000)}:R>.` });
    }

    await imprisonPlayer(guild, target.id, duree, raison, interaction.user.tag);

    await logModeration(guild, new EmbedBuilder()
      .setTitle('🚔 Arrestation IC')
      .setColor(0xED4245)
      .addFields(
        { name: '👤 Détenu', value: `${target.tag}`, inline: true },
        { name: '⏱️ Durée', value: `${duree} minutes`, inline: true },
        { name: '📋 Raison', value: raison, inline: false },
        { name: '👮 Officier', value: interaction.user.tag, inline: true },
      )
      .setTimestamp());

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle('🚔 Arrestation effectuée')
        .setColor(0xED4245)
        .setDescription(`**${target.username}** a été arrêté et emprisonné pour **${duree} minutes**.`)
        .addFields(
          { name: '📋 Motif', value: raison },
          { name: '🕐 Libération automatique', value: `<t:${Math.floor((Date.now() + duree * 60000) / 1000)}:R>` },
        )
        .setFooter({ text: 'Astra RP • Système Carcéral' })
        .setTimestamp()],
    });
  }

  // ─── /release ─────────────────────────────────────────────────────────────
  if (commandName === 'release') {
    const target = interaction.options.getUser('joueur');
    const raison = interaction.options.getString('raison') || 'Libéré par un officier';

    const db2 = loadDB();
    getPlayer(db2, target.id);

    if (!isImprisoned(db2, target.id)) {
      return interaction.editReply({ content: '❌ Ce joueur n\'est pas en prison.' });
    }

    await releasePlayer(guild, target.id, raison);

    await logModeration(guild, new EmbedBuilder()
      .setTitle('🔓 Libération IC')
      .setColor(0x57F287)
      .addFields(
        { name: '👤 Libéré', value: `${target.tag}`, inline: true },
        { name: '📋 Motif', value: raison, inline: true },
        { name: '👮 Par', value: interaction.user.tag, inline: true },
      )
      .setTimestamp());

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle('🔓 Libération effectuée')
        .setColor(0x57F287)
        .setDescription(`**${target.username}** a été libéré de prison.`)
        .addFields({ name: '📋 Motif', value: raison })
        .setFooter({ text: 'Astra RP • Système Carcéral' })
        .setTimestamp()],
    });
  }

  // ─── /prison ──────────────────────────────────────────────────────────────
  if (commandName === 'prison') {
    const target = interaction.options.getUser('joueur') || interaction.user;
    const db2 = loadDB();
    getPlayer(db2, target.id);
    const p = db2.players[target.id];
    const imp = p.imprisoned;

    if (!imp?.active || Date.now() > imp.until) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle(`🔓 Statut Prison — ${target.username}`)
          .setColor(0x57F287)
          .setDescription('✅ Ce joueur est **libre**. Aucune incarcération active.')
          .setThumbnail(target.displayAvatarURL())
          .setFooter({ text: 'Astra RP • Système Carcéral' })],
      });
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`🔒 Statut Prison — ${target.username}`)
        .setColor(0xED4245)
        .setDescription('🔒 Ce joueur est actuellement **incarcéré**.')
        .addFields(
          { name: '📋 Motif', value: imp.reason || 'Non précisé', inline: false },
          { name: '👮 Arrêté par', value: imp.by || 'Inconnu', inline: true },
          { name: '🕐 Libération prévue', value: `<t:${Math.floor(imp.until / 1000)}:R>`, inline: true },
        )
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'Astra RP • Système Carcéral' })],
    });
  }

  // ─── /detenus ─────────────────────────────────────────────────────────────
  if (commandName === 'detenus') {
    const db2 = loadDB();
    const now = Date.now();
    const detenus = Object.entries(db2.players)
      .filter(([, p]) => p.imprisoned?.active && now < p.imprisoned.until)
      .map(([id, p]) => ({ id, ...p.imprisoned }));

    if (detenus.length === 0) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle('📋 Liste des Détenus')
          .setColor(0x57F287)
          .setDescription('✅ Aucun détenu actuellement. Les cellules sont vides !')
          .setFooter({ text: 'Astra RP • Système Carcéral' })],
      });
    }

    const lignes = detenus.map((d, i) =>
      `**${i + 1}.** <@${d.id}> — ${d.reason || 'N/A'} | Libération : <t:${Math.floor(d.until / 1000)}:R>`
    ).join('\n');

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`🔒 Détenus actuels — ${detenus.length} incarcéré(s)`)
        .setColor(0xED4245)
        .setDescription(lignes)
        .setTimestamp()
        .setFooter({ text: 'Astra RP • Système Carcéral' })],
    });
  }

  // ─── /ticket ──────────────────────────────────────────────────────────────
  if (commandName === 'ticket') {
    const sujet = interaction.options.getString('sujet');

    const sujets = {
      signalement: '⚠️ Signalement de joueur',
      question:    '❓ Question générale',
      candidature: '💼 Candidature staff',
      bug:         '🐛 Rapport de bug',
      sanction:    '⚖️ Contester une sanction',
      autre:       '📋 Autre',
    };

    const existant = guild.channels.cache.find(c =>
      c.name === `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}` ||
      c.topic?.includes(`ticket:${interaction.user.id}`)
    );
    if (existant) {
      return interaction.editReply({
        content: `❌ Tu as déjà un ticket ouvert : ${existant}. Ferme-le avant d'en ouvrir un nouveau.`,
      });
    }

    const ticketCat = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildCategory && c.name.includes('TICKETS')
    );

    const staffRole = guild.roles.cache.find(r =>
      ['staff', 'modérateur', 'moderateur', 'admin'].includes(r.name.toLowerCase())
    );

    const ticketChannel = await guild.channels.create({
      name: `🎫・ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)}`,
      type: ChannelType.GuildText,
      parent: ticketCat?.id || null,
      topic: `ticket:${interaction.user.id} | Sujet: ${sujets[sujet]}`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
          ],
        },
        ...(staffRole ? [{
          id: staffRole.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageMessages,
          ],
        }] : []),
        {
          id: client.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageMessages,
          ],
        },
      ],
    });

    const closeBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_close_${interaction.user.id}`)
        .setLabel('🔒 Fermer le ticket')
        .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket — ${sujets[sujet]}`)
      .setColor(0x5865F2)
      .setDescription(`Bienvenue ${interaction.user} !\n\nLe staff va te répondre dans les plus brefs délais.\n\n> Décris ton problème en détail ci-dessous.`)
      .addFields(
        { name: '👤 Ouvert par', value: `${interaction.user.tag}`, inline: true },
        { name: '📋 Sujet', value: sujets[sujet], inline: true },
        { name: '📅 Date', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
      )
      .setFooter({ text: 'Astra RP • Support — Cliquez sur 🔒 pour fermer' })
      .setTimestamp();

    await ticketChannel.send({ content: `${interaction.user}${staffRole ? ` | ${staffRole}` : ''}`, embeds: [embed], components: [closeBtn] });

    await logModeration(guild, new EmbedBuilder()
      .setTitle('🎫 Nouveau Ticket')
      .setColor(0x5865F2)
      .addFields(
        { name: '👤 Auteur', value: interaction.user.tag, inline: true },
        { name: '📋 Sujet', value: sujets[sujet], inline: true },
        { name: '📌 Salon', value: `${ticketChannel}`, inline: true },
      )
      .setTimestamp());

    return interaction.editReply({
      content: `✅ Ton ticket a été ouvert : ${ticketChannel}`,
    });
  }

  // ─── /status ──────────────────────────────────────────────────────────────
  if (commandName === 'status') {
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply({ content: '❌ Vous devez être administrateur pour utiliser cette commande.' });
    }

    const texte = interaction.options.getString('texte');
    const type  = interaction.options.getString('type') || 'PLAYING';

    const activityTypeMap = {
      PLAYING:    ActivityType.Playing,
      WATCHING:   ActivityType.Watching,
      LISTENING:  ActivityType.Listening,
      COMPETING:  ActivityType.Competing,
    };

    const activityLabels = {
      PLAYING:   'Joue à',
      WATCHING:  'Regarde',
      LISTENING: 'Écoute',
      COMPETING: 'En compétition dans',
    };

    client.user.setActivity(texte, { type: activityTypeMap[type] });

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle('✅ Statut mis à jour')
        .setColor(0x57F287)
        .setDescription(`Le bot affiche maintenant : **${activityLabels[type]} ${texte}**`)
        .setFooter({ text: 'Astra RP • Administration' })
        .setTimestamp()],
    });
  }
});

// ─── COMMANDES TEXTE (préfixe +) ─────────────────────────────────────────────
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('+')) return;

  const args = message.content.slice(1).trim().split(/\s+/);
  const cmd  = args.shift().toLowerCase();
  const { guild, member, author } = message;

  const db = loadDB();
  getPlayer(db, author.id);

  const isAdmin = member?.permissions?.has(PermissionsBitField.Flags.Administrator);

  // ─── BLOCAGE SI EN PRISON ─────────────────────────────────────────────────
  const CMDS_BLOQUEES_PRISON = ['pay', 'depot', 'retrait', 'salaire', 'give', 'trade', 'setjob'];
  if (CMDS_BLOQUEES_PRISON.includes(cmd) && isImprisoned(db, author.id)) {
    const until = db.players[author.id].imprisoned.until;
    return message.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🔒 Vous êtes en prison !')
        .setColor(0xED4245)
        .setDescription(`Tu es incarcéré et tu ne peux pas effectuer cette action.\n\n⏰ Libération prévue : <t:${Math.floor(until / 1000)}:R>`)
        .addFields({ name: '📋 Motif de détention', value: db.players[author.id].imprisoned.reason || 'Non précisé' })
        .setFooter({ text: 'Astra RP • Système Carcéral' })],
    });
  }

  // ─── +create ──────────────────────────────────────────────────────────────
  if (cmd === 'create') {
    if (db.players[author.id].created) {
      return message.reply('❌ Tu as déjà un personnage ! Utilise `+profil` pour le voir.');
    }

    const embed = new EmbedBuilder()
      .setTitle('🆕 Création de Personnage')
      .setDescription('Pour créer ton personnage, réponds avec tes informations dans ce format :\n\n```\nPrénom : [ton prénom IC]\nNom : [ton nom IC]\nÂge : [ton âge IC]\n```\n\n> ⚠️ L\'âge minimum est de **14 ans** (IC).')
      .setColor(0x57F287)
      .setFooter({ text: 'Astra RP • Création de personnage' });

    message.reply({ embeds: [embed] });

    const filter = m => m.author.id === author.id && m.channel.id === message.channel.id;
    const collector = message.channel.createMessageCollector({ filter, max: 1, time: 60000 });

    collector.on('collect', async m => {
      const lines = m.content.split('\n');
      const prenom = lines.find(l => l.toLowerCase().startsWith('prénom'))?.split(':')[1]?.trim();
      const nom    = lines.find(l => l.toLowerCase().startsWith('nom'))?.split(':')[1]?.trim();
      const age    = parseInt(lines.find(l => l.toLowerCase().startsWith('âge'))?.split(':')[1]?.trim());

      if (!prenom || !nom || isNaN(age)) {
        return m.reply('❌ Format invalide. Réessaie avec `+create`.');
      }
      if (age < 14) {
        return m.reply('❌ L\'âge minimum est de **14 ans** (IC).');
      }

      db.players[author.id] = { ...db.players[author.id], prenom, nom, age, created: true };
      saveDB(db);

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Personnage créé !')
        .setColor(0x57F287)
        .addFields(
          { name: '📛 Identité', value: `**${prenom} ${nom}**, ${age} ans`, inline: true },
          { name: '💼 Emploi', value: '😴 Sans emploi', inline: true },
          { name: '💰 Départ', value: '💵 500€ | 🏦 1 000€', inline: true },
        )
        .setDescription('Bienvenue sur **Astra RP** ! Consulte les salons de recrutement pour trouver un emploi.')
        .setFooter({ text: 'Astra RP • Bienvenue !' });

      m.reply({ embeds: [successEmbed] });
    });
    return;
  }

  // ─── +profil ──────────────────────────────────────────────────────────────
  if (cmd === 'profil') {
    const target = message.mentions.users.first() || author;
    getPlayer(db, target.id);
    const p = db.players[target.id];
    const b = db.bank[target.id];

    if (!p.created) {
      return message.reply('❌ Ce joueur n\'a pas encore créé son personnage.');
    }

    const metier = METIERS.find(m => m.id === p.job) || null;

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${p.prenom} ${p.nom}`)
      .setColor(0x5865F2)
      .addFields(
        { name: '📛 Identité', value: `${p.prenom} ${p.nom}, ${p.age} ans`, inline: true },
        { name: '💼 Emploi', value: metier ? `${metier.emoji} ${metier.nom}` : '😴 Sans emploi', inline: true },
        { name: '💰 Finances', value: `💵 ${b.cash}€ | 🏦 ${b.bank}€`, inline: true },
        { name: '📊 Niveau', value: `⭐ ${p.level} (${p.xp} XP)`, inline: true },
      )
      .setThumbnail(target.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: 'Astra RP' });

    return message.reply({ embeds: [embed] });
  }

  // ─── +solde ───────────────────────────────────────────────────────────────
  if (cmd === 'solde') {
    const b = db.bank[author.id];
    const embed = new EmbedBuilder()
      .setTitle('💰 Votre Solde')
      .setColor(0x57F287)
      .addFields(
        { name: '💵 Liquide', value: `${b.cash}€`, inline: true },
        { name: '🏦 Banque', value: `${b.bank}€`, inline: true },
        { name: '💎 Total', value: `${b.cash + b.bank}€`, inline: true },
      )
      .setFooter({ text: 'Astra RP' });
    return message.reply({ embeds: [embed] });
  }

  // ─── +pay ─────────────────────────────────────────────────────────────────
  if (cmd === 'pay') {
    const target = message.mentions.users.first();
    const montant = parseInt(args[1]);

    if (!target || isNaN(montant) || montant <= 0) {
      return message.reply('❌ Usage : `+pay @joueur [montant]`');
    }

    getPlayer(db, target.id);

    if (db.bank[author.id].cash < montant) {
      return message.reply('❌ Tu n\'as pas assez d\'argent liquide !');
    }

    db.bank[author.id].cash  -= montant;
    db.bank[target.id].cash  += montant;
    saveDB(db);

    const embed = new EmbedBuilder()
      .setTitle('💸 Paiement effectué')
      .setColor(0x57F287)
      .setDescription(`Tu as payé **${montant}€** à ${target.username}.`)
      .addFields(
        { name: '💵 Ton nouveau solde', value: `${db.bank[author.id].cash}€`, inline: true },
      )
      .setFooter({ text: 'Astra RP • Économie' });

    return message.reply({ embeds: [embed] });
  }

  // ─── +depot ───────────────────────────────────────────────────────────────
  if (cmd === 'depot') {
    const montant = parseInt(args[0]);
    if (isNaN(montant) || montant <= 0) return message.reply('❌ Usage : `+depot [montant]`');
    if (db.bank[author.id].cash < montant) return message.reply('❌ Pas assez de liquide !');

    db.bank[author.id].cash -= montant;
    db.bank[author.id].bank += montant;
    saveDB(db);

    return message.reply(`✅ **${montant}€** déposés en banque. Solde banque : **${db.bank[author.id].bank}€**`);
  }

  // ─── +retrait ─────────────────────────────────────────────────────────────
  if (cmd === 'retrait') {
    const montant = parseInt(args[0]);
    if (isNaN(montant) || montant <= 0) return message.reply('❌ Usage : `+retrait [montant]`');
    if (db.bank[author.id].bank < montant) return message.reply('❌ Pas assez d\'argent en banque !');

    db.bank[author.id].bank -= montant;
    db.bank[author.id].cash += montant;
    saveDB(db);

    return message.reply(`✅ **${montant}€** retirés. Liquide : **${db.bank[author.id].cash}€**`);
  }

  // ─── +virement ────────────────────────────────────────────────────────────
  if (cmd === 'virement') {
    const target = message.mentions.users.first();
    const montant = parseInt(args[1]);

    if (!target || isNaN(montant) || montant <= 0) {
      return message.reply('❌ Usage : `+virement @joueur [montant]`');
    }
    if (target.id === author.id) return message.reply('❌ Tu ne peux pas te virer de l\'argent à toi-même.');

    getPlayer(db, target.id);

    if (db.bank[author.id].bank < montant) {
      return message.reply('❌ Pas assez d\'argent en banque !');
    }

    db.bank[author.id].bank -= montant;
    db.bank[target.id].bank += montant;
    saveDB(db);

    const embed = new EmbedBuilder()
      .setTitle('🏦 Virement effectué')
      .setColor(0x57F287)
      .addFields(
        { name: '💸 Montant', value: `**${montant}€**`, inline: true },
        { name: '📤 Expéditeur', value: author.username, inline: true },
        { name: '📥 Destinataire', value: target.username, inline: true },
        { name: '🏦 Ton solde banque', value: `${db.bank[author.id].bank}€`, inline: true },
      )
      .setFooter({ text: 'Astra RP • Banque' });

    return message.reply({ embeds: [embed] });
  }

  // ─── +give ────────────────────────────────────────────────────────────────
  if (cmd === 'give') {
    const target = message.mentions.users.first();
    const objet  = args[1];
    const qte    = parseInt(args[2]) || 1;

    if (!target || !objet) {
      return message.reply('❌ Usage : `+give @joueur [objet] [quantité]`');
    }

    getPlayer(db, target.id);
    const inv = db.inventory[author.id];

    if (!inv[objet] || inv[objet] < qte) {
      return message.reply(`❌ Tu n'as pas assez de **${objet}** dans ton inventaire.`);
    }

    inv[objet] -= qte;
    if (inv[objet] <= 0) delete inv[objet];
    db.inventory[target.id][objet] = (db.inventory[target.id][objet] || 0) + qte;
    saveDB(db);

    return message.reply(`✅ Tu as donné **${qte}x ${objet}** à **${target.username}**.`);
  }

  // ─── +storage ─────────────────────────────────────────────────────────────
  if (cmd === 'storage') {
    const sub = args[0]?.toLowerCase();
    const storage = db.storage[author.id];

    if (sub === 'unlock') {
      if (storage.unlocked) return message.reply('❌ Ton stockage est déjà débloqué !');
      if (db.bank[author.id].cash < 500) return message.reply('❌ Il te faut **500€** en liquide pour débloquer le stockage.');

      db.bank[author.id].cash -= 500;
      db.storage[author.id].unlocked = true;
      saveDB(db);
      return message.reply('✅ Stockage débloqué ! Utilise `+storage` pour y accéder.');
    }

    if (!storage.unlocked) {
      return message.reply('❌ Ton stockage n\'est pas encore débloqué. Utilise `+storage unlock` (500€).');
    }

    const items = Object.entries(storage.items);
    const embed = new EmbedBuilder()
      .setTitle(`📦 Stockage de ${db.players[author.id].prenom || author.username}`)
      .setColor(0xFEE75C)
      .setDescription(items.length === 0 ? '*Stockage vide*' : items.map(([k, v]) => `• **${k}** x${v}`).join('\n'))
      .setFooter({ text: 'Astra RP • Stockage' });

    return message.reply({ embeds: [embed] });
  }

  // ─── +salaire ─────────────────────────────────────────────────────────────
  if (cmd === 'salaire') {
    const p = db.players[author.id];
    if (!p.created) return message.reply('❌ Crée d\'abord ton personnage avec `+create`.');

    const metier = METIERS.find(m => m.id === p.job);
    if (!metier || metier.illegal || metier.salaire === 0) {
      return message.reply('❌ Tu dois avoir un emploi légal pour collecter un salaire. Postule dans les salons de recrutement !');
    }

    const now = Date.now();
    const cooldown = 3600000;
    if (now - (p.lastSalaire || 0) < cooldown) {
      const reste = Math.ceil((cooldown - (now - p.lastSalaire)) / 60000);
      return message.reply(`⏳ Prochain salaire disponible dans **${reste} minutes**.`);
    }

    db.bank[author.id].cash += metier.salaire;
    db.players[author.id].lastSalaire = now;
    db.players[author.id].xp += 10;
    if (db.players[author.id].xp >= db.players[author.id].level * 100) {
      db.players[author.id].level++;
      message.channel.send(`🎉 **${p.prenom} ${p.nom}** est passé **niveau ${db.players[author.id].level}** !`);
    }
    saveDB(db);

    return message.reply(`✅ Tu as collecté ton salaire de **${metier.salaire}€** en tant que ${metier.emoji} **${metier.nom}** !`);
  }

  // ─── +inventaire ──────────────────────────────────────────────────────────
  if (cmd === 'inventaire') {
    const target = message.mentions.users.first() || author;
    getPlayer(db, target.id);
    const inv = db.inventory[target.id];
    const items = Object.entries(inv);

    const embed = new EmbedBuilder()
      .setTitle(`🎒 Inventaire de ${db.players[target.id].prenom || target.username}`)
      .setColor(0xFEE75C)
      .setDescription(items.length === 0 ? '*Inventaire vide*' : items.map(([k, v]) => `• **${k}** x${v}`).join('\n'))
      .setFooter({ text: 'Astra RP • Inventaire' });

    return message.reply({ embeds: [embed] });
  }

  // ─── +setjob (admin) ──────────────────────────────────────────────────────
  if (cmd === 'setjob') {
    if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');
    const target = message.mentions.users.first();
    const jobId  = args[1]?.toLowerCase();

    if (!target || !jobId) return message.reply('❌ Usage : `+setjob @joueur [id_métier]`');

    const metier = METIERS.find(m => m.id === jobId);
    if (!metier) {
      const liste = METIERS.map(m => `\`${m.id}\``).join(', ');
      return message.reply(`❌ Métier inconnu. Métiers disponibles : ${liste}`);
    }

    getPlayer(db, target.id);
    db.players[target.id].job = jobId;
    saveDB(db);

    await logModeration(guild, new EmbedBuilder()
      .setTitle('💼 Changement de métier')
      .setColor(0x57F287)
      .addFields(
        { name: 'Joueur', value: `${target.tag}`, inline: true },
        { name: 'Nouveau métier', value: `${metier.emoji} ${metier.nom}`, inline: true },
        { name: 'Par', value: author.tag, inline: true },
      )
      .setTimestamp());

    return message.reply(`✅ **${target.username}** a maintenant le métier ${metier.emoji} **${metier.nom}** !`);
  }

  // ─── +set (admin) ─────────────────────────────────────────────────────────
  if (cmd === 'set') {
    if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');
    const subCmd = args[0]?.toLowerCase();

    if (subCmd === 'salaire') {
      const jobId   = args[1]?.toLowerCase();
      const montant = parseInt(args[2]);
      const metier  = METIERS.find(m => m.id === jobId);

      if (!metier || isNaN(montant) || montant < 0) {
        return message.reply('❌ Usage : `+set salaire [id_métier] [montant]`\nMétiers : ' + METIERS.map(m => `\`${m.id}\``).join(', '));
      }

      metier.salaire = montant;
      return message.reply(`✅ Salaire de **${metier.nom}** mis à jour : **${montant}€/h**`);
    }

    if (subCmd === 'agemin') {
      const jobId  = args[1]?.toLowerCase();
      const age    = parseInt(args[2]);
      const metier = METIERS.find(m => m.id === jobId);

      if (!metier || isNaN(age) || age < 0) {
        return message.reply('❌ Usage : `+set agemin [id_métier] [âge]`');
      }

      metier.ageMin = age;
      return message.reply(`✅ Âge minimum de **${metier.nom}** mis à jour : **${age} ans**`);
    }

    if (subCmd === 'startcash') {
      const montant = parseInt(args[1]);
      if (isNaN(montant) || montant < 0) return message.reply('❌ Usage : `+set startcash [montant]`');
      return message.reply(`✅ Argent de départ (liquide) défini à **${montant}€** pour les nouveaux joueurs.`);
    }

    if (subCmd === 'startbank') {
      const montant = parseInt(args[1]);
      if (isNaN(montant) || montant < 0) return message.reply('❌ Usage : `+set startbank [montant]`');
      return message.reply(`✅ Argent de départ (banque) défini à **${montant}€** pour les nouveaux joueurs.`);
    }

    if (subCmd === 'prefix') {
      const newPrefix = args[1];
      if (!newPrefix) return message.reply('❌ Usage : `+set prefix [préfixe]`');
      return message.reply(`✅ Préfixe mis à jour : \`${newPrefix}\` *(redémarrage requis pour appliquer)*`);
    }

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Commandes +set (Admin)')
      .setColor(0xEB459E)
      .addFields(
        { name: '💰 Salaires', value: '`+set salaire [métier] [montant]` — Modifier le salaire d\'un métier' },
        { name: '🔞 Âge minimum', value: '`+set agemin [métier] [âge]` — Modifier l\'âge minimum d\'un métier' },
        { name: '💵 Départ', value: '`+set startcash [montant]` — Argent liquide de départ\n`+set startbank [montant]` — Banque de départ' },
        { name: '⌨️ Préfixe', value: '`+set prefix [préfixe]` — Changer le préfixe du bot' },
        { name: '📋 IDs des métiers', value: METIERS.map(m => `\`${m.id}\``).join(' • ') },
      )
      .setFooter({ text: 'Astra RP • Administration' });

    return message.reply({ embeds: [embed] });
  }

  // ─── +warn ────────────────────────────────────────────────────────────────
  if (cmd === 'warn') {
    if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');
    const target = message.mentions.users.first();
    const raison = args.slice(1).join(' ') || 'Aucune raison fournie';

    if (!target) return message.reply('❌ Usage : `+warn @joueur [raison]`');

    getPlayer(db, target.id);
    if (!db.sanctions) db.sanctions = {};
    if (!db.sanctions[target.id]) db.sanctions[target.id] = [];
    db.sanctions[target.id].push({ type: 'warn', raison, by: author.id, date: Date.now() });
    saveDB(db);

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Avertissement')
      .setColor(0xFEE75C)
      .addFields(
        { name: 'Joueur', value: target.tag, inline: true },
        { name: 'Raison', value: raison, inline: true },
        { name: 'Par', value: author.tag, inline: true },
      )
      .setTimestamp();

    await logModeration(guild, embed);
    try { await target.send({ embeds: [embed] }); } catch {}
    return message.reply({ embeds: [embed] });
  }

  // ─── +sanctions ───────────────────────────────────────────────────────────
  if (cmd === 'sanctions') {
    if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');
    const target = message.mentions.users.first() || author;
    getPlayer(db, target.id);
    const sanctions = db.sanctions?.[target.id] || [];

    const embed = new EmbedBuilder()
      .setTitle(`🔨 Sanctions de ${target.username}`)
      .setColor(0xED4245)
      .setDescription(sanctions.length === 0
        ? '✅ Aucune sanction.'
        : sanctions.map((s, i) => `**${i + 1}.** ${s.type.toUpperCase()} — ${s.raison} *(${new Date(s.date).toLocaleDateString('fr-FR')})*`).join('\n'))
      .setFooter({ text: 'Astra RP • Sanctions' });

    return message.reply({ embeds: [embed] });
  }

  // ─── +stats ───────────────────────────────────────────────────────────────
  if (cmd === 'stats') {
    if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');

    const totalPlayers  = Object.keys(db.players).length;
    const createdChars  = Object.values(db.players).filter(p => p.created).length;
    const totalCash     = Object.values(db.bank).reduce((acc, b) => acc + b.cash + b.bank, 0);
    const jobsCount     = {};
    Object.values(db.players).forEach(p => {
      if (p.job) jobsCount[p.job] = (jobsCount[p.job] || 0) + 1;
    });
    const topJob = Object.entries(jobsCount).sort((a, b) => b[1] - a[1])[0];

    const embed = new EmbedBuilder()
      .setTitle('📊 Statistiques du Serveur')
      .setColor(0x5865F2)
      .addFields(
        { name: '👥 Joueurs enregistrés', value: `${totalPlayers}`, inline: true },
        { name: '🎭 Personnages créés', value: `${createdChars}`, inline: true },
        { name: '💰 Argent total en circulation', value: `${totalCash}€`, inline: true },
        { name: '💼 Métier le plus populaire', value: topJob ? `${METIERS.find(m => m.id === topJob[0])?.nom || topJob[0]} (${topJob[1]})` : 'N/A', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: 'Astra RP • Stats' });

    return message.reply({ embeds: [embed] });
  }
});

// ─── CONNEXION ────────────────────────────────────────────────────────────────
client.login(TOKEN);

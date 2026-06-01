const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ChannelType, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

const FREE_COMMANDS = ['setup'];

async function checkSubscription(userId) {
  try {
    const res = await axios.get(`${SITE_URL}/api/check/${userId}`);
    return res.data;
  } catch {
    return { access: false, reason: 'Erreur de connexion au serveur' };
  }
}

function noSubEmbed(siteUrl = SITE_URL) {
  return new EmbedBuilder()
    .setTitle('🔒 Acces refuse — Abonnement requis')
    .setColor(0xe8212a)
    .setDescription(`Tu n\'as pas d\'abonnement actif.\nAbonne-toi sur **[notre site](${siteUrl})** pour acceder au bot !`)
    .addFields(
      { name: '💳 Prix', value: '10€/mois', inline: true },
      { name: '🌐 Site', value: `[Cliquer ici](${siteUrl})`, inline: true }
    )
    .setFooter({ text: 'Astra RP • Abonnement' });
}

const DB_FILE = './database.json';

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ players: {}, bank: {}, inventory: {}, storage: {}, housing: {}, driving_license: {}, wanted: {} }));
  }
  const raw = JSON.parse(fs.readFileSync(DB_FILE));
  if (!raw.storage) raw.storage = {};
  if (!raw.housing) raw.housing = {};
  return raw;
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getPlayer(db, userId) {
  if (!db.players[userId]) {
    db.players[userId] = { name: null, prenom: null, nom: null, age: null, job: 'Sans emploi', level: 1, xp: 0, created: false };
    db.bank[userId] = { cash: 500, bank: 1000 };
    db.inventory[userId] = {};
    db.storage[userId] = { unlocked: false, items: {} };
    db.housing[userId] = { has: false, address: null, level: 1 };
    db.driving_license[userId] = { has: false, points: 12 };
    db.wanted[userId] = { level: 0, reason: null };
    saveDB(db);
  }
  if (!db.storage[userId]) db.storage[userId] = { unlocked: false, items: {} };
  if (!db.housing[userId]) db.housing[userId] = { has: false, address: null, level: 1 };
  if (db.players[userId].created === undefined) db.players[userId].created = false;
  return db;
}

// ─── MÉTIERS ──────────────────────────────────────────────────────────────────
const METIERS = {
  // Forces de l'ordre
  'Policier':          { emoji: '👮', categorie: 'Forces de l\'ordre', salaire: 3500 },
  'Motard LSPD':       { emoji: '🏍️', categorie: 'Forces de l\'ordre', salaire: 3800 },
  'Detecteur':         { emoji: '🕵️', categorie: 'Forces de l\'ordre', salaire: 4000 },
  'Medecin urgentiste':{ emoji: '🚑', categorie: 'EMS', salaire: 4200 },
  'Pompier':           { emoji: '🚒', categorie: 'EMS', salaire: 3600 },
  // Legaux
  'Chauffeur de taxi': { emoji: '🚕', categorie: 'Legal', salaire: 2000 },
  'Mecanicien':        { emoji: '🔧', categorie: 'Legal', salaire: 2500 },
  'Restaurateur':      { emoji: '🍔', categorie: 'Legal', salaire: 2200 },
  'Banquier':          { emoji: '🏦', categorie: 'Legal', salaire: 4500 },
  'Ouvrier BTP':       { emoji: '👷', categorie: 'Legal', salaire: 2300 },
  'Animateur':         { emoji: '🎤', categorie: 'Legal', salaire: 2800 },
  'Avocat':            { emoji: '⚖️', categorie: 'Legal', salaire: 5000 },
  'Journaliste':       { emoji: '📰', categorie: 'Legal', salaire: 2600 },
  'Agent immobilier':  { emoji: '🏠', categorie: 'Legal', salaire: 3200 },
  // Illegaux
  'Dealer':            { emoji: '💊', categorie: 'Illegal', salaire: 0 },
  'Trafiquant d\'armes':{ emoji: '🔫', categorie: 'Illegal', salaire: 0 },
  'Sans emploi':       { emoji: '💼', categorie: 'Autre', salaire: 500 },
};

const RECRUTEMENT = {
  'Policier': `👮 **RECRUTEMENT — LSPD**\n\nLe Los Santos Police Department recrute de nouveaux officiers !\n\n**Conditions :**\n• Etre majeur (18+)\n• Casier judiciaire vierge\n• Bonne maitrise du reglement RP\n• Disponibilite reguliere\n\n**Avantages :**\n• Salaire : 3 500€/semaine\n• Acces aux zones securisees\n• Equipement fourni\n\nPostulez via un ticket ! 📩`,
  'Motard LSPD': `🏍️ **RECRUTEMENT — MOTARDS LSPD**\n\nUnite motocycliste elite du LSPD recrute !\n\n**Conditions :**\n• Etre Policier depuis 2 semaines minimum\n• Maitrise de la conduite RP\n• Sang-froid en poursuite\n\n**Avantages :**\n• Salaire : 3 800€/semaine\n• Moto de service\n• Unite d\'elite\n\nPostulez via un ticket ! 📩`,
  'Detecteur': `🕵️ **RECRUTEMENT — DETECTIVE**\n\nLe service d\'enquete du LSPD recrute !\n\n**Conditions :**\n• Experience en tant que Policier\n• Sens de l\'analyse\n• Discretion absolue\n\n**Avantages :**\n• Salaire : 4 000€/semaine\n• Acces aux dossiers confidentiels\n• Travail en civil\n\nPostulez via un ticket ! 📩`,
  'Medecin urgentiste': `🚑 **RECRUTEMENT — EMS**\n\nL\'equipe medicale de Los Santos recrute !\n\n**Conditions :**\n• Calme sous pression\n• Disponible en soiree\n• Connaissance du RP medical\n\n**Avantages :**\n• Salaire : 4 200€/semaine\n• Materiel medical fourni\n• Respect garanti des autres factions\n\nPostulez via un ticket ! 📩`,
  'Pompier': `🚒 **RECRUTEMENT — POMPIERS**\n\nLa caserne de Los Santos recrute !\n\n**Conditions :**\n• Bonne condition physique RP\n• Esprit d\'equipe\n• Serieux et ponctualite\n\n**Avantages :**\n• Salaire : 3 600€/semaine\n• Vehicules d\'intervention\n• Unite soudee\n\nPostulez via un ticket ! 📩`,
  'Chauffeur de taxi': `🚕 **RECRUTEMENT — TAXI**\n\nLa compagnie de taxi Astra recrute !\n\n**Conditions :**\n• Permis de conduire RP\n• Connaissance de la ville\n• Serviable et ponctuel\n\n**Avantages :**\n• Salaire : 2 000€/semaine + pourboires\n• Vehicule fourni\n• Horaires flexibles\n\nPostulez via un ticket ! 📩`,
  'Mecanicien': `🔧 **RECRUTEMENT — MECANIQUE**\n\nLe garage Astra Motors recrute !\n\n**Conditions :**\n• Connaissance des vehicules RP\n• Patience et serieux\n• Disponible en journee\n\n**Avantages :**\n• Salaire : 2 500€/semaine\n• Outils fournis\n• Local de travail\n\nPostulez via un ticket ! 📩`,
  'Restaurateur': `🍔 **RECRUTEMENT — RESTAURATION**\n\nLe restaurant Astra Food recrute !\n\n**Conditions :**\n• Sens du service client\n• Creativite culinaire RP\n• Bonne humeur\n\n**Avantages :**\n• Salaire : 2 200€/semaine\n• Repas offerts\n• Ambiance sympa\n\nPostulez via un ticket ! 📩`,
  'Banquier': `🏦 **RECRUTEMENT — BANQUE D\'ASTRA**\n\nLa Banque d\'Astra recrute !\n\n**Conditions :**\n• Serieux et discret\n• Aucun casier judiciaire\n• Maitrise de l\'economie RP\n\n**Avantages :**\n• Salaire : 4 500€/semaine\n• Acces aux comptes\n• Prestige\n\nPostulez via un ticket ! 📩`,
  'Avocat': `⚖️ **RECRUTEMENT — CABINET JURIDIQUE**\n\nLe cabinet d\'avocats Astra Law recrute !\n\n**Conditions :**\n• Maitrise du reglement RP\n• Eloquence et persuasion\n• Neutralite\n\n**Avantages :**\n• Salaire : 5 000€/semaine\n• Bureau prive\n• Immunite partielle\n\nPostulez via un ticket ! 📩`,
};

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('🏙️ Cree tous les salons du serveur Astra RP')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('compte')
    .setDescription('💳 Voir ton compte bancaire'),

  new SlashCommandBuilder()
    .setName('virement')
    .setDescription('💸 Effectuer un virement')
    .addUserOption(o => o.setName('cible').setDescription('Joueur a payer').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant en euros').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('depot')
    .setDescription('🏦 Deposer de l\'argent a la banque')
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('retrait')
    .setDescription('💵 Retirer de l\'argent de la banque')
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('carte_identite')
    .setDescription('🪪 Voir ta carte d\'identite')
    .addUserOption(o => o.setName('joueur').setDescription('Voir la carte d\'un autre joueur')),

  new SlashCommandBuilder()
    .setName('setnom')
    .setDescription('✏️ Definir ton nom RP')
    .addStringOption(o => o.setName('prenom').setDescription('Prenom').setRequired(true))
    .addStringOption(o => o.setName('nom').setDescription('Nom de famille').setRequired(true)),

  new SlashCommandBuilder()
    .setName('permis')
    .setDescription('🚗 Voir ton permis de conduire')
    .addUserOption(o => o.setName('joueur').setDescription('Voir le permis d\'un joueur')),

  new SlashCommandBuilder()
    .setName('retirer_points')
    .setDescription('[POLICE] Retirer des points de permis')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('points').setDescription('Points a retirer').setRequired(true).setMinValue(1).setMaxValue(12))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),

  new SlashCommandBuilder()
    .setName('donner_permis')
    .setDescription('[ADMIN] Donner le permis a un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('inventaire')
    .setDescription('🎒 Voir ton inventaire'),

  new SlashCommandBuilder()
    .setName('braquer')
    .setDescription('🔫 Braquer une banque ou un magasin')
    .addStringOption(o => o.setName('cible').setDescription('Cible').setRequired(true)
      .addChoices(
        { name: '🏦 Banque d\'Astra', value: 'banque' },
        { name: '🏪 Superette', value: 'superette' },
        { name: '💊 Pharmacie', value: 'pharmacie' },
      )),

  new SlashCommandBuilder()
    .setName('wanted')
    .setDescription('[POLICE] Mettre un joueur en wanted')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('niveau').setDescription('Niveau wanted (1-5)').setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),

  new SlashCommandBuilder()
    .setName('unwanted')
    .setDescription('[POLICE] Retirer le wanted d\'un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true)),

  new SlashCommandBuilder()
    .setName('fouille')
    .setDescription('[POLICE] Fouiller un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur a fouiller').setRequired(true)),

  new SlashCommandBuilder()
    .setName('amende')
    .setDescription('[POLICE] Donner une amende')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant de l\'amende').setRequired(true).setMinValue(100))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),

  new SlashCommandBuilder()
    .setName('dealer')
    .setDescription('💊 Vendre de la drogue')
    .addStringOption(o => o.setName('type').setDescription('Type de drogue').setRequired(true)
      .addChoices(
        { name: '🌿 Weed', value: 'weed' },
        { name: '❄️ Cocaine', value: 'cocaine' },
        { name: '💊 Pilules', value: 'pilules' },
      ))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantite').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('fabriquer_drogue')
    .setDescription('🧪 Fabriquer de la drogue')
    .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true)
      .addChoices(
        { name: '🌿 Weed', value: 'weed' },
        { name: '❄️ Cocaine', value: 'cocaine' },
        { name: '💊 Pilules', value: 'pilules' },
      )),

  new SlashCommandBuilder()
    .setName('fabriquer_arme')
    .setDescription('🔧 Fabriquer une arme illegalement')
    .addStringOption(o => o.setName('arme').setDescription('Type d\'arme').setRequired(true)
      .addChoices(
        { name: '🔫 Pistolet', value: 'pistolet' },
        { name: '🔫 Uzi', value: 'uzi' },
        { name: '🪖 Fusil d\'assaut', value: 'fusil' },
        { name: '💣 Grenade', value: 'grenade' },
      )),

  new SlashCommandBuilder()
    .setName('vendre_arme')
    .setDescription('🔫 Vendre une arme au marche noir')
    .addStringOption(o => o.setName('arme').setDescription('Arme a vendre').setRequired(true)
      .addChoices(
        { name: '🔫 Pistolet', value: 'pistolet' },
        { name: '🔫 Uzi', value: 'uzi' },
        { name: '🪖 Fusil d\'assaut', value: 'fusil' },
        { name: '💣 Grenade', value: 'grenade' },
      )),

  new SlashCommandBuilder()
    .setName('racketter')
    .setDescription('💰 Racketter un joueur')
    .addUserOption(o => o.setName('cible').setDescription('Victime').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant demande').setRequired(true).setMinValue(100)),

  new SlashCommandBuilder()
    .setName('creer_personnage')
    .setDescription('🎭 Creer ton personnage RP')
    .addStringOption(o => o.setName('prenom').setDescription('Prenom').setRequired(true))
    .addStringOption(o => o.setName('nom').setDescription('Nom').setRequired(true))
    .addIntegerOption(o => o.setName('age').setDescription('Age').setRequired(true).setMinValue(18).setMaxValue(80))
    .addStringOption(o => o.setName('job').setDescription('Metier de depart').setRequired(true)
      .addChoices(
        { name: '👮 Policier', value: 'Policier' },
        { name: '🏍️ Motard LSPD', value: 'Motard LSPD' },
        { name: '🕵️ Detecteur', value: 'Detecteur' },
        { name: '🚑 Medecin urgentiste', value: 'Medecin urgentiste' },
        { name: '🚒 Pompier', value: 'Pompier' },
        { name: '🚕 Chauffeur de taxi', value: 'Chauffeur de taxi' },
        { name: '🔧 Mecanicien', value: 'Mecanicien' },
        { name: '🍔 Restaurateur', value: 'Restaurateur' },
        { name: '🏦 Banquier', value: 'Banquier' },
        { name: '👷 Ouvrier BTP', value: 'Ouvrier BTP' },
        { name: '🎤 Animateur', value: 'Animateur' },
        { name: '⚖️ Avocat', value: 'Avocat' },
        { name: '📰 Journaliste', value: 'Journaliste' },
        { name: '🏠 Agent immobilier', value: 'Agent immobilier' },
        { name: '💼 Sans emploi', value: 'Sans emploi' },
      )),

  new SlashCommandBuilder()
    .setName('profil')
    .setDescription('👤 Voir ton profil RP')
    .addUserOption(o => o.setName('joueur').setDescription('Voir le profil d\'un autre joueur')),

  new SlashCommandBuilder()
    .setName('metiers')
    .setDescription('💼 Voir la liste de tous les metiers disponibles'),

  new SlashCommandBuilder()
    .setName('acheter_stockage')
    .setDescription('📦 Acheter un entrepot (5000€)'),

  new SlashCommandBuilder()
    .setName('stockage')
    .setDescription('📦 Voir ton entrepot'),

  new SlashCommandBuilder()
    .setName('deposer_item')
    .setDescription('📦 Deposer un item dans ton entrepot')
    .addStringOption(o => o.setName('item').setDescription('Nom de l\'item').setRequired(true))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantite').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('retirer_item')
    .setDescription('📦 Retirer un item de ton entrepot')
    .addStringOption(o => o.setName('item').setDescription('Nom de l\'item').setRequired(true))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantite').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('acheter_maison')
    .setDescription('🏠 Acheter une propriete')
    .addStringOption(o => o.setName('type').setDescription('Type de bien').setRequired(true)
      .addChoices(
        { name: '🏠 Studio - 10 000€', value: 'studio' },
        { name: '🏡 Appartement - 35 000€', value: 'appartement' },
        { name: '🏰 Villa - 120 000€', value: 'villa' },
        { name: '🏯 Manoir - 500 000€', value: 'manoir' },
      )),

  new SlashCommandBuilder()
    .setName('maison')
    .setDescription('🏠 Voir ta propriete'),

  new SlashCommandBuilder()
    .setName('vendre_maison')
    .setDescription('🏚️ Vendre ta propriete'),

  new SlashCommandBuilder()
    .setName('addmoney')
    .setDescription('[ADMIN] Ajouter de l\'argent')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('removemoney')
    .setDescription('[ADMIN] Retirer de l\'argent')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('setjob')
    .setDescription('[ADMIN] Definir le metier d\'un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addStringOption(o => o.setName('job').setDescription('Metier').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('giveitem')
    .setDescription('[ADMIN] Donner un item a un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addStringOption(o => o.setName('item').setDescription('Item').setRequired(true))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantite').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('removeitem')
    .setDescription('[ADMIN] Retirer un item d\'un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addStringOption(o => o.setName('item').setDescription('Item').setRequired(true))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantite').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('resetplayer')
    .setDescription('[ADMIN] Reinitialiser un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('admininfo')
    .setDescription('[ADMIN] Voir toutes les infos d\'un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`✅ Bot connecte en tant que ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map(c => c.toJSON()) });
    console.log('✅ Commandes slash enregistrees !');
  } catch (err) {
    console.error(err);
  }
});

// ─── LOGS ─────────────────────────────────────────────────────────────────────
client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!oldMsg.guild || oldMsg.author?.bot) return;
  const logsChannel = oldMsg.guild.channels.cache.find(c => c.name === 'logs-general');
  if (!logsChannel) return;
  logsChannel.send({ embeds: [new EmbedBuilder()
    .setTitle('✏️ Message modifie')
    .setColor(0xffa500)
    .addFields(
      { name: 'Auteur', value: `<@${oldMsg.author?.id}>`, inline: true },
      { name: 'Salon', value: `<#${oldMsg.channelId}>`, inline: true },
      { name: 'Avant', value: oldMsg.content?.slice(0,500) || '*inconnu*' },
      { name: 'Apres', value: newMsg.content?.slice(0,500) || '*inconnu*' },
    )
    .setTimestamp()] });
});

client.on('messageDelete', async (msg) => {
  if (!msg.guild || msg.author?.bot) return;
  const logsChannel = msg.guild.channels.cache.find(c => c.name === 'logs-general');
  if (!logsChannel) return;
  logsChannel.send({ embeds: [new EmbedBuilder()
    .setTitle('🗑️ Message supprime')
    .setColor(0xff4444)
    .addFields(
      { name: 'Auteur', value: `<@${msg.author?.id}>`, inline: true },
      { name: 'Salon', value: `<#${msg.channelId}>`, inline: true },
      { name: 'Contenu', value: msg.content?.slice(0,500) || '*inconnu*' },
    )
    .setTimestamp()] });
});

client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = oldState.guild || newState.guild;
  const logsChannel = guild.channels.cache.find(c => c.name === 'logs-general');
  if (!logsChannel) return;
  const user = `<@${newState.id}>`;
  if (!oldState.channelId && newState.channelId) {
    logsChannel.send({ embeds: [new EmbedBuilder().setTitle('🎤 Vocal — Connexion').setColor(0x00ff88).setDescription(`${user} a rejoint **${newState.channel?.name}**`).setTimestamp()] });
  } else if (oldState.channelId && !newState.channelId) {
    logsChannel.send({ embeds: [new EmbedBuilder().setTitle('🎤 Vocal — Deconnexion').setColor(0xff4444).setDescription(`${user} a quitte **${oldState.channel?.name}**`).setTimestamp()] });
  } else if (oldState.channelId !== newState.channelId) {
    logsChannel.send({ embeds: [new EmbedBuilder().setTitle('🎤 Vocal — Deplacement').setColor(0xffa500).setDescription(`${user} : **${oldState.channel?.name}** → **${newState.channel?.name}**`).setTimestamp()] });
  }
});

// ─── TICKETS ──────────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (interaction.isButton() && interaction.customId === 'open_ticket') {
    const guild = interaction.guild;
    const existing = guild.channels.cache.find(c => c.name === `ticket-${interaction.user.username.toLowerCase()}`);
    if (existing) return interaction.reply({ content: `❌ Tu as deja un ticket ouvert : <#${existing.id}>`, ephemeral: true });
    const ticket = await guild.channels.create({
      name: `ticket-${interaction.user.username.toLowerCase()}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ],
    });
    const closeBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer le ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );
    await ticket.send({ content: `<@${interaction.user.id}>`, embeds: [new EmbedBuilder()
      .setTitle('🎫 Ticket ouvert')
      .setColor(0x00ff88)
      .setDescription('Bonjour ! Explique ton probleme ou ta demande, un staff va te repondre.')
      .setFooter({ text: 'Astra RP • Support' })
      .setTimestamp()], components: [closeBtn] });
    await interaction.reply({ content: `✅ Ton ticket a ete cree : <#${ticket.id}>`, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply({ content: '🔒 Ticket ferme dans 5 secondes...' });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }
});

// ─── INTERACTIONS PRINCIPALES ─────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const db = loadDB();
  const userId = interaction.user.id;
  getPlayer(db, userId);
  const { commandName } = interaction;

  if (!FREE_COMMANDS.includes(commandName)) {
    const sub = await checkSubscription(userId);
    if (!sub.access) return interaction.reply({ embeds: [noSubEmbed()], ephemeral: true });
    if (sub.daysLeft !== undefined && sub.daysLeft <= 3) {
      interaction.channel?.send({ content: `<@${userId}> ⚠️ Ton abonnement expire dans **${sub.daysLeft} jour(s)** ! Renouvelle sur ${SITE_URL}` }).catch(() => {});
    }
  }

  // ══════════════════════════════════════════
  //  SETUP AMELIORE
  // ══════════════════════════════════════════
  if (commandName === 'setup') {
    await interaction.deferReply();
    const guild = interaction.guild;

    const categories = [
      { name: '🏙️ ─ ASTRA RP', channels: [
        { name: '📋・reglement', type: ChannelType.GuildText, topic: 'Reglement du serveur Astra RP', lock: true },
        { name: '📢・annonces', type: ChannelType.GuildText, topic: 'Annonces officielles du staff', lock: true },
        { name: '✅・verification', type: ChannelType.GuildText, topic: 'Verification des nouveaux membres' },
        { name: '🗺️・presentation', type: ChannelType.GuildText, topic: 'Presentez-vous ici !' },
        { name: '🎫・tickets', type: ChannelType.GuildText, topic: 'Ouvrir un ticket de support' },
      ]},
      { name: '💬 ─ GENERAL', channels: [
        { name: '💬・general', type: ChannelType.GuildText, topic: 'Discussion generale hors-RP' },
        { name: '🖼️・medias', type: ChannelType.GuildText, topic: 'Partagez vos screenshots et videos' },
        { name: '🎮・hors-rp', type: ChannelType.GuildText, topic: 'Discussion hors-roleplay' },
        { name: '🤝・recrutement', type: ChannelType.GuildText, topic: 'Offres d\'emploi et recrutement', lock: true },
        { name: '🎤・vocal-general', type: ChannelType.GuildVoice },
        { name: '🎮・gaming', type: ChannelType.GuildVoice },
        { name: '🎵・musique', type: ChannelType.GuildVoice },
      ]},
      { name: '🏦 ─ ECONOMIE & BANQUE', channels: [
        { name: '💳・compte-bancaire', type: ChannelType.GuildText, topic: 'Utilisez /compte pour voir votre solde' },
        { name: '🏪・marche', type: ChannelType.GuildText, topic: 'Marche entre joueurs' },
        { name: '💼・offres-emploi', type: ChannelType.GuildText, topic: 'Offres d\'emploi legales' },
      ]},
      { name: '🚔 ─ LSPD - POLICE', channels: [
        { name: '🚔・quartier-general', type: ChannelType.GuildText, topic: 'QG du LSPD — Forces de l\'ordre' },
        { name: '📋・rapports-police', type: ChannelType.GuildText, topic: 'Rapports d\'intervention' },
        { name: '🔍・avis-recherche', type: ChannelType.GuildText, topic: 'Avis de recherche actifs', lock: true },
        { name: '🚔・patrouille-lspd', type: ChannelType.GuildVoice },
        { name: '🏍️・motards-lspd', type: ChannelType.GuildVoice },
        { name: '🎤・briefing-police', type: ChannelType.GuildVoice },
      ]},
      { name: '⚕️ ─ EMS - MEDECINS', channels: [
        { name: '🏥・urgences', type: ChannelType.GuildText, topic: 'Service des urgences EMS' },
        { name: '📋・rapports-medicaux', type: ChannelType.GuildText, topic: 'Rapports medicaux' },
        { name: '🚑・intervention-ems', type: ChannelType.GuildVoice },
        { name: '🎤・ems-vocal', type: ChannelType.GuildVoice },
      ]},
      { name: '🌿 ─ CRIMINEL', channels: [
        { name: '💊・marche-noir', type: ChannelType.GuildText, topic: 'Marche noir — Activites illegales' },
        { name: '🔫・armurerie-illegale', type: ChannelType.GuildText, topic: 'Trafic d\'armes' },
        { name: '🤝・deals', type: ChannelType.GuildText, topic: 'Deals et transactions illegales' },
        { name: '🌿・criminel-vocal', type: ChannelType.GuildVoice },
        { name: '💣・planification', type: ChannelType.GuildVoice },
      ]},
      { name: '📋 ─ LOGS', channels: [
        { name: 'logs-sanctions', type: ChannelType.GuildText, topic: 'Logs bans, kicks, warns, mutes', lock: true },
        { name: 'logs-general', type: ChannelType.GuildText, topic: 'Logs messages edites/supprimes, vocal', lock: true },
      ]},
      { name: '📋 ─ ADMINISTRATION', channels: [
        { name: '🛠️・staff-general', type: ChannelType.GuildText, topic: 'Salon prive du staff' },
        { name: '📩・demandes', type: ChannelType.GuildText, topic: 'Demandes des membres' },
        { name: '🔨・sanctions', type: ChannelType.GuildText, topic: 'Registre des sanctions' },
        { name: '🎤・staff-vocal', type: ChannelType.GuildVoice },
      ]},
    ];

    for (const cat of categories) {
      const category = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory });
      for (const ch of cat.channels) {
        const channel = await guild.channels.create({
          name: ch.name,
          type: ch.type,
          parent: category.id,
          topic: ch.topic || null,
        });
        if (ch.lock && ch.type === ChannelType.GuildText) {
          await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        }
      }
    }

    // Reglement
    const reglementChannel = guild.channels.cache.find(c => c.name === '📋・reglement');
    if (reglementChannel) {
      const reglEmbed = new EmbedBuilder()
        .setTitle('📋 REGLEMENT — ASTRA RP')
        .setColor(0xe8212a)
        .setDescription('Bienvenue sur **Astra RP** ! Lisez attentivement le reglement avant de jouer.')
        .addFields(
          { name: '1️⃣ Respect', value: 'Respectez tous les membres. Aucune insulte, discrimination ou harcelement tolere.' },
          { name: '2️⃣ No Meta-Gaming', value: 'N\'utilisez pas d\'informations hors-RP dans le jeu.' },
          { name: '3️⃣ No Power-Gaming', value: 'Ne forcez pas des actions impossibles sur d\'autres joueurs.' },
          { name: '4️⃣ No Déathmatching', value: 'Tuer sans raison RP valable est interdit.' },
          { name: '5️⃣ Fear RP', value: 'Votre personnage doit craindre pour sa vie dans les situations dangereuses.' },
          { name: '6️⃣ Personnage coherent', value: 'Restez en personnage a tout moment dans les zones RP.' },
          { name: '7️⃣ Ecoute du staff', value: 'Les decisions du staff sont definitives. Ouvrez un ticket pour contester.' },
          { name: '8️⃣ Abonnement', value: 'L\'acces au bot necessite un abonnement actif.' },
        )
        .setFooter({ text: 'Astra RP • Bonne chance dans votre vie a Los Santos !' })
        .setTimestamp();
      const msg = await reglementChannel.send({ embeds: [reglEmbed] });
      await msg.pin().catch(() => {});
    }

    // Tickets
    const ticketsChannel = guild.channels.cache.find(c => c.name === '🎫・tickets');
    if (ticketsChannel) {
      const ticketBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_ticket').setLabel('Ouvrir un ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')
      );
      await ticketsChannel.send({ embeds: [new EmbedBuilder()
        .setTitle('🎫 Support — Astra RP')
        .setColor(0x1e90ff)
        .setDescription('Besoin d\'aide ? Cliquez sur le bouton ci-dessous pour ouvrir un ticket prive avec le staff.')
        .setFooter({ text: 'Astra RP • Support' })], components: [ticketBtn] });
    }

    // Recrutement
    const recrutChannel = guild.channels.cache.find(c => c.name === '🤝・recrutement');
    if (recrutChannel) {
      for (const [metier, texte] of Object.entries(RECRUTEMENT)) {
        const m = METIERS[metier];
        await recrutChannel.send({ embeds: [new EmbedBuilder()
          .setTitle(`${m.emoji} Recrutement — ${metier}`)
          .setColor(0xf5c518)
          .setDescription(texte)
          .addFields({ name: '💰 Salaire', value: m.salaire > 0 ? `${m.salaire.toLocaleString()} €/semaine` : 'Variable', inline: true })
          .setFooter({ text: 'Astra RP • Recrutement' })
          .setTimestamp()] });
        await new Promise(r => setTimeout(r, 500));
      }
    }

    await interaction.editReply({ embeds: [new EmbedBuilder()
      .setTitle('✅ Serveur Astra RP configure !')
      .setColor(0x00ff88)
      .setDescription('Tous les salons ont ete crees avec succes !')
      .addFields(
        { name: '📋 Reglement', value: 'Ecrit et epingle automatiquement', inline: true },
        { name: '🎫 Tickets', value: 'Bouton configure dans #tickets', inline: true },
        { name: '🤝 Recrutement', value: 'Fiches metiers envoyees', inline: true },
        { name: '📊 Logs', value: '2 salons de logs crees', inline: true },
      )
      .setTimestamp()] });
  }

  // ══════════════════════════════════════════
  //  METIERS
  // ══════════════════════════════════════════
  else if (commandName === 'metiers') {
    const forces = Object.entries(METIERS).filter(([,v]) => v.categorie === 'Forces de l\'ordre').map(([k,v]) => `${v.emoji} **${k}** — ${v.salaire.toLocaleString()}€/sem`).join('\n');
    const ems = Object.entries(METIERS).filter(([,v]) => v.categorie === 'EMS').map(([k,v]) => `${v.emoji} **${k}** — ${v.salaire.toLocaleString()}€/sem`).join('\n');
    const legal = Object.entries(METIERS).filter(([,v]) => v.categorie === 'Legal').map(([k,v]) => `${v.emoji} **${k}** — ${v.salaire.toLocaleString()}€/sem`).join('\n');
    const illegal = Object.entries(METIERS).filter(([,v]) => v.categorie === 'Illegal').map(([k,v]) => `${v.emoji} **${k}** — Revenus variables`).join('\n');
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle('💼 Metiers disponibles — Astra RP')
      .setColor(0xf5c518)
      .addFields(
        { name: '🚔 Forces de l\'ordre', value: forces },
        { name: '⚕️ EMS', value: ems },
        { name: '💼 Legaux', value: legal },
        { name: '🌿 Illegaux/Gris', value: illegal },
      )
      .setFooter({ text: 'Utilise /creer_personnage pour choisir ton metier' })
      .setTimestamp()] });
  }

  // ══════════════════════════════════════════
  //  COMPTE BANCAIRE
  // ══════════════════════════════════════════
  else if (commandName === 'compte') {
    const bank = db.bank[userId];
    const player = db.players[userId];
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle('💳 Compte Bancaire')
      .setColor(0x1e90ff)
      .setDescription(`**${player.name || interaction.user.username}**`)
      .addFields(
        { name: '💵 Argent sur soi', value: `${bank.cash.toLocaleString()} €`, inline: true },
        { name: '🏦 Argent en banque', value: `${bank.bank.toLocaleString()} €`, inline: true },
        { name: '💰 Total', value: `${(bank.cash + bank.bank).toLocaleString()} €`, inline: true },
      )
      .setFooter({ text: 'Banque d\'Astra' })
      .setTimestamp()], ephemeral: true });
  }

  else if (commandName === 'virement') {
    const cible = interaction.options.getUser('cible');
    const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    if (db.bank[userId].cash < montant) return interaction.reply({ content: '❌ Tu n\'as pas assez d\'argent sur toi !', ephemeral: true });
    db.bank[userId].cash -= montant;
    db.bank[cible.id].cash += montant;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('💸 Virement effectue').setColor(0x00ff88).addFields(
      { name: 'De', value: `<@${userId}>`, inline: true },
      { name: 'Vers', value: `<@${cible.id}>`, inline: true },
      { name: 'Montant', value: `${montant.toLocaleString()} €`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'depot') {
    const montant = interaction.options.getInteger('montant');
    if (db.bank[userId].cash < montant) return interaction.reply({ content: '❌ Pas assez d\'argent sur toi !', ephemeral: true });
    db.bank[userId].cash -= montant;
    db.bank[userId].bank += montant;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏦 Depot effectue').setColor(0x00ff88).setDescription(`**+${montant} €** deposes en banque.`).setTimestamp()] });
  }

  else if (commandName === 'retrait') {
    const montant = interaction.options.getInteger('montant');
    if (db.bank[userId].bank < montant) return interaction.reply({ content: '❌ Pas assez d\'argent en banque !', ephemeral: true });
    db.bank[userId].bank -= montant;
    db.bank[userId].cash += montant;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('💵 Retrait effectue').setColor(0x00ff88).setDescription(`**${montant} €** retires de la banque.`).setTimestamp()] });
  }

  else if (commandName === 'setnom') {
    const prenom = interaction.options.getString('prenom');
    const nom = interaction.options.getString('nom');
    db.players[userId].name = `${prenom} ${nom}`;
    saveDB(db);
    await interaction.reply({ content: `✅ Ton nom RP est maintenant **${prenom} ${nom}**`, ephemeral: true });
  }

  else if (commandName === 'carte_identite') {
    const cible = interaction.options.getUser('joueur') || interaction.user;
    getPlayer(db, cible.id);
    const p = db.players[cible.id];
    const l = db.driving_license[cible.id];
    const w = db.wanted[cible.id];
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle('🪪 Carte d\'Identite — Los Santos')
      .setColor(0xffd700)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '👤 Nom complet', value: p.name || '*Non defini*', inline: true },
        { name: '💼 Metier', value: p.job, inline: true },
        { name: '⭐ Niveau', value: `${p.level}`, inline: true },
        { name: '🚗 Permis', value: l.has ? `✅ Valide — **${l.points}/12 pts**` : '❌ Pas de permis', inline: true },
        { name: '🔴 Wanted', value: w.level > 0 ? `${'⭐'.repeat(w.level)} (${w.reason})` : '✅ Aucun', inline: true },
      )
      .setFooter({ text: 'Astra RP Police • ID verifiee' })
      .setTimestamp()] });
  }

  else if (commandName === 'permis') {
    const cible = interaction.options.getUser('joueur') || interaction.user;
    getPlayer(db, cible.id);
    const l = db.driving_license[cible.id];
    const p = db.players[cible.id];
    const pointsBar = '🟩'.repeat(l.points) + '⬛'.repeat(12 - l.points);
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle('🚗 Permis de Conduire')
      .setColor(l.has ? 0x00ff88 : 0xff4444)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '👤 Titulaire', value: p.name || cible.username, inline: true },
        { name: '📋 Statut', value: l.has ? '✅ Valide' : '❌ Non obtenu', inline: true },
        { name: '⭐ Points', value: `${l.points}/12\n${pointsBar}` },
      )
      .setTimestamp()] });
  }

  else if (commandName === 'donner_permis') {
    const cible = interaction.options.getUser('joueur');
    getPlayer(db, cible.id);
    db.driving_license[cible.id].has = true;
    db.driving_license[cible.id].points = 12;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚗 Permis delivre').setColor(0x00ff88).setDescription(`<@${cible.id}> a obtenu son permis !`).setTimestamp()] });
  }

  else if (commandName === 'retirer_points') {
    const cible = interaction.options.getUser('joueur');
    const points = interaction.options.getInteger('points');
    const raison = interaction.options.getString('raison');
    getPlayer(db, cible.id);
    if (!db.driving_license[cible.id].has) return interaction.reply({ content: '❌ Ce joueur n\'a pas de permis.', ephemeral: true });
    db.driving_license[cible.id].points = Math.max(0, db.driving_license[cible.id].points - points);
    if (db.driving_license[cible.id].points === 0) db.driving_license[cible.id].has = false;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚔 Retrait de points').setColor(0xff6600).addFields(
      { name: '👮 Officier', value: `<@${userId}>`, inline: true },
      { name: '🎯 Conducteur', value: `<@${cible.id}>`, inline: true },
      { name: '➖ Points', value: `${points} pts`, inline: true },
      { name: '📋 Raison', value: raison },
      { name: '📊 Restants', value: `${db.driving_license[cible.id].points}/12`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'inventaire') {
    const inv = db.inventory[userId];
    const items = Object.entries(inv).map(([item, qty]) => `• **${item}** x${qty}`).join('\n') || '*Inventaire vide*';
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎒 Inventaire').setColor(0x8b4513).setDescription(items).setTimestamp()], ephemeral: true });
  }

  else if (commandName === 'braquer') {
    const cible = interaction.options.getString('cible');
    const cooldown = 15 * 60 * 1000;
    const now = Date.now();
    if (!db.players[userId].lastBraquage) db.players[userId].lastBraquage = 0;
    const diff = now - db.players[userId].lastBraquage;
    if (diff < cooldown) {
      const reste = Math.ceil((cooldown - diff) / 60000);
      return interaction.reply({ content: `⏳ Attends encore **${reste} minutes** !`, ephemeral: true });
    }
    const butin = { banque: Math.floor(Math.random() * 50000) + 20000, superette: Math.floor(Math.random() * 3000) + 500, pharmacie: Math.floor(Math.random() * 5000) + 1000 };
    db.players[userId].lastBraquage = now;
    if (Math.random() < 0.35) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2);
      db.wanted[userId].reason = `Tentative de braquage (${cible})`;
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Braquage echoue !').setColor(0xff0000).setDescription(`Tu t\'es fait reperer ! 🔴 Wanted niveau **${db.wanted[userId].level}** !`).setTimestamp()] });
    }
    const gain = butin[cible];
    db.bank[userId].cash += gain;
    db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1);
    db.wanted[userId].reason = `Braquage (${cible})`;
    saveDB(db);
    const emoji = { banque: '🏦', superette: '🏪', pharmacie: '💊' };
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[cible]} Braquage reussi !`).setColor(0x00ff88).addFields(
      { name: '💰 Butin', value: `${gain.toLocaleString()} €`, inline: true },
      { name: '🔴 Wanted', value: `Niveau ${db.wanted[userId].level}`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'wanted') {
    const cible = interaction.options.getUser('joueur');
    const niveau = interaction.options.getInteger('niveau');
    const raison = interaction.options.getString('raison');
    getPlayer(db, cible.id);
    db.wanted[cible.id] = { level: niveau, reason: raison };
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 AVIS DE RECHERCHE').setColor(0xff0000).setThumbnail(cible.displayAvatarURL()).addFields(
      { name: '🎯 Suspect', value: `<@${cible.id}>`, inline: true },
      { name: '⭐ Niveau', value: '⭐'.repeat(niveau), inline: true },
      { name: '📋 Raison', value: raison },
      { name: '👮 Officier', value: `<@${userId}>`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'unwanted') {
    const cible = interaction.options.getUser('joueur');
    getPlayer(db, cible.id);
    db.wanted[cible.id] = { level: 0, reason: null };
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Wanted retire').setColor(0x00ff88).setDescription(`Le wanted de <@${cible.id}> a ete retire.`).setTimestamp()] });
  }

  else if (commandName === 'fouille') {
    const cible = interaction.options.getUser('joueur');
    getPlayer(db, cible.id);
    const items = Object.entries(db.inventory[cible.id]).map(([item, qty]) => `• **${item}** x${qty}`).join('\n') || '*Rien de suspect*';
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔍 Resultat de fouille').setColor(0x1e90ff).setDescription(`Fouille de <@${cible.id}> par <@${userId}>`).addFields({ name: '🎒 Objets trouves', value: items }).setTimestamp()] });
  }

  else if (commandName === 'amende') {
    const cible = interaction.options.getUser('joueur');
    const montant = interaction.options.getInteger('montant');
    const raison = interaction.options.getString('raison');
    getPlayer(db, cible.id);
    if (db.bank[cible.id].cash >= montant) db.bank[cible.id].cash -= montant;
    else if (db.bank[cible.id].bank >= montant) db.bank[cible.id].bank -= montant;
    else { db.bank[cible.id].cash = 0; db.bank[cible.id].bank = 0; }
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('💸 Amende emise').setColor(0xff6600).addFields(
      { name: '🎯 Contrevenant', value: `<@${cible.id}>`, inline: true },
      { name: '💵 Montant', value: `${montant.toLocaleString()} €`, inline: true },
      { name: '📋 Raison', value: raison },
      { name: '👮 Officier', value: `<@${userId}>`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'fabriquer_drogue') {
    const type = interaction.options.getString('type');
    const cout = { weed: 200, cocaine: 800, pilules: 400 };
    const emoji = { weed: '🌿', cocaine: '❄️', pilules: '💊' };
    if (db.bank[userId].cash < cout[type]) return interaction.reply({ content: `❌ Il te faut **${cout[type]} €** !`, ephemeral: true });
    db.bank[userId].cash -= cout[type];
    if (Math.random() < 0.2) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1);
      db.wanted[userId].reason = 'Fabrication de drogue';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💥 Fabrication ratee !').setColor(0xff0000).setDescription('Explosion ! La police a ete alertee ! +1 Wanted').setTimestamp()] });
    }
    const key = `${emoji[type]} ${type}`;
    if (!db.inventory[userId][key]) db.inventory[userId][key] = 0;
    db.inventory[userId][key] += 5;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[type]} Drogue fabriquee !`).setColor(0x8b008b).addFields(
      { name: 'Produit', value: `${emoji[type]} ${type}`, inline: true },
      { name: 'Quantite', value: '5 unites', inline: true },
      { name: '💸 Cout', value: `${cout[type]} €`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'dealer') {
    const type = interaction.options.getString('type');
    const quantite = interaction.options.getInteger('quantite');
    const emoji = { weed: '🌿', cocaine: '❄️', pilules: '💊' };
    const prix = { weed: 150, cocaine: 600, pilules: 300 };
    const key = `${emoji[type]} ${type}`;
    if (!db.inventory[userId][key] || db.inventory[userId][key] < quantite) return interaction.reply({ content: `❌ Pas assez de **${type}** !`, ephemeral: true });
    db.inventory[userId][key] -= quantite;
    if (Math.random() < 0.25) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2);
      db.wanted[userId].reason = 'Deal de drogue';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Deal rate !').setColor(0xff0000).setDescription('La police t\'a repere ! +2 Wanted.').setTimestamp()] });
    }
    const gain = prix[type] * quantite;
    db.bank[userId].cash += gain;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[type]} Deal effectue !`).setColor(0x8b008b).addFields(
      { name: 'Produit', value: `${emoji[type]} ${type} x${quantite}`, inline: true },
      { name: '💰 Gain', value: `${gain.toLocaleString()} €`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'fabriquer_arme') {
    const arme = interaction.options.getString('arme');
    const cout = { pistolet: 1500, uzi: 3000, fusil: 8000, grenade: 2000 };
    const emoji = { pistolet: '🔫', uzi: '🔫', fusil: '🪖', grenade: '💣' };
    if (db.bank[userId].cash < cout[arme]) return interaction.reply({ content: `❌ Il te faut **${cout[arme]} €** !`, ephemeral: true });
    db.bank[userId].cash -= cout[arme];
    if (Math.random() < 0.3) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2);
      db.wanted[userId].reason = 'Fabrication d\'armes illegales';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💥 Fabrication echouee !').setColor(0xff0000).setDescription('Police alertee ! +2 Wanted. Materiaux perdus.').setTimestamp()] });
    }
    const key = `${emoji[arme]} ${arme}`;
    if (!db.inventory[userId][key]) db.inventory[userId][key] = 0;
    db.inventory[userId][key] += 1;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[arme]} Arme fabriquee !`).setColor(0x800000).addFields(
      { name: 'Arme', value: `${emoji[arme]} ${arme}`, inline: true },
      { name: '💸 Cout', value: `${cout[arme].toLocaleString()} €`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'vendre_arme') {
    const arme = interaction.options.getString('arme');
    const emoji = { pistolet: '🔫', uzi: '🔫', fusil: '🪖', grenade: '💣' };
    const prix = { pistolet: 2500, uzi: 5000, fusil: 12000, grenade: 3500 };
    const key = `${emoji[arme]} ${arme}`;
    if (!db.inventory[userId][key] || db.inventory[userId][key] < 1) return interaction.reply({ content: `❌ Tu n\'as pas de **${arme}** !`, ephemeral: true });
    db.inventory[userId][key] -= 1;
    if (Math.random() < 0.2) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 3);
      db.wanted[userId].reason = 'Trafic d\'armes';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Transaction interceptee !').setColor(0xff0000).setDescription('Les flics ont intercepte la vente ! +3 Wanted.').setTimestamp()] });
    }
    db.bank[userId].cash += prix[arme];
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[arme]} Arme vendue !`).setColor(0x800000).addFields(
      { name: 'Arme', value: `${emoji[arme]} ${arme}`, inline: true },
      { name: '💰 Gain', value: `${prix[arme].toLocaleString()} €`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'racketter') {
    const cible = interaction.options.getUser('cible');
    const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    if (cible.id === userId) return interaction.reply({ content: '❌ Tu ne peux pas te racketter toi-meme !', ephemeral: true });
    if (Math.random() < 0.3) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1);
      db.wanted[userId].reason = 'Tentative de racket';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Racket echoue !').setColor(0xff0000).setDescription(`<@${cible.id}> t\'a resiste ! +1 Wanted`).setTimestamp()] });
    }
    const pris = Math.min(montant, db.bank[cible.id].cash);
    db.bank[cible.id].cash -= pris;
    db.bank[userId].cash += pris;
    db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1);
    db.wanted[userId].reason = 'Racket';
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('💰 Racket reussi !').setColor(0xff8c00).addFields(
      { name: '🎯 Victime', value: `<@${cible.id}>`, inline: true },
      { name: '💵 Extorque', value: `${pris.toLocaleString()} €`, inline: true },
      { name: '🔴 Wanted', value: `Niveau ${db.wanted[userId].level}`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'creer_personnage') {
    if (db.players[userId].created) return interaction.reply({ content: '❌ Tu as deja cree ton personnage !', ephemeral: true });
    const prenom = interaction.options.getString('prenom');
    const nom = interaction.options.getString('nom');
    const age = interaction.options.getInteger('age');
    const job = interaction.options.getString('job');
    const m = METIERS[job] || { emoji: '💼', salaire: 500 };
    db.players[userId] = { ...db.players[userId], prenom, nom, name: `${prenom} ${nom}`, age, job, created: true, level: 1, xp: 0 };
    db.bank[userId].cash = 2000;
    db.bank[userId].bank = 5000;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle('🎭 Personnage cree — Astra RP')
      .setColor(0xf5c518)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(`Bienvenue a **Astra RP**, **${prenom} ${nom}** !`)
      .addFields(
        { name: '👤 Identite', value: `${prenom} ${nom}`, inline: true },
        { name: '🎂 Age', value: `${age} ans`, inline: true },
        { name: `${m.emoji} Metier`, value: job, inline: true },
        { name: '💵 Cash de depart', value: '2 000 €', inline: true },
        { name: '🏦 Banque de depart', value: '5 000 €', inline: true },
        { name: '💰 Salaire hebdo', value: m.salaire > 0 ? `${m.salaire.toLocaleString()} €/semaine` : 'Variable', inline: true },
      )
      .setFooter({ text: 'Astra RP • Bonne chance !' })
      .setTimestamp()] });
  }

  else if (commandName === 'profil') {
    const cible = interaction.options.getUser('joueur') || interaction.user;
    getPlayer(db, cible.id);
    const p = db.players[cible.id];
    const b = db.bank[cible.id];
    const l = db.driving_license[cible.id];
    const w = db.wanted[cible.id];
    const h = db.housing[cible.id];
    const s = db.storage[cible.id];
    if (!p.created) return interaction.reply({ content: `❌ <@${cible.id}> n\'a pas encore cree son personnage !`, ephemeral: true });
    const m = METIERS[p.job] || { emoji: '💼' };
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle(`👤 Profil — ${p.name}`)
      .setColor(0x1e90ff)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '🪪 Identite', value: `${p.prenom} ${p.nom}`, inline: true },
        { name: '🎂 Age', value: `${p.age} ans`, inline: true },
        { name: `${m.emoji} Metier`, value: p.job, inline: true },
        { name: '⭐ Niveau', value: `${p.level}`, inline: true },
        { name: '💰 Fortune', value: `Cash: **${b.cash.toLocaleString()} €**\nBanque: **${b.bank.toLocaleString()} €**`, inline: true },
        { name: '🚗 Permis', value: l.has ? `✅ ${l.points}/12 pts` : '❌ Aucun', inline: true },
        { name: '🏠 Logement', value: h.has ? `✅ ${h.address}` : '❌ Sans domicile', inline: true },
        { name: '📦 Stockage', value: s.unlocked ? '✅ Debloque' : '❌ Verrouille', inline: true },
        { name: '🔴 Wanted', value: w.level > 0 ? `${'⭐'.repeat(w.level)} — ${w.reason}` : '✅ Aucun', inline: true },
      )
      .setFooter({ text: 'Astra RP • Profil joueur' })
      .setTimestamp()] });
  }

  else if (commandName === 'acheter_stockage') {
    const cout = 5000;
    if (db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu as deja un entrepot !', ephemeral: true });
    if (db.bank[userId].cash < cout) return interaction.reply({ content: `❌ Il te faut **${cout.toLocaleString()} €** en cash !`, ephemeral: true });
    db.bank[userId].cash -= cout;
    db.storage[userId].unlocked = true;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Entrepot achete !').setColor(0x00ff88).setDescription('Tu es maintenant proprietaire d\'un entrepot !').setTimestamp()] });
  }

  else if (commandName === 'stockage') {
    if (!db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu n\'as pas d\'entrepot !', ephemeral: true });
    const items = Object.entries(db.storage[userId].items).map(([k, v]) => `• **${k}** x${v}`).join('\n') || '*Entrepot vide*';
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Entrepot').setColor(0x8b4513).setDescription(items).setTimestamp()], ephemeral: true });
  }

  else if (commandName === 'deposer_item') {
    const item = interaction.options.getString('item');
    const qty = interaction.options.getInteger('quantite');
    if (!db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu n\'as pas d\'entrepot !', ephemeral: true });
    if (!db.inventory[userId][item] || db.inventory[userId][item] < qty) return interaction.reply({ content: `❌ Pas assez de **${item}** !`, ephemeral: true });
    db.inventory[userId][item] -= qty;
    if (db.inventory[userId][item] <= 0) delete db.inventory[userId][item];
    if (!db.storage[userId].items[item]) db.storage[userId].items[item] = 0;
    db.storage[userId].items[item] += qty;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Item depose').setColor(0x00ff88).setDescription(`**${item}** x${qty} → Entrepot`).setTimestamp()] });
  }

  else if (commandName === 'retirer_item') {
    const item = interaction.options.getString('item');
    const qty = interaction.options.getInteger('quantite');
    if (!db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu n\'as pas d\'entrepot !', ephemeral: true });
    if (!db.storage[userId].items[item] || db.storage[userId].items[item] < qty) return interaction.reply({ content: `❌ Pas assez de **${item}** dans l\'entrepot !`, ephemeral: true });
    db.storage[userId].items[item] -= qty;
    if (db.storage[userId].items[item] <= 0) delete db.storage[userId].items[item];
    if (!db.inventory[userId][item]) db.inventory[userId][item] = 0;
    db.inventory[userId][item] += qty;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Item retire').setColor(0x00ff88).setDescription(`**${item}** x${qty} → Inventaire`).setTimestamp()] });
  }

  else if (commandName === 'acheter_maison') {
    const type = interaction.options.getString('type');
    const biens = {
      studio:      { prix: 10000,  label: '🏠 Studio',      adresse: '12 Rue des Pauvres, Astra' },
      appartement: { prix: 35000,  label: '🏡 Appartement', adresse: '47 Avenue du Soleil, Astra' },
      villa:       { prix: 120000, label: '🏰 Villa',        adresse: '8 Allee des Riches, Astra Heights' },
      manoir:      { prix: 500000, label: '🏯 Manoir',       adresse: '1 Boulevard du Pouvoir, Astra Hills' },
    };
    const bien = biens[type];
    if (db.housing[userId].has) return interaction.reply({ content: '❌ Tu possedes deja une propriete !', ephemeral: true });
    const total = db.bank[userId].cash + db.bank[userId].bank;
    if (total < bien.prix) return interaction.reply({ content: `❌ Il te faut **${bien.prix.toLocaleString()} €** !`, ephemeral: true });
    if (db.bank[userId].cash >= bien.prix) { db.bank[userId].cash -= bien.prix; }
    else { const reste = bien.prix - db.bank[userId].cash; db.bank[userId].cash = 0; db.bank[userId].bank -= reste; }
    db.housing[userId] = { has: true, address: bien.adresse, type, label: bien.label, prix: bien.prix, level: 1 };
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${bien.label} achete !`).setColor(0xf5c518).addFields(
      { name: '📍 Adresse', value: bien.adresse },
      { name: '💸 Prix', value: `${bien.prix.toLocaleString()} €`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'maison') {
    const h = db.housing[userId];
    if (!h.has) return interaction.reply({ content: '❌ Tu n\'as pas de propriete !', ephemeral: true });
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${h.label} — Ma Maison`).setColor(0xf5c518).addFields(
      { name: '📍 Adresse', value: h.address },
      { name: '🏠 Type', value: h.label, inline: true },
      { name: '⭐ Niveau', value: `${h.level}`, inline: true },
      { name: '💰 Valeur estimee', value: `${(h.prix * 0.7).toLocaleString()} €`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'vendre_maison') {
    const h = db.housing[userId];
    if (!h.has) return interaction.reply({ content: '❌ Tu n\'as pas de propriete !', ephemeral: true });
    const gain = Math.floor(h.prix * 0.7);
    db.bank[userId].cash += gain;
    db.housing[userId] = { has: false, address: null, level: 1 };
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏚️ Propriete vendue').setColor(0xff6600).setDescription(`Vendue pour **${gain.toLocaleString()} €** (70% de la valeur).`).setTimestamp()] });
  }

  else if (commandName === 'addmoney') {
    const cible = interaction.options.getUser('joueur');
    const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    db.bank[cible.id].cash += montant;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Argent ajoute').setColor(0x00ff88).setDescription(`**+${montant.toLocaleString()} €** a <@${cible.id}>`).setTimestamp()] });
  }

  else if (commandName === 'removemoney') {
    const cible = interaction.options.getUser('joueur');
    const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    if (db.bank[cible.id].cash >= montant) { db.bank[cible.id].cash -= montant; }
    else { const reste = montant - db.bank[cible.id].cash; db.bank[cible.id].cash = 0; db.bank[cible.id].bank = Math.max(0, db.bank[cible.id].bank - reste); }
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('💸 Argent retire').setColor(0xff4444).setDescription(`**-${montant.toLocaleString()} €** a <@${cible.id}>`).setTimestamp()] });
  }

  else if (commandName === 'setjob') {
    const cible = interaction.options.getUser('joueur');
    const job = interaction.options.getString('job');
    getPlayer(db, cible.id);
    db.players[cible.id].job = job;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Metier mis a jour').setColor(0x00ff88).setDescription(`<@${cible.id}> est maintenant **${job}**`).setTimestamp()] });
  }

  else if (commandName === 'giveitem') {
    const cible = interaction.options.getUser('joueur');
    const item = interaction.options.getString('item');
    const qty = interaction.options.getInteger('quantite');
    getPlayer(db, cible.id);
    if (!db.inventory[cible.id][item]) db.inventory[cible.id][item] = 0;
    db.inventory[cible.id][item] += qty;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎁 Item donne').setColor(0x00ff88).setDescription(`**${item}** x${qty} → <@${cible.id}>`).setTimestamp()] });
  }

  else if (commandName === 'removeitem') {
    const cible = interaction.options.getUser('joueur');
    const item = interaction.options.getString('item');
    const qty = interaction.options.getInteger('quantite');
    getPlayer(db, cible.id);
    if (!db.inventory[cible.id][item]) return interaction.reply({ content: `❌ <@${cible.id}> n\'a pas de **${item}** !`, ephemeral: true });
    db.inventory[cible.id][item] = Math.max(0, db.inventory[cible.id][item] - qty);
    if (db.inventory[cible.id][item] === 0) delete db.inventory[cible.id][item];
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🗑️ Item retire').setColor(0xff4444).setDescription(`**${item}** x${qty} retire a <@${cible.id}>`).setTimestamp()] });
  }

  else if (commandName === 'resetplayer') {
    const cible = interaction.options.getUser('joueur');
    delete db.players[cible.id];
    delete db.bank[cible.id];
    delete db.inventory[cible.id];
    delete db.storage[cible.id];
    delete db.housing[cible.id];
    delete db.driving_license[cible.id];
    delete db.wanted[cible.id];
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔄 Joueur reinitialise').setColor(0xff4444).setDescription(`Le profil de <@${cible.id}> a ete reinitialise.`).setTimestamp()] });
  }

  else if (commandName === 'admininfo') {
    const cible = interaction.options.getUser('joueur');
    getPlayer(db, cible.id);
    const p = db.players[cible.id];
    const b = db.bank[cible.id];
    const l = db.driving_license[cible.id];
    const w = db.wanted[cible.id];
    const h = db.housing[cible.id];
    const s = db.storage[cible.id];
    const inv = Object.entries(db.inventory[cible.id]).map(([k,v]) => `${k} x${v}`).join(', ') || 'Vide';
    const stk = Object.entries(s.items || {}).map(([k,v]) => `${k} x${v}`).join(', ') || 'Vide';
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🔧 Admin Info — ${p.name || cible.username}`).setColor(0xf5c518).setThumbnail(cible.displayAvatarURL()).addFields(
      { name: '🪪 Nom RP', value: p.name || 'Non cree', inline: true },
      { name: '🎂 Age', value: p.age ? `${p.age} ans` : 'N/A', inline: true },
      { name: '💼 Job', value: p.job, inline: true },
      { name: '⭐ Niveau', value: `${p.level}`, inline: true },
      { name: '💵 Cash', value: `${b.cash.toLocaleString()} €`, inline: true },
      { name: '🏦 Banque', value: `${b.bank.toLocaleString()} €`, inline: true },
      { name: '🚗 Permis', value: l.has ? `✅ ${l.points}/12pts` : '❌', inline: true },
      { name: '🏠 Maison', value: h.has ? h.label : '❌', inline: true },
      { name: '📦 Stockage', value: s.unlocked ? '✅' : '❌', inline: true },
      { name: '🔴 Wanted', value: w.level > 0 ? `⭐x${w.level} — ${w.reason}` : 'Aucun', inline: true },
      { name: '🎒 Inventaire', value: inv.length > 200 ? inv.slice(0,200)+'...' : inv },
      { name: '📦 Entrepot', value: stk.length > 200 ? stk.slice(0,200)+'...' : stk },
    ).setTimestamp()], ephemeral: true });
  }
});

client.login(TOKEN);

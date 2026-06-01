const {
  Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField,
  ChannelType, SlashCommandBuilder, Collection
} = require('discord.js');
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
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
  ]
});

const TOKEN      = process.env.TOKEN      || 'TON_TOKEN_ICI';
const CLIENT_ID  = process.env.CLIENT_ID  || 'TON_CLIENT_ID_ICI';
const SITE_URL   = process.env.SITE_URL   || 'http://localhost:3000';
const PREFIX     = '+';

// ─── SERVEUR GRATUIT (le tien) ────────────────────────────────────────────────
const FREE_GUILD = '1510713666369093784';

// ─── ABONNEMENT PAR GUILD ─────────────────────────────────────────────────────
async function checkGuildSubscription(guildId) {
  if (guildId === FREE_GUILD) return { access: true, free: true };
  try {
    const res = await axios.get(`${SITE_URL}/api/check-guild/${guildId}`);
    return res.data;
  } catch {
    return { access: false, reason: 'Erreur de connexion au serveur' };
  }
}

function noSubEmbed(siteUrl = SITE_URL) {
  return new EmbedBuilder()
    .setTitle('🔒 Accès refusé — Abonnement requis')
    .setColor(0xe8212a)
    .setDescription(`Ce serveur n'a pas d'abonnement actif.\nAbonnez-vous sur **[notre site](${siteUrl})** pour accéder au bot !`)
    .addFields(
      { name: '💳 Prix', value: '10€/mois', inline: true },
      { name: '🌐 Site', value: `[Cliquer ici](${siteUrl})`, inline: true }
    )
    .setFooter({ text: 'Astra RP • Abonnement' });
}

// ─── BASE DE DONNÉES ──────────────────────────────────────────────────────────
const DB_FILE = './database.json';

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ players: {}, bank: {}, inventory: {}, storage: {}, housing: {}, driving_license: {}, wanted: {}, warns: {} }));
  }
  const raw = JSON.parse(fs.readFileSync(DB_FILE));
  if (!raw.storage) raw.storage = {};
  if (!raw.housing) raw.housing = {};
  if (!raw.warns)   raw.warns   = {};
  return raw;
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getPlayer(db, userId) {
  if (!db.players[userId]) {
    db.players[userId]         = { name: null, prenom: null, nom: null, age: null, job: 'Sans emploi', level: 1, xp: 0, created: false };
    db.bank[userId]            = { cash: 500, bank: 1000 };
    db.inventory[userId]       = {};
    db.storage[userId]         = { unlocked: false, items: {} };
    db.housing[userId]         = { has: false, address: null, level: 1 };
    db.driving_license[userId] = { has: false, points: 12 };
    db.wanted[userId]          = { level: 0, reason: null };
    db.warns[userId]           = [];
    saveDB(db);
  }
  if (!db.storage[userId])   db.storage[userId]   = { unlocked: false, items: {} };
  if (!db.housing[userId])   db.housing[userId]   = { has: false, address: null, level: 1 };
  if (!db.warns[userId])     db.warns[userId]     = [];
  if (db.players[userId].created === undefined) db.players[userId].created = false;
  return db;
}

// ─── COMMANDES SLASH ─────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName('help').setDescription('📖 Afficher toutes les commandes'),
  new SlashCommandBuilder().setName('setup').setDescription('🏙️ Recrée entièrement le serveur Astra RP').setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  // ÉCONOMIE
  new SlashCommandBuilder().setName('compte').setDescription('💳 Voir ton compte bancaire'),
  new SlashCommandBuilder().setName('virement').setDescription('💸 Effectuer un virement')
    .addUserOption(o => o.setName('cible').setDescription('Joueur à payer').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('depot').setDescription('🏦 Déposer de l\'argent à la banque')
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('retrait').setDescription('💵 Retirer de l\'argent de la banque')
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),

  // IDENTITÉ
  new SlashCommandBuilder().setName('carte_identite').setDescription('🪪 Voir ta carte d\'identité')
    .addUserOption(o => o.setName('joueur').setDescription('Voir la carte d\'un autre joueur')),
  new SlashCommandBuilder().setName('setnom').setDescription('✏️ Définir ton nom RP')
    .addStringOption(o => o.setName('prenom').setDescription('Prénom').setRequired(true))
    .addStringOption(o => o.setName('nom').setDescription('Nom de famille').setRequired(true)),
  new SlashCommandBuilder().setName('creer_personnage').setDescription('🎭 Créer ton personnage RP')
    .addStringOption(o => o.setName('prenom').setDescription('Prénom').setRequired(true))
    .addStringOption(o => o.setName('nom').setDescription('Nom').setRequired(true))
    .addIntegerOption(o => o.setName('age').setDescription('Âge').setRequired(true).setMinValue(18).setMaxValue(80))
    .addStringOption(o => o.setName('job').setDescription('Métier').setRequired(true)
      .addChoices(
        { name: '👮 Policier', value: 'Policier' },
        { name: '🚑 Médecin', value: 'Medecin' },
        { name: '🚕 Chauffeur de taxi', value: 'Chauffeur de taxi' },
        { name: '🍔 Restaurateur', value: 'Restaurateur' },
        { name: '🚗 Mécanicien', value: 'Mecanicien' },
        { name: '💼 Sans emploi', value: 'Sans emploi' },
      )),
  new SlashCommandBuilder().setName('profil').setDescription('👤 Voir ton profil RP')
    .addUserOption(o => o.setName('joueur').setDescription('Voir le profil d\'un autre joueur')),

  // PERMIS
  new SlashCommandBuilder().setName('permis').setDescription('🚗 Voir ton permis de conduire')
    .addUserOption(o => o.setName('joueur').setDescription('Voir le permis d\'un joueur')),
  new SlashCommandBuilder().setName('donner_permis').setDescription('[ADMIN] Donner le permis à un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('retirer_points').setDescription('[POLICE] Retirer des points de permis')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('points').setDescription('Points à retirer').setRequired(true).setMinValue(1).setMaxValue(12))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),

  // INVENTAIRE & STOCKAGE
  new SlashCommandBuilder().setName('inventaire').setDescription('🎒 Voir ton inventaire'),
  new SlashCommandBuilder().setName('acheter_stockage').setDescription('📦 Acheter un entrepôt (5000€)'),
  new SlashCommandBuilder().setName('stockage').setDescription('📦 Voir ton entrepôt'),
  new SlashCommandBuilder().setName('deposer_item').setDescription('📦 Déposer un item dans ton entrepôt')
    .addStringOption(o => o.setName('item').setDescription('Nom de l\'item').setRequired(true))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantité').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('retirer_item').setDescription('📦 Retirer un item de ton entrepôt')
    .addStringOption(o => o.setName('item').setDescription('Nom de l\'item').setRequired(true))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantité').setRequired(true).setMinValue(1)),

  // IMMOBILIER
  new SlashCommandBuilder().setName('acheter_maison').setDescription('🏠 Acheter une propriété')
    .addStringOption(o => o.setName('type').setDescription('Type de bien').setRequired(true)
      .addChoices(
        { name: '🏠 Studio - 10 000€', value: 'studio' },
        { name: '🏡 Appartement - 35 000€', value: 'appartement' },
        { name: '🏰 Villa - 120 000€', value: 'villa' },
        { name: '🏯 Manoir - 500 000€', value: 'manoir' },
      )),
  new SlashCommandBuilder().setName('maison').setDescription('🏠 Voir ta propriété'),
  new SlashCommandBuilder().setName('vendre_maison').setDescription('🏚️ Vendre ta propriété'),

  // CRIMINEL
  new SlashCommandBuilder().setName('braquer').setDescription('🔫 Braquer une banque ou un magasin')
    .addStringOption(o => o.setName('cible').setDescription('Cible').setRequired(true)
      .addChoices(
        { name: '🏦 Banque d\'Astra', value: 'banque' },
        { name: '🏪 Superette', value: 'superette' },
        { name: '💊 Pharmacie', value: 'pharmacie' },
      )),
  new SlashCommandBuilder().setName('dealer').setDescription('💊 Vendre de la drogue')
    .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true)
      .addChoices(
        { name: '🌿 Weed', value: 'weed' },
        { name: '❄️ Cocaine', value: 'cocaine' },
        { name: '💊 Pilules', value: 'pilules' },
      ))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantité').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('fabriquer_drogue').setDescription('🧪 Fabriquer de la drogue')
    .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true)
      .addChoices(
        { name: '🌿 Weed', value: 'weed' },
        { name: '❄️ Cocaine', value: 'cocaine' },
        { name: '💊 Pilules', value: 'pilules' },
      )),
  new SlashCommandBuilder().setName('fabriquer_arme').setDescription('🔧 Fabriquer une arme illégalement')
    .addStringOption(o => o.setName('arme').setDescription('Type d\'arme').setRequired(true)
      .addChoices(
        { name: '🔫 Pistolet', value: 'pistolet' },
        { name: '🔫 Uzi', value: 'uzi' },
        { name: '🪖 Fusil d\'assaut', value: 'fusil' },
        { name: '💣 Grenade', value: 'grenade' },
      )),
  new SlashCommandBuilder().setName('vendre_arme').setDescription('🔫 Vendre une arme au marché noir')
    .addStringOption(o => o.setName('arme').setDescription('Arme').setRequired(true)
      .addChoices(
        { name: '🔫 Pistolet', value: 'pistolet' },
        { name: '🔫 Uzi', value: 'uzi' },
        { name: '🪖 Fusil d\'assaut', value: 'fusil' },
        { name: '💣 Grenade', value: 'grenade' },
      )),
  new SlashCommandBuilder().setName('racketter').setDescription('💰 Racketter un joueur')
    .addUserOption(o => o.setName('cible').setDescription('Victime').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(100)),

  // POLICE
  new SlashCommandBuilder().setName('wanted').setDescription('[POLICE] Mettre un joueur en wanted')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('niveau').setDescription('Niveau (1-5)').setRequired(true).setMinValue(1).setMaxValue(5))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),
  new SlashCommandBuilder().setName('unwanted').setDescription('[POLICE] Retirer le wanted d\'un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true)),
  new SlashCommandBuilder().setName('fouille').setDescription('[POLICE] Fouiller un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true)),
  new SlashCommandBuilder().setName('amende').setDescription('[POLICE] Donner une amende')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(100))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),

  // MODÉRATION
  new SlashCommandBuilder().setName('ban').setDescription('[MOD] Bannir un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison'))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
  new SlashCommandBuilder().setName('kick').setDescription('[MOD] Expulser un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison'))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),
  new SlashCommandBuilder().setName('mute').setDescription('[MOD] Rendre muet un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addIntegerOption(o => o.setName('duree').setDescription('Durée en minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('raison').setDescription('Raison'))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  new SlashCommandBuilder().setName('unmute').setDescription('[MOD] Retirer le mute')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers),
  new SlashCommandBuilder().setName('warn').setDescription('[MOD] Avertir un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
  new SlashCommandBuilder().setName('warns').setDescription('[MOD] Voir les warns d\'un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
  new SlashCommandBuilder().setName('clearwarns').setDescription('[MOD] Supprimer les warns d\'un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
  new SlashCommandBuilder().setName('clear').setDescription('[MOD] Supprimer des messages')
    .addIntegerOption(o => o.setName('nombre').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),
  new SlashCommandBuilder().setName('lock').setDescription('[MOD] Verrouiller le salon')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('[MOD] Déverrouiller le salon')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  new SlashCommandBuilder().setName('slowmode').setDescription('[MOD] Slowmode dans le salon')
    .addIntegerOption(o => o.setName('secondes').setDescription('Délai en secondes (0 = désactiver)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageChannels),
  new SlashCommandBuilder().setName('dmall').setDescription('[ADMIN] Envoyer un DM à tous les membres')
    .addStringOption(o => o.setName('message').setDescription('Message à envoyer').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  // ADMIN RP
  new SlashCommandBuilder().setName('addmoney').setDescription('[ADMIN] Ajouter de l\'argent')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('removemoney').setDescription('[ADMIN] Retirer de l\'argent')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('setjob').setDescription('[ADMIN] Définir le métier d\'un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addStringOption(o => o.setName('job').setDescription('Métier').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('giveitem').setDescription('[ADMIN] Donner un item à un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addStringOption(o => o.setName('item').setDescription('Item').setRequired(true))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantité').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('removeitem').setDescription('[ADMIN] Retirer un item d\'un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addStringOption(o => o.setName('item').setDescription('Item').setRequired(true))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantité').setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('resetplayer').setDescription('[ADMIN] Réinitialiser un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
  new SlashCommandBuilder().setName('admininfo').setDescription('[ADMIN] Voir toutes les infos d\'un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
];

// ─── ENREGISTREMENT DES COMMANDES ─────────────────────────────────────────────
const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`✅ Bot connecté en tant que ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands.map(c => c.toJSON()) });
    console.log('✅ Commandes slash enregistrées !');
  } catch (err) {
    console.error(err);
  }
});

// ─── HELPER ───────────────────────────────────────────────────────────────────
function modEmbed(title, user, raison, color) {
  return new EmbedBuilder().setTitle(title).setColor(color)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: '👤 Membre', value: `${user.tag} (<@${user.id}>)`, inline: true },
      { name: '📋 Raison', value: raison, inline: true },
    ).setTimestamp();
}

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Astra RP — Toutes les commandes')
    .setColor(0xf5c518)
    .setDescription(`Prefix: \`${PREFIX}\` | Slash: \`/\`\n`)
    .addFields(
      { name: '💰 Économie', value: '`/compte` `/virement` `/depot` `/retrait`' },
      { name: '🎭 Personnage', value: '`/creer_personnage` `/profil` `/setnom` `/carte_identite`' },
      { name: '🚗 Permis', value: '`/permis` `/donner_permis` `/retirer_points`' },
      { name: '🎒 Inventaire & Stockage', value: '`/inventaire` `/acheter_stockage` `/stockage` `/deposer_item` `/retirer_item`' },
      { name: '🏠 Immobilier', value: '`/acheter_maison` `/maison` `/vendre_maison`' },
      { name: '🔫 Criminel', value: '`/braquer` `/dealer` `/fabriquer_drogue` `/fabriquer_arme` `/vendre_arme` `/racketter`' },
      { name: '🚔 Police', value: '`/wanted` `/unwanted` `/fouille` `/amende`' },
      { name: '🛡️ Modération', value: '`/ban` `/kick` `/mute` `/unmute` `/warn` `/warns` `/clearwarns` `/clear` `/lock` `/unlock` `/slowmode`\nPrefix aussi: `+ban` `+kick` `+warn` `+clear`' },
      { name: '⚙️ Administration', value: '`/setup` `/dmall` `/addmoney` `/removemoney` `/setjob` `/giveitem` `/removeitem` `/resetplayer` `/admininfo`' },
    )
    .setFooter({ text: 'Astra RP • Powered by Astra Bot' }).setTimestamp();
}

// ─── COMMANDES PREFIX (+) ─────────────────────────────────────────────────────
client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const cmd  = args.shift().toLowerCase();

  if (cmd === 'help') return message.channel.send({ embeds: [buildHelpEmbed()] });

  if (cmd === 'clear') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply('❌ Permission refusée.');
    const n = parseInt(args[0]);
    if (!n || n < 1 || n > 100) return message.reply('❌ Indique un nombre entre 1 et 100.');
    await message.channel.bulkDelete(n + 1, true).catch(() => {});
    const m = await message.channel.send(`✅ **${n}** messages supprimés.`);
    setTimeout(() => m.delete().catch(() => {}), 3000);
    return;
  }

  if (cmd === 'ban') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return message.reply('❌ Permission refusée.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mentionne un membre.');
    const raison = args.slice(1).join(' ') || 'Aucune raison';
    await target.ban({ reason: raison });
    return message.channel.send({ embeds: [modEmbed('🔨 Membre banni', target.user, raison, 0xff0000)] });
  }

  if (cmd === 'kick') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return message.reply('❌ Permission refusée.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mentionne un membre.');
    const raison = args.slice(1).join(' ') || 'Aucune raison';
    await target.kick(raison);
    return message.channel.send({ embeds: [modEmbed('👢 Membre expulsé', target.user, raison, 0xff6600)] });
  }

  if (cmd === 'warn') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return message.reply('❌ Permission refusée.');
    const target = message.mentions.members.first();
    if (!target) return message.reply('❌ Mentionne un membre.');
    const raison = args.slice(1).join(' ') || 'Aucune raison';
    const db = loadDB();
    if (!db.warns[target.id]) db.warns[target.id] = [];
    db.warns[target.id].push({ raison, date: new Date().toISOString(), by: message.author.id });
    saveDB(db);
    return message.channel.send({ embeds: [modEmbed(`⚠️ Avertissement #${db.warns[target.id].length}`, target.user, raison, 0xffcc00)] });
  }
});

// ─── INTERACTIONS SLASH ───────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const guildId = interaction.guildId;
  const userId  = interaction.user.id;

  // Commandes qui ne nécessitent pas de vérif abonnement
  const skipSub = ['help', 'setup', 'ban', 'kick', 'mute', 'unmute', 'warn', 'warns', 'clearwarns',
    'clear', 'lock', 'unlock', 'slowmode', 'dmall', 'addmoney', 'removemoney', 'setjob',
    'giveitem', 'removeitem', 'resetplayer', 'admininfo', 'donner_permis'];

  if (!skipSub.includes(commandName)) {
    const sub = await checkGuildSubscription(guildId);
    if (!sub.access) {
      return interaction.reply({ embeds: [noSubEmbed()], ephemeral: true });
    }
    if (sub.daysLeft !== undefined && sub.daysLeft <= 3) {
      interaction.channel?.send({ content: `⚠️ L'abonnement de ce serveur expire dans **${sub.daysLeft} jour(s)** ! Renouvelez sur ${SITE_URL}` }).catch(() => {});
    }
  }

  const db = loadDB();
  getPlayer(db, userId);

  // ── HELP ──────────────────────────────────────────────────────────────────
  if (commandName === 'help') return interaction.reply({ embeds: [buildHelpEmbed()] });

  // ── SETUP ─────────────────────────────────────────────────────────────────
  if (commandName === 'setup') {
    await interaction.deferReply();
    const guild = interaction.guild;
    const existing = await guild.channels.fetch();
    for (const [, channel] of existing) await channel.delete().catch(() => {});

    const structure = [
      { name: '🏙️ ─ LOS SANTOS RP', channels: [
        { name: '📋・règlement', type: ChannelType.GuildText },
        { name: '📢・annonces', type: ChannelType.GuildText },
        { name: '✅・vérification', type: ChannelType.GuildText },
        { name: '🗺️・présentation', type: ChannelType.GuildText },
        { name: '🎫・tickets', type: ChannelType.GuildText },
      ]},
      { name: '💬 ─ GÉNÉRAL', channels: [
        { name: '💬・général', type: ChannelType.GuildText },
        { name: '🖼️・médias', type: ChannelType.GuildText },
        { name: '🎮・hors-rp', type: ChannelType.GuildText },
        { name: '🤝・recrutement', type: ChannelType.GuildText },
        { name: '🤖・bot-commandes', type: ChannelType.GuildText },
      ]},
      { name: '🎤 ─ SALONS VOCAUX', channels: [
        ...Array.from({ length: 30 }, (_, i) => ({ name: `・vocal ${i + 1}`, type: ChannelType.GuildVoice }))
      ]},
      { name: '🏦 ─ ÉCONOMIE & BANQUE', channels: [
        { name: '💳・compte-bancaire', type: ChannelType.GuildText },
        { name: '🏪・marché', type: ChannelType.GuildText },
        { name: '💼・offres-emploi', type: ChannelType.GuildText },
      ]},
      { name: '🚔 ─ LSPD — POLICE', channels: [
        { name: '🚔・quartier-général', type: ChannelType.GuildText },
        { name: '📋・rapports-police', type: ChannelType.GuildText },
        { name: '🔍・avis-recherche', type: ChannelType.GuildText },
        { name: '🎫・demandes-permis', type: ChannelType.GuildText },
        { name: '🎤・briefing-police', type: ChannelType.GuildVoice },
      ]},
      { name: '⚕️ ─ EMS — MÉDECINS', channels: [
        { name: '🏥・urgences', type: ChannelType.GuildText },
        { name: '📋・rapports-médicaux', type: ChannelType.GuildText },
        { name: '🎤・ems-vocal', type: ChannelType.GuildVoice },
      ]},
      { name: '🌿 ─ CRIMINEL', channels: [
        { name: '💊・marché-noir', type: ChannelType.GuildText },
        { name: '🔫・armurerie-illégale', type: ChannelType.GuildText },
        { name: '🤝・deals', type: ChannelType.GuildText },
        { name: '🎤・criminel-vocal', type: ChannelType.GuildVoice },
      ]},
      { name: '📋 ─ ADMINISTRATION', channels: [
        { name: '🛠️・staff-général', type: ChannelType.GuildText },
        { name: '📩・demandes', type: ChannelType.GuildText },
        { name: '🔨・sanctions', type: ChannelType.GuildText },
        { name: '📊・logs', type: ChannelType.GuildText },
        { name: '🎤・staff-vocal', type: ChannelType.GuildVoice },
      ]},
    ];

    for (const cat of structure) {
      const category = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory });
      for (const ch of cat.channels) await guild.channels.create({ name: ch.name, type: ch.type, parent: category.id });
    }

    const general = guild.channels.cache.find(c => c.name.includes('général') && c.type === ChannelType.GuildText);
    const target  = general || guild.channels.cache.find(c => c.type === ChannelType.GuildText);
    if (target) {
      await target.send({ embeds: [new EmbedBuilder().setTitle('✅ Serveur Astra RP configuré !')
        .setDescription('Tous les salons ont été recréés.\n30 salons vocaux · Structure GTA RP complète')
        .setColor(0x00ff88).setTimestamp()] });
    }
    return interaction.editReply({ content: '✅ Setup terminé !' }).catch(() => {});
  }

  // ── DMALL ─────────────────────────────────────────────────────────────────
  if (commandName === 'dmall') {
    const msg = interaction.options.getString('message');
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const members = await guild.members.fetch();
    let sent = 0, failed = 0;
    const dmEmbed = new EmbedBuilder()
      .setTitle('📢 Message du staff — Astra RP')
      .setDescription(msg)
      .setColor(0xf5c518)
      .setFooter({ text: `Astra RP • Message envoyé par ${interaction.user.username}` })
      .setTimestamp();
    for (const [, member] of members) {
      if (member.user.bot) continue;
      try {
        await member.send({ embeds: [dmEmbed] });
        sent++;
      } catch { failed++; }
    }
    return interaction.editReply({ content: `✅ DM envoyé à **${sent}** membres. (${failed} échoués — DM fermés)` });
  }

  // ── MODÉRATION ────────────────────────────────────────────────────────────
  if (commandName === 'ban') {
    const membre = interaction.options.getMember('membre');
    const raison = interaction.options.getString('raison') || 'Aucune raison';
    if (!membre) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
    await membre.ban({ reason: raison });
    return interaction.reply({ embeds: [modEmbed('🔨 Membre banni', membre.user, raison, 0xff0000)] });
  }

  if (commandName === 'kick') {
    const membre = interaction.options.getMember('membre');
    const raison = interaction.options.getString('raison') || 'Aucune raison';
    if (!membre) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
    await membre.kick(raison);
    return interaction.reply({ embeds: [modEmbed('👢 Membre expulsé', membre.user, raison, 0xff6600)] });
  }

  if (commandName === 'mute') {
    const membre = interaction.options.getMember('membre');
    const duree  = interaction.options.getInteger('duree');
    const raison = interaction.options.getString('raison') || 'Aucune raison';
    if (!membre) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
    await membre.timeout(duree * 60 * 1000, raison);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔇 Membre mis en sourdine').setColor(0xff9900)
      .addFields(
        { name: '👤 Membre', value: `<@${membre.id}>`, inline: true },
        { name: '⏱️ Durée', value: `${duree} minute(s)`, inline: true },
        { name: '📋 Raison', value: raison },
      ).setTimestamp()] });
  }

  if (commandName === 'unmute') {
    const membre = interaction.options.getMember('membre');
    if (!membre) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
    await membre.timeout(null);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔊 Mute retiré').setColor(0x00ff88).setDescription(`<@${membre.id}> peut à nouveau parler.`).setTimestamp()] });
  }

  if (commandName === 'warn') {
    const membre = interaction.options.getMember('membre');
    const raison = interaction.options.getString('raison');
    if (!membre) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
    if (!db.warns[membre.id]) db.warns[membre.id] = [];
    db.warns[membre.id].push({ raison, date: new Date().toISOString(), by: userId });
    saveDB(db);
    return interaction.reply({ embeds: [modEmbed(`⚠️ Avertissement #${db.warns[membre.id].length}`, membre.user, raison, 0xffcc00)] });
  }

  if (commandName === 'warns') {
    const membre = interaction.options.getMember('membre');
    if (!membre) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
    const warns = db.warns[membre.id] || [];
    const list  = warns.length ? warns.map((w, i) => `**#${i+1}** — ${w.raison} *(${new Date(w.date).toLocaleDateString('fr-FR')})*`).join('\n') : '*Aucun avertissement*';
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`⚠️ Warns — ${membre.user.username}`).setColor(0xffcc00).setDescription(list).setTimestamp()], ephemeral: true });
  }

  if (commandName === 'clearwarns') {
    const membre = interaction.options.getMember('membre');
    if (!membre) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
    db.warns[membre.id] = [];
    saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🧹 Warns supprimés').setColor(0x00ff88).setDescription(`Tous les warns de <@${membre.id}> ont été effacés.`).setTimestamp()] });
  }

  if (commandName === 'clear') {
    const n = interaction.options.getInteger('nombre');
    await interaction.deferReply({ ephemeral: true });
    await interaction.channel.bulkDelete(n, true).catch(() => {});
    return interaction.editReply({ content: `✅ **${n}** messages supprimés.` });
  }

  if (commandName === 'lock') {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔒 Salon verrouillé').setColor(0xff0000).setDescription('Personne ne peut plus envoyer de messages.').setTimestamp()] });
  }

  if (commandName === 'unlock') {
    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔓 Salon déverrouillé').setColor(0x00ff88).setDescription('Le salon est à nouveau ouvert.').setTimestamp()] });
  }

  if (commandName === 'slowmode') {
    const sec = interaction.options.getInteger('secondes');
    await interaction.channel.setRateLimitPerUser(sec);
    return interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle(sec === 0 ? '✅ Slowmode désactivé' : `🐢 Slowmode : ${sec}s`)
      .setColor(sec === 0 ? 0x00ff88 : 0xff9900).setTimestamp()] });
  }

  // ── ÉCONOMIE ─────────────────────────────────────────────────────────────
  if (commandName === 'compte') {
    const bank = db.bank[userId]; const player = db.players[userId];
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💳 Compte Bancaire').setColor(0x1e90ff)
      .setDescription(`**${player.name || interaction.user.username}**`)
      .addFields(
        { name: '💵 Sur soi',   value: `${bank.cash.toLocaleString()} €`, inline: true },
        { name: '🏦 En banque', value: `${bank.bank.toLocaleString()} €`, inline: true },
        { name: '💰 Total',     value: `${(bank.cash + bank.bank).toLocaleString()} €`, inline: true },
      ).setFooter({ text: 'Banque d\'Astra' }).setTimestamp()], ephemeral: true });
  }

  if (commandName === 'virement') {
    const cible = interaction.options.getUser('cible'); const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    if (db.bank[userId].cash < montant) return interaction.reply({ content: '❌ Pas assez d\'argent sur toi !', ephemeral: true });
    db.bank[userId].cash -= montant; db.bank[cible.id].cash += montant; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💸 Virement effectué').setColor(0x00ff88)
      .addFields({ name: 'De', value: `<@${userId}>`, inline: true }, { name: 'Vers', value: `<@${cible.id}>`, inline: true }, { name: 'Montant', value: `${montant.toLocaleString()} €`, inline: true })
      .setTimestamp()] });
  }

  if (commandName === 'depot') {
    const montant = interaction.options.getInteger('montant');
    if (db.bank[userId].cash < montant) return interaction.reply({ content: '❌ Pas assez d\'argent sur toi !', ephemeral: true });
    db.bank[userId].cash -= montant; db.bank[userId].bank += montant; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏦 Dépôt effectué').setColor(0x00ff88).setDescription(`**+${montant.toLocaleString()} €** déposés en banque.`).setTimestamp()] });
  }

  if (commandName === 'retrait') {
    const montant = interaction.options.getInteger('montant');
    if (db.bank[userId].bank < montant) return interaction.reply({ content: '❌ Pas assez d\'argent en banque !', ephemeral: true });
    db.bank[userId].bank -= montant; db.bank[userId].cash += montant; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💵 Retrait effectué').setColor(0x00ff88).setDescription(`**${montant.toLocaleString()} €** retirés de la banque.`).setTimestamp()] });
  }

  // ── IDENTITÉ ──────────────────────────────────────────────────────────────
  if (commandName === 'setnom') {
    const prenom = interaction.options.getString('prenom'); const nom = interaction.options.getString('nom');
    db.players[userId].name = `${prenom} ${nom}`; saveDB(db);
    return interaction.reply({ content: `✅ Ton nom RP est maintenant **${prenom} ${nom}**`, ephemeral: true });
  }

  if (commandName === 'carte_identite') {
    const cible = interaction.options.getUser('joueur') || interaction.user;
    getPlayer(db, cible.id);
    const p = db.players[cible.id]; const l = db.driving_license[cible.id]; const w = db.wanted[cible.id];
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🪪 Carte d\'Identité — Los Santos').setColor(0xffd700)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '👤 Nom complet', value: p.name || '*Non défini*', inline: true },
        { name: '💼 Métier', value: p.job, inline: true },
        { name: '⭐ Niveau', value: `${p.level}`, inline: true },
        { name: '🚗 Permis', value: l.has ? `✅ ${l.points}/12 pts` : '❌ Pas de permis', inline: true },
        { name: '🔴 Wanted', value: w.level > 0 ? `${'⭐'.repeat(w.level)} (${w.reason})` : '✅ Aucun', inline: true },
      ).setFooter({ text: 'Astra RP Police' }).setTimestamp()] });
  }

  if (commandName === 'creer_personnage') {
    if (db.players[userId].created) return interaction.reply({ content: '❌ Tu as déjà créé ton personnage !', ephemeral: true });
    const prenom = interaction.options.getString('prenom'); const nom = interaction.options.getString('nom');
    const age = interaction.options.getInteger('age'); const job = interaction.options.getString('job');
    db.players[userId] = { ...db.players[userId], prenom, nom, name: `${prenom} ${nom}`, age, job, created: true, level: 1, xp: 0 };
    db.bank[userId] = { cash: 2000, bank: 5000 }; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎭 Personnage créé — Astra RP').setColor(0xf5c518)
      .setThumbnail(interaction.user.displayAvatarURL()).setDescription(`Bienvenue à **Astra RP**, **${prenom} ${nom}** !`)
      .addFields(
        { name: '👤 Identité', value: `${prenom} ${nom}`, inline: true },
        { name: '🎂 Âge', value: `${age} ans`, inline: true },
        { name: '💼 Métier', value: job, inline: true },
        { name: '💵 Cash', value: '2 000 €', inline: true },
        { name: '🏦 Banque', value: '5 000 €', inline: true },
        { name: '⭐ Niveau', value: '1', inline: true },
      ).setFooter({ text: 'Bonne chance dans ta nouvelle vie !' }).setTimestamp()] });
  }

  if (commandName === 'profil') {
    const cible = interaction.options.getUser('joueur') || interaction.user;
    getPlayer(db, cible.id);
    const p = db.players[cible.id]; const b = db.bank[cible.id]; const l = db.driving_license[cible.id];
    const w = db.wanted[cible.id]; const h = db.housing[cible.id]; const s = db.storage[cible.id];
    if (!p.created) return interaction.reply({ content: `❌ <@${cible.id}> n'a pas encore créé son personnage !`, ephemeral: true });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 Profil — ${p.name}`).setColor(0x1e90ff)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '🪪 Identité', value: `${p.prenom} ${p.nom}`, inline: true },
        { name: '🎂 Âge', value: `${p.age} ans`, inline: true },
        { name: '💼 Métier', value: p.job, inline: true },
        { name: '⭐ Niveau', value: `${p.level}`, inline: true },
        { name: '💰 Fortune', value: `Cash: **${b.cash.toLocaleString()} €**\nBanque: **${b.bank.toLocaleString()} €**`, inline: true },
        { name: '🚗 Permis', value: l.has ? `✅ ${l.points}/12 pts` : '❌', inline: true },
        { name: '🏠 Logement', value: h.has ? `✅ ${h.address}` : '❌', inline: true },
        { name: '📦 Stockage', value: s.unlocked ? '✅' : '❌', inline: true },
        { name: '🔴 Wanted', value: w.level > 0 ? `${'⭐'.repeat(w.level)} — ${w.reason}` : '✅ Aucun', inline: true },
      ).setFooter({ text: 'Astra RP • Profil joueur' }).setTimestamp()] });
  }

  // ── PERMIS ────────────────────────────────────────────────────────────────
  if (commandName === 'permis') {
    const cible = interaction.options.getUser('joueur') || interaction.user;
    getPlayer(db, cible.id);
    const l = db.driving_license[cible.id]; const p = db.players[cible.id];
    const bar = '🟩'.repeat(l.points) + '⬛'.repeat(12 - l.points);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚗 Permis de Conduire').setColor(l.has ? 0x00ff88 : 0xff4444)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '👤 Titulaire', value: p.name || cible.username, inline: true },
        { name: '📋 Statut', value: l.has ? '✅ Valide' : '❌ Non obtenu', inline: true },
        { name: '⭐ Points', value: `${l.points}/12\n${bar}` },
      ).setTimestamp()] });
  }

  if (commandName === 'donner_permis') {
    const cible = interaction.options.getUser('joueur'); getPlayer(db, cible.id);
    db.driving_license[cible.id] = { has: true, points: 12 }; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚗 Permis délivré').setColor(0x00ff88).setDescription(`<@${cible.id}> a obtenu son permis !`)] });
  }

  if (commandName === 'retirer_points') {
    const cible = interaction.options.getUser('joueur'); const points = interaction.options.getInteger('points'); const raison = interaction.options.getString('raison');
    getPlayer(db, cible.id);
    if (!db.driving_license[cible.id].has) return interaction.reply({ content: '❌ Ce joueur n\'a pas de permis.', ephemeral: true });
    db.driving_license[cible.id].points = Math.max(0, db.driving_license[cible.id].points - points);
    if (db.driving_license[cible.id].points === 0) db.driving_license[cible.id].has = false;
    saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚔 Retrait de points').setColor(0xff6600)
      .addFields(
        { name: '👮 Officier', value: `<@${userId}>`, inline: true },
        { name: '🎯 Conducteur', value: `<@${cible.id}>`, inline: true },
        { name: '➖ Points', value: `${points} pts`, inline: true },
        { name: '📋 Raison', value: raison },
        { name: '📊 Restants', value: `${db.driving_license[cible.id].points}/12`, inline: true },
      ).setTimestamp()] });
  }

  // ── INVENTAIRE ────────────────────────────────────────────────────────────
  if (commandName === 'inventaire') {
    const inv = db.inventory[userId];
    const items = Object.entries(inv).map(([i, q]) => `• **${i}** x${q}`).join('\n') || '*Vide*';
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎒 Inventaire').setColor(0x8b4513).setDescription(items).setTimestamp()], ephemeral: true });
  }

  if (commandName === 'acheter_stockage') {
    if (db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu as déjà un entrepôt !', ephemeral: true });
    if (db.bank[userId].cash < 5000) return interaction.reply({ content: '❌ Il te faut **5 000 €** en cash !', ephemeral: true });
    db.bank[userId].cash -= 5000; db.storage[userId].unlocked = true; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Entrepôt acheté !').setColor(0x00ff88).addFields({ name: '💸 Coût', value: '5 000 €', inline: true }).setTimestamp()] });
  }

  if (commandName === 'stockage') {
    if (!db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu n\'as pas d\'entrepôt.', ephemeral: true });
    const items = Object.entries(db.storage[userId].items).map(([k,v]) => `• **${k}** x${v}`).join('\n') || '*Vide*';
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Entrepôt').setColor(0x8b4513).setDescription(items).setTimestamp()], ephemeral: true });
  }

  if (commandName === 'deposer_item') {
    const item = interaction.options.getString('item'); const qty = interaction.options.getInteger('quantite');
    if (!db.storage[userId].unlocked) return interaction.reply({ content: '❌ Pas d\'entrepôt !', ephemeral: true });
    if (!db.inventory[userId][item] || db.inventory[userId][item] < qty) return interaction.reply({ content: `❌ Pas assez de **${item}** !`, ephemeral: true });
    db.inventory[userId][item] -= qty;
    if (db.inventory[userId][item] <= 0) delete db.inventory[userId][item];
    db.storage[userId].items[item] = (db.storage[userId].items[item] || 0) + qty; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Item déposé').setColor(0x00ff88).setDescription(`**${item}** x${qty} → Entrepôt`).setTimestamp()] });
  }

  if (commandName === 'retirer_item') {
    const item = interaction.options.getString('item'); const qty = interaction.options.getInteger('quantite');
    if (!db.storage[userId].unlocked) return interaction.reply({ content: '❌ Pas d\'entrepôt !', ephemeral: true });
    if (!db.storage[userId].items[item] || db.storage[userId].items[item] < qty) return interaction.reply({ content: `❌ Pas assez dans l\'entrepôt !`, ephemeral: true });
    db.storage[userId].items[item] -= qty;
    if (db.storage[userId].items[item] <= 0) delete db.storage[userId].items[item];
    db.inventory[userId][item] = (db.inventory[userId][item] || 0) + qty; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Item retiré').setColor(0x00ff88).setDescription(`**${item}** x${qty} → Inventaire`).setTimestamp()] });
  }

  // ── IMMOBILIER ────────────────────────────────────────────────────────────
  if (commandName === 'acheter_maison') {
    const type = interaction.options.getString('type');
    const biens = {
      studio:      { prix: 10000,  label: '🏠 Studio',      adresse: '12 Rue des Pauvres, Astra' },
      appartement: { prix: 35000,  label: '🏡 Appartement', adresse: '47 Avenue du Soleil, Astra' },
      villa:       { prix: 120000, label: '🏰 Villa',        adresse: '8 Allée des Riches, Astra Heights' },
      manoir:      { prix: 500000, label: '🏯 Manoir',       adresse: '1 Boulevard du Pouvoir, Astra Hills' },
    };
    const bien = biens[type];
    if (db.housing[userId].has) return interaction.reply({ content: '❌ Tu possèdes déjà une propriété !', ephemeral: true });
    const total = db.bank[userId].cash + db.bank[userId].bank;
    if (total < bien.prix) return interaction.reply({ content: `❌ Il te faut **${bien.prix.toLocaleString()} €** !`, ephemeral: true });
    if (db.bank[userId].cash >= bien.prix) { db.bank[userId].cash -= bien.prix; }
    else { const reste = bien.prix - db.bank[userId].cash; db.bank[userId].cash = 0; db.bank[userId].bank -= reste; }
    db.housing[userId] = { has: true, address: bien.adresse, type, label: bien.label, prix: bien.prix, level: 1 }; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${bien.label} acheté !`).setColor(0xf5c518)
      .addFields({ name: '📍 Adresse', value: bien.adresse }, { name: '💸 Prix', value: `${bien.prix.toLocaleString()} €`, inline: true }).setTimestamp()] });
  }

  if (commandName === 'maison') {
    const h = db.housing[userId];
    if (!h.has) return interaction.reply({ content: '❌ Tu n\'as pas de propriété.', ephemeral: true });
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${h.label || '🏠'} — Ma Maison`).setColor(0xf5c518)
      .addFields(
        { name: '📍 Adresse', value: h.address },
        { name: '🏠 Type', value: h.label || h.type, inline: true },
        { name: '⭐ Niveau', value: `${h.level}`, inline: true },
        { name: '💰 Valeur', value: `${(h.prix * 0.7).toLocaleString()} €`, inline: true },
      ).setTimestamp()] });
  }

  if (commandName === 'vendre_maison') {
    const h = db.housing[userId];
    if (!h.has) return interaction.reply({ content: '❌ Pas de propriété à vendre !', ephemeral: true });
    const gain = Math.floor(h.prix * 0.7);
    db.bank[userId].cash += gain; db.housing[userId] = { has: false, address: null, level: 1 }; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏚️ Propriété vendue').setColor(0xff6600).setDescription(`Vendue pour **${gain.toLocaleString()} €**`).setTimestamp()] });
  }

  // ── CRIMINEL ──────────────────────────────────────────────────────────────
  if (commandName === 'braquer') {
    const cible = interaction.options.getString('cible');
    const cooldown = 15 * 60 * 1000; const now = Date.now();
    if (!db.players[userId].lastBraquage) db.players[userId].lastBraquage = 0;
    const diff = now - db.players[userId].lastBraquage;
    if (diff < cooldown) return interaction.reply({ content: `⏳ Attends encore **${Math.ceil((cooldown - diff) / 60000)} min** !`, ephemeral: true });
    const butin = { banque: Math.floor(Math.random() * 50000) + 20000, superette: Math.floor(Math.random() * 3000) + 500, pharmacie: Math.floor(Math.random() * 5000) + 1000 };
    db.players[userId].lastBraquage = now;
    if (Math.random() < 0.35) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2); db.wanted[userId].reason = `Tentative de braquage (${cible})`; saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Braquage échoué !').setColor(0xff0000).setDescription(`Tu t'es fait repérer ! 🔴 Wanted niveau **${db.wanted[userId].level}**`).setTimestamp()] });
    }
    const gain = butin[cible];
    db.bank[userId].cash += gain; db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1); db.wanted[userId].reason = `Braquage (${cible})`; saveDB(db);
    const emoji = { banque: '🏦', superette: '🏪', pharmacie: '💊' };
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[cible]} Braquage réussi !`).setColor(0x00ff88)
      .addFields({ name: '💰 Butin', value: `${gain.toLocaleString()} €`, inline: true }, { name: '🔴 Wanted', value: `Niveau ${db.wanted[userId].level}`, inline: true })
      .setFooter({ text: 'Attention aux flics...' }).setTimestamp()] });
  }

  if (commandName === 'fabriquer_drogue') {
    const type = interaction.options.getString('type');
    const cout = { weed: 200, cocaine: 800, pilules: 400 }; const emoji = { weed: '🌿', cocaine: '❄️', pilules: '💊' };
    if (db.bank[userId].cash < cout[type]) return interaction.reply({ content: `❌ Il te faut **${cout[type]} €** !`, ephemeral: true });
    db.bank[userId].cash -= cout[type];
    if (Math.random() < 0.2) { db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1); db.wanted[userId].reason = 'Fabrication de drogue'; saveDB(db); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💥 Fabrication ratée !').setColor(0xff0000).setDescription('+1 Wanted').setTimestamp()] }); }
    const key = `${emoji[type]} ${type}`; db.inventory[userId][key] = (db.inventory[userId][key] || 0) + 5; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[type]} Drogue fabriquée !`).setColor(0x8b008b)
      .addFields({ name: 'Produit', value: key, inline: true }, { name: 'Quantité', value: '5 unités', inline: true }, { name: '💸 Coût', value: `${cout[type]} €`, inline: true }).setTimestamp()] });
  }

  if (commandName === 'dealer') {
    const type = interaction.options.getString('type'); const quantite = interaction.options.getInteger('quantite');
    const emoji = { weed: '🌿', cocaine: '❄️', pilules: '💊' }; const prix = { weed: 150, cocaine: 600, pilules: 300 };
    const key = `${emoji[type]} ${type}`;
    if (!db.inventory[userId][key] || db.inventory[userId][key] < quantite) return interaction.reply({ content: `❌ Pas assez de **${type}** !`, ephemeral: true });
    db.inventory[userId][key] -= quantite;
    if (Math.random() < 0.25) { db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2); db.wanted[userId].reason = 'Deal de drogue'; saveDB(db); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Deal raté !').setColor(0xff0000).setDescription('+2 Wanted').setTimestamp()] }); }
    const gain = prix[type] * quantite; db.bank[userId].cash += gain; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[type]} Deal effectué !`).setColor(0x8b008b)
      .addFields({ name: 'Produit', value: `${key} x${quantite}`, inline: true }, { name: '💰 Gain', value: `${gain.toLocaleString()} €`, inline: true }).setTimestamp()] });
  }

  if (commandName === 'fabriquer_arme') {
    const arme = interaction.options.getString('arme');
    const cout = { pistolet: 1500, uzi: 3000, fusil: 8000, grenade: 2000 }; const emoji = { pistolet: '🔫', uzi: '🔫', fusil: '🪖', grenade: '💣' };
    if (db.bank[userId].cash < cout[arme]) return interaction.reply({ content: `❌ Il te faut **${cout[arme].toLocaleString()} €** !`, ephemeral: true });
    db.bank[userId].cash -= cout[arme];
    if (Math.random() < 0.3) { db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2); db.wanted[userId].reason = 'Fabrication d\'armes'; saveDB(db); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💥 Échoué !').setColor(0xff0000).setDescription('+2 Wanted').setTimestamp()] }); }
    const key = `${emoji[arme]} ${arme}`; db.inventory[userId][key] = (db.inventory[userId][key] || 0) + 1; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[arme]} Arme fabriquée !`).setColor(0x800000)
      .addFields({ name: 'Arme', value: key, inline: true }, { name: '💸 Coût', value: `${cout[arme].toLocaleString()} €`, inline: true }).setTimestamp()] });
  }

  if (commandName === 'vendre_arme') {
    const arme = interaction.options.getString('arme');
    const emoji = { pistolet: '🔫', uzi: '🔫', fusil: '🪖', grenade: '💣' }; const prix = { pistolet: 2500, uzi: 5000, fusil: 12000, grenade: 3500 };
    const key = `${emoji[arme]} ${arme}`;
    if (!db.inventory[userId][key] || db.inventory[userId][key] < 1) return interaction.reply({ content: `❌ Pas de **${arme}** dans l'inventaire !`, ephemeral: true });
    db.inventory[userId][key] -= 1;
    if (Math.random() < 0.2) { db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 3); db.wanted[userId].reason = 'Trafic d\'armes'; saveDB(db); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Intercepté !').setColor(0xff0000).setDescription('+3 Wanted').setTimestamp()] }); }
    db.bank[userId].cash += prix[arme]; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[arme]} Arme vendue !`).setColor(0x800000)
      .addFields({ name: 'Arme', value: key, inline: true }, { name: '💰 Gain', value: `${prix[arme].toLocaleString()} €`, inline: true }).setTimestamp()] });
  }

  if (commandName === 'racketter') {
    const cible = interaction.options.getUser('cible'); const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    if (cible.id === userId) return interaction.reply({ content: '❌ Tu ne peux pas te racketter toi-même !', ephemeral: true });
    if (Math.random() < 0.3) { db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1); db.wanted[userId].reason = 'Tentative de racket'; saveDB(db); return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Racket échoué !').setColor(0xff0000).setDescription('+1 Wanted').setTimestamp()] }); }
    const pris = Math.min(montant, db.bank[cible.id].cash);
    db.bank[cible.id].cash -= pris; db.bank[userId].cash += pris; db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1); db.wanted[userId].reason = 'Racket'; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💰 Racket réussi !').setColor(0xff8c00)
      .addFields({ name: '🎯 Victime', value: `<@${cible.id}>`, inline: true }, { name: '💵 Extorqué', value: `${pris.toLocaleString()} €`, inline: true }, { name: '🔴 Wanted', value: `Niveau ${db.wanted[userId].level}`, inline: true })
      .setTimestamp()] });
  }

  // ── POLICE ────────────────────────────────────────────────────────────────
  if (commandName === 'wanted') {
    const cible = interaction.options.getUser('joueur'); const niveau = interaction.options.getInteger('niveau'); const raison = interaction.options.getString('raison');
    getPlayer(db, cible.id); db.wanted[cible.id] = { level: niveau, reason: raison }; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 AVIS DE RECHERCHE').setColor(0xff0000)
      .setThumbnail(cible.displayAvatarURL())
      .addFields({ name: '🎯 Suspect', value: `<@${cible.id}>`, inline: true }, { name: '⭐ Niveau', value: '⭐'.repeat(niveau), inline: true }, { name: '📋 Raison', value: raison }, { name: '👮 Officier', value: `<@${userId}>`, inline: true })
      .setTimestamp()] });
  }

  if (commandName === 'unwanted') {
    const cible = interaction.options.getUser('joueur'); getPlayer(db, cible.id);
    db.wanted[cible.id] = { level: 0, reason: null }; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Wanted retiré').setColor(0x00ff88).setDescription(`Le wanted de <@${cible.id}> a été retiré.`)] });
  }

  if (commandName === 'fouille') {
    const cible = interaction.options.getUser('joueur'); getPlayer(db, cible.id);
    const items = Object.entries(db.inventory[cible.id]).map(([i,q]) => `• **${i}** x${q}`).join('\n') || '*Rien*';
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔍 Résultat de fouille').setColor(0x1e90ff)
      .setDescription(`Fouille de <@${cible.id}> par <@${userId}>`).addFields({ name: '🎒 Objets', value: items }).setTimestamp()] });
  }

  if (commandName === 'amende') {
    const cible = interaction.options.getUser('joueur'); const montant = interaction.options.getInteger('montant'); const raison = interaction.options.getString('raison');
    getPlayer(db, cible.id);
    if (db.bank[cible.id].cash >= montant) { db.bank[cible.id].cash -= montant; }
    else if (db.bank[cible.id].bank >= montant) { db.bank[cible.id].bank -= montant; }
    else { db.bank[cible.id].cash = 0; db.bank[cible.id].bank = 0; }
    saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💸 Amende émise').setColor(0xff6600)
      .addFields({ name: '🎯 Contrevenant', value: `<@${cible.id}>`, inline: true }, { name: '💵 Montant', value: `${montant.toLocaleString()} €`, inline: true }, { name: '📋 Raison', value: raison }, { name: '👮 Officier', value: `<@${userId}>`, inline: true })
      .setTimestamp()] });
  }

  // ── ADMIN RP ──────────────────────────────────────────────────────────────
  if (commandName === 'addmoney') {
    const cible = interaction.options.getUser('joueur'); const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id); db.bank[cible.id].cash += montant; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Argent ajouté').setColor(0x00ff88).setDescription(`**+${montant.toLocaleString()} €** → <@${cible.id}>`).setTimestamp()] });
  }

  if (commandName === 'removemoney') {
    const cible = interaction.options.getUser('joueur'); const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    if (db.bank[cible.id].cash >= montant) { db.bank[cible.id].cash -= montant; }
    else { const reste = montant - db.bank[cible.id].cash; db.bank[cible.id].cash = 0; db.bank[cible.id].bank = Math.max(0, db.bank[cible.id].bank - reste); }
    saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💸 Argent retiré').setColor(0xff4444).setDescription(`**-${montant.toLocaleString()} €** retiré à <@${cible.id}>`).setTimestamp()] });
  }

  if (commandName === 'setjob') {
    const cible = interaction.options.getUser('joueur'); const job = interaction.options.getString('job');
    getPlayer(db, cible.id); db.players[cible.id].job = job; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Métier mis à jour').setColor(0x00ff88).setDescription(`<@${cible.id}> est maintenant **${job}**`).setTimestamp()] });
  }

  if (commandName === 'giveitem') {
    const cible = interaction.options.getUser('joueur'); const item = interaction.options.getString('item'); const qty = interaction.options.getInteger('quantite');
    getPlayer(db, cible.id); db.inventory[cible.id][item] = (db.inventory[cible.id][item] || 0) + qty; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎁 Item donné').setColor(0x00ff88).setDescription(`**${item}** x${qty} → <@${cible.id}>`).setTimestamp()] });
  }

  if (commandName === 'removeitem') {
    const cible = interaction.options.getUser('joueur'); const item = interaction.options.getString('item'); const qty = interaction.options.getInteger('quantite');
    getPlayer(db, cible.id);
    if (!db.inventory[cible.id][item]) return interaction.reply({ content: `❌ Pas de **${item}** !`, ephemeral: true });
    db.inventory[cible.id][item] = Math.max(0, db.inventory[cible.id][item] - qty);
    if (db.inventory[cible.id][item] === 0) delete db.inventory[cible.id][item]; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🗑️ Item retiré').setColor(0xff4444).setDescription(`**${item}** x${qty} retiré à <@${cible.id}>`).setTimestamp()] });
  }

  if (commandName === 'resetplayer') {
    const cible = interaction.options.getUser('joueur');
    delete db.players[cible.id]; delete db.bank[cible.id]; delete db.inventory[cible.id];
    delete db.storage[cible.id]; delete db.housing[cible.id]; delete db.driving_license[cible.id];
    delete db.wanted[cible.id]; delete db.warns[cible.id]; saveDB(db);
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔄 Joueur réinitialisé').setColor(0xff4444).setDescription(`Le profil de <@${cible.id}> a été réinitialisé.`).setTimestamp()] });
  }

  if (commandName === 'admininfo') {
    const cible = interaction.options.getUser('joueur'); getPlayer(db, cible.id);
    const p = db.players[cible.id]; const b = db.bank[cible.id]; const l = db.driving_license[cible.id];
    const w = db.wanted[cible.id]; const h = db.housing[cible.id]; const s = db.storage[cible.id];
    const inv = Object.entries(db.inventory[cible.id]).map(([k,v]) => `${k} x${v}`).join(', ') || 'Vide';
    const stk = Object.entries(s.items || {}).map(([k,v]) => `${k} x${v}`).join(', ') || 'Vide';
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🔧 Admin Info — ${p.name || cible.username}`).setColor(0xf5c518)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '🪪 Nom RP', value: p.name || 'Non créé', inline: true },
        { name: '💼 Job', value: p.job, inline: true },
        { name: '⭐ Niveau', value: `${p.level}`, inline: true },
        { name: '💵 Cash', value: `${b.cash.toLocaleString()} €`, inline: true },
        { name: '🏦 Banque', value: `${b.bank.toLocaleString()} €`, inline: true },
        { name: '🚗 Permis', value: l.has ? `✅ ${l.points}/12pts` : '❌', inline: true },
        { name: '🏠 Maison', value: h.has ? h.label : '❌', inline: true },
        { name: '📦 Stockage', value: s.unlocked ? '✅' : '❌', inline: true },
        { name: '⚠️ Warns', value: `${(db.warns[cible.id] || []).length}`, inline: true },
        { name: '🔴 Wanted', value: w.level > 0 ? `⭐x${w.level} — ${w.reason}` : 'Aucun', inline: true },
        { name: '🎒 Inventaire', value: inv.length > 200 ? inv.slice(0,200)+'...' : inv },
        { name: '📦 Entrepôt', value: stk.length > 200 ? stk.slice(0,200)+'...' : stk },
      ).setFooter({ text: 'Astra RP • Admin Panel' }).setTimestamp()], ephemeral: true });
  }
});

client.login(TOKEN);

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
    .setTitle('🔒 Accès refusé — Abonnement requis')
    .setColor(0xe8212a)
    .setDescription(`Tu n\'as pas d\'abonnement actif.\nAbonne-toi sur **[notre site](${siteUrl})** pour accéder au bot !`)
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

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('🏙️ Crée tous les salons du serveur Astra RP')
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
    .setDescription('🪪 Voir ou creer ta carte d\'identite')
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
        { name: '🚑 Medecin', value: 'Medecin' },
        { name: '🚕 Chauffeur de taxi', value: 'Chauffeur de taxi' },
        { name: '🍔 Restaurateur', value: 'Restaurateur' },
        { name: '🚗 Mecanicien', value: 'Mecanicien' },
        { name: '💼 Sans emploi', value: 'Sans emploi' },
      )),

  new SlashCommandBuilder()
    .setName('profil')
    .setDescription('👤 Voir ton profil RP')
    .addUserOption(o => o.setName('joueur').setDescription('Voir le profil d\'un autre joueur')),

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

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const db = loadDB();
  const userId = interaction.user.id;
  getPlayer(db, userId);

  const { commandName } = interaction;

  if (!FREE_COMMANDS.includes(commandName)) {
    const sub = await checkSubscription(userId);
    if (!sub.access) {
      return interaction.reply({ embeds: [noSubEmbed()], ephemeral: true });
    }
    if (sub.daysLeft !== undefined && sub.daysLeft <= 3) {
      interaction.channel?.send({ content: `<@${userId}> ⚠️ Ton abonnement expire dans **${sub.daysLeft} jour(s)** ! Renouvelle sur ${SITE_URL}` }).catch(() => {});
    }
  }

  if (commandName === 'setup') {
    await interaction.deferReply();
    const guild = interaction.guild;
    const categories = [
      { name: '🏙️ ─ LOS SANTOS RP', channels: [
        { name: '📋・reglement', type: ChannelType.GuildText },
        { name: '📢・annonces', type: ChannelType.GuildText },
        { name: '✅・verification', type: ChannelType.GuildText },
        { name: '🗺️・presentation', type: ChannelType.GuildText },
      ]},
      { name: '💬 ─ GENERAL', channels: [
        { name: '💬・general', type: ChannelType.GuildText },
        { name: '🖼️・medias', type: ChannelType.GuildText },
        { name: '🎮・hors-rp', type: ChannelType.GuildText },
        { name: '🤝・recrutement', type: ChannelType.GuildText },
        { name: '🎤・vocal-general', type: ChannelType.GuildVoice },
        { name: '🎮・gaming', type: ChannelType.GuildVoice },
      ]},
      { name: '🏦 ─ ECONOMIE & BANQUE', channels: [
        { name: '💳・compte-bancaire', type: ChannelType.GuildText },
        { name: '🏪・marche', type: ChannelType.GuildText },
        { name: '💼・offres-emploi', type: ChannelType.GuildText },
      ]},
      { name: '🚔 ─ LSPD - POLICE', channels: [
        { name: '🚔・quartier-general', type: ChannelType.GuildText },
        { name: '📋・rapports-police', type: ChannelType.GuildText },
        { name: '🔍・avis-recherche', type: ChannelType.GuildText },
        { name: '🎤・briefing-police', type: ChannelType.GuildVoice },
      ]},
      { name: '⚕️ ─ EMS - MEDECINS', channels: [
        { name: '🏥・urgences', type: ChannelType.GuildText },
        { name: '📋・rapports-medicaux', type: ChannelType.GuildText },
        { name: '🎤・ems-vocal', type: ChannelType.GuildVoice },
      ]},
      { name: '🌿 ─ CRIMINEL', channels: [
        { name: '💊・marche-noir', type: ChannelType.GuildText },
        { name: '🔫・armurerie-illegale', type: ChannelType.GuildText },
        { name: '🤝・deals', type: ChannelType.GuildText },
        { name: '🎤・criminel-vocal', type: ChannelType.GuildVoice },
      ]},
      { name: '📋 ─ ADMINISTRATION', channels: [
        { name: '🛠️・staff-general', type: ChannelType.GuildText },
        { name: '📩・demandes', type: ChannelType.GuildText },
        { name: '🔨・sanctions', type: ChannelType.GuildText },
        { name: '🎤・staff-vocal', type: ChannelType.GuildVoice },
      ]},
    ];
    for (const cat of categories) {
      const category = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory });
      for (const ch of cat.channels) {
        await guild.channels.create({ name: ch.name, type: ch.type, parent: category.id });
      }
    }
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('✅ Serveur Astra RP configure !').setDescription('Tous les salons ont ete crees avec succes.').setColor(0x00ff88).setTimestamp()] });
  }

  else if (commandName === 'compte') {
    const bank = db.bank[userId];
    const player = db.players[userId];
    const embed = new EmbedBuilder()
      .setTitle('💳 Compte Bancaire')
      .setColor(0x1e90ff)
      .setDescription(`**${player.name || interaction.user.username}**`)
      .addFields(
        { name: '💵 Argent sur soi', value: `${bank.cash.toLocaleString()} €`, inline: true },
        { name: '🏦 Argent en banque', value: `${bank.bank.toLocaleString()} €`, inline: true },
        { name: '💰 Total', value: `${(bank.cash + bank.bank).toLocaleString()} €`, inline: true },
      )
      .setFooter({ text: 'Banque d\'Astra' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
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
    const embed = new EmbedBuilder()
      .setTitle('🪪 Carte d\'Identite — Los Santos')
      .setColor(0xffd700)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '👤 Nom complet', value: p.name || '*Non defini* (use /setnom)', inline: true },
        { name: '💼 Metier', value: p.job, inline: true },
        { name: '⭐ Niveau', value: `${p.level}`, inline: true },
        { name: '🚗 Permis', value: l.has ? `✅ Valide — **${l.points}/12 pts**` : '❌ Pas de permis', inline: true },
        { name: '🔴 Wanted', value: w.level > 0 ? `${'⭐'.repeat(w.level)} (${w.reason})` : '✅ Aucun', inline: true },
      )
      .setFooter({ text: 'Astra RP Police • ID verifiee' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'permis') {
    const cible = interaction.options.getUser('joueur') || interaction.user;
    getPlayer(db, cible.id);
    const l = db.driving_license[cible.id];
    const p = db.players[cible.id];
    const pointsBar = '🟩'.repeat(l.points) + '⬛'.repeat(12 - l.points);
    const embed = new EmbedBuilder()
      .setTitle('🚗 Permis de Conduire')
      .setColor(l.has ? 0x00ff88 : 0xff4444)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '👤 Titulaire', value: p.name || cible.username, inline: true },
        { name: '📋 Statut', value: l.has ? '✅ Valide' : '❌ Non obtenu', inline: true },
        { name: '⭐ Points', value: `${l.points}/12\n${pointsBar}`, inline: false },
      )
      .setFooter({ text: 'Astra RP • Controle de permis' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'donner_permis') {
    const cible = interaction.options.getUser('joueur');
    getPlayer(db, cible.id);
    db.driving_license[cible.id].has = true;
    db.driving_license[cible.id].points = 12;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚗 Permis delivre').setColor(0x00ff88).setDescription(`<@${cible.id}> a obtenu son permis de conduire !`)] });
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
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚔 Retrait de points de permis').setColor(0xff6600).addFields(
      { name: '👮 Officier', value: `<@${userId}>`, inline: true },
      { name: '🎯 Conducteur', value: `<@${cible.id}>`, inline: true },
      { name: '➖ Points retires', value: `${points} pts`, inline: true },
      { name: '📋 Raison', value: raison },
      { name: '📊 Points restants', value: `${db.driving_license[cible.id].points}/12`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'inventaire') {
    const inv = db.inventory[userId];
    const items = Object.entries(inv).map(([item, qty]) => `• **${item}** x${qty}`).join('\n') || '*Inventaire vide*';
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎒 Inventaire').setColor(0x8b4513).setDescription(items).setFooter({ text: 'Astra RP • Inventaire' }).setTimestamp()], ephemeral: true });
  }

  else if (commandName === 'braquer') {
    const cible = interaction.options.getString('cible');
    const cooldown = 15 * 60 * 1000;
    const now = Date.now();
    if (!db.players[userId].lastBraquage) db.players[userId].lastBraquage = 0;
    const diff = now - db.players[userId].lastBraquage;
    if (diff < cooldown) {
      const reste = Math.ceil((cooldown - diff) / 60000);
      return interaction.reply({ content: `⏳ Tu dois attendre encore **${reste} minutes** avant de braquer a nouveau !`, ephemeral: true });
    }
    const butin = { banque: Math.floor(Math.random() * 50000) + 20000, superette: Math.floor(Math.random() * 3000) + 500, pharmacie: Math.floor(Math.random() * 5000) + 1000 };
    const risk = Math.random();
    db.players[userId].lastBraquage = now;
    if (risk < 0.35) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2);
      db.wanted[userId].reason = `Tentative de braquage (${cible})`;
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Braquage echoue !').setColor(0xff0000).setDescription(`Tu t\'es fait reperer ! La police est en route...\n🔴 Wanted niveau **${db.wanted[userId].level}** ajoute !`).setTimestamp()] });
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
    ).setFooter({ text: 'Attention aux flics...' }).setTimestamp()] });
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
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Wanted retire').setColor(0x00ff88).setDescription(`Le wanted de <@${cible.id}> a ete retire.`)] });
  }

  else if (commandName === 'fouille') {
    const cible = interaction.options.getUser('joueur');
    getPlayer(db, cible.id);
    const inv = db.inventory[cible.id];
    const items = Object.entries(inv).map(([item, qty]) => `• **${item}** x${qty}`).join('\n') || '*Rien de suspect*';
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔍 Resultat de fouille').setColor(0x1e90ff).setDescription(`Fouille de <@${cible.id}> par <@${userId}>`).addFields({ name: '🎒 Objets trouves', value: items }).setTimestamp()] });
  }

  else if (commandName === 'amende') {
    const cible = interaction.options.getUser('joueur');
    const montant = interaction.options.getInteger('montant');
    const raison = interaction.options.getString('raison');
    getPlayer(db, cible.id);
    if (db.bank[cible.id].cash >= montant) { db.bank[cible.id].cash -= montant; }
    else if (db.bank[cible.id].bank >= montant) { db.bank[cible.id].bank -= montant; }
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
    if (db.bank[userId].cash < cout[type]) return interaction.reply({ content: `❌ Il te faut **${cout[type]} €** pour fabriquer cette drogue !`, ephemeral: true });
    db.bank[userId].cash -= cout[type];
    if (Math.random() < 0.2) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1);
      db.wanted[userId].reason = 'Fabrication de drogue';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💥 Fabrication ratee !').setColor(0xff0000).setDescription('L\'explosion a alerte la police ! +1 Wanted').setTimestamp()] });
    }
    if (!db.inventory[userId][`${emoji[type]} ${type}`]) db.inventory[userId][`${emoji[type]} ${type}`] = 0;
    db.inventory[userId][`${emoji[type]} ${type}`] += 5;
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
    if (!db.inventory[userId][key] || db.inventory[userId][key] < quantite) return interaction.reply({ content: `❌ Tu n\'as pas assez de **${type}** dans ton inventaire !`, ephemeral: true });
    db.inventory[userId][key] -= quantite;
    if (Math.random() < 0.25) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2);
      db.wanted[userId].reason = 'Deal de drogue';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Deal rate !').setColor(0xff0000).setDescription('La police t\'a repere ! +2 Wanted. Tu as perdu ta marchandise.').setTimestamp()] });
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
    if (db.bank[userId].cash < cout[arme]) return interaction.reply({ content: `❌ Il te faut **${cout[arme]} €** pour fabriquer cette arme !`, ephemeral: true });
    db.bank[userId].cash -= cout[arme];
    if (Math.random() < 0.3) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2);
      db.wanted[userId].reason = 'Fabrication d\'armes illegales';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💥 Fabrication echouee !').setColor(0xff0000).setDescription('La police a ete alertee ! +2 Wanted. Materiaux perdus.').setTimestamp()] });
    }
    const key = `${emoji[arme]} ${arme}`;
    if (!db.inventory[userId][key]) db.inventory[userId][key] = 0;
    db.inventory[userId][key] += 1;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[arme]} Arme fabriquee !`).setColor(0x800000).addFields(
      { name: 'Arme', value: `${emoji[arme]} ${arme}`, inline: true },
      { name: '💸 Cout', value: `${cout[arme].toLocaleString()} €`, inline: true },
    ).setFooter({ text: '⚠️ Port d\'arme illegal — Risque d\'arrestation' }).setTimestamp()] });
  }

  else if (commandName === 'vendre_arme') {
    const arme = interaction.options.getString('arme');
    const emoji = { pistolet: '🔫', uzi: '🔫', fusil: '🪖', grenade: '💣' };
    const prix = { pistolet: 2500, uzi: 5000, fusil: 12000, grenade: 3500 };
    const key = `${emoji[arme]} ${arme}`;
    if (!db.inventory[userId][key] || db.inventory[userId][key] < 1) return interaction.reply({ content: `❌ Tu n\'as pas de **${arme}** dans ton inventaire !`, ephemeral: true });
    db.inventory[userId][key] -= 1;
    if (Math.random() < 0.2) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 3);
      db.wanted[userId].reason = 'Trafic d\'armes';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Transaction interceptee !').setColor(0xff0000).setDescription('Les flics ont intercepte la vente ! +3 Wanted.').setTimestamp()] });
    }
    db.bank[userId].cash += prix[arme];
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${emoji[arme]} Arme vendue au marche noir !`).setColor(0x800000).addFields(
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
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Racket echoue !').setColor(0xff0000).setDescription(`<@${cible.id}> t\'a resiste et a appele la police ! +1 Wanted`).setTimestamp()] });
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
    db.players[userId].prenom = prenom;
    db.players[userId].nom = nom;
    db.players[userId].name = `${prenom} ${nom}`;
    db.players[userId].age = age;
    db.players[userId].job = job;
    db.players[userId].created = true;
    db.players[userId].level = 1;
    db.players[userId].xp = 0;
    db.bank[userId].cash = 2000;
    db.bank[userId].bank = 5000;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎭 Personnage cree — Astra RP').setColor(0xf5c518).setThumbnail(interaction.user.displayAvatarURL()).setDescription(`Bienvenue a **Astra RP**, **${prenom} ${nom}** !`).addFields(
      { name: '👤 Identite', value: `${prenom} ${nom}`, inline: true },
      { name: '🎂 Age', value: `${age} ans`, inline: true },
      { name: '💼 Metier', value: job, inline: true },
      { name: '💵 Cash de depart', value: '2 000 €', inline: true },
      { name: '🏦 Banque de depart', value: '5 000 €', inline: true },
      { name: '⭐ Niveau', value: '1', inline: true },
    ).setFooter({ text: 'Astra RP • Bonne chance dans ta nouvelle vie !' }).setTimestamp()] });
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
    if (!p.created) return interaction.reply({ content: `❌ <@${cible.id}> n\'a pas encore cree son personnage ! Utilise \`/creer_personnage\``, ephemeral: true });
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 Profil — ${p.name}`).setColor(0x1e90ff).setThumbnail(cible.displayAvatarURL()).addFields(
      { name: '🪪 Identite', value: `${p.prenom} ${p.nom}`, inline: true },
      { name: '🎂 Age', value: `${p.age} ans`, inline: true },
      { name: '💼 Metier', value: p.job, inline: true },
      { name: '⭐ Niveau', value: `${p.level}`, inline: true },
      { name: '💰 Fortune', value: `Cash: **${b.cash.toLocaleString()} €**\nBanque: **${b.bank.toLocaleString()} €**`, inline: true },
      { name: '🚗 Permis', value: l.has ? `✅ ${l.points}/12 pts` : '❌ Aucun', inline: true },
      { name: '🏠 Logement', value: h.has ? `✅ ${h.address}` : '❌ Sans domicile', inline: true },
      { name: '📦 Stockage', value: s.unlocked ? '✅ Debloque' : '❌ Verrouille', inline: true },
      { name: '🔴 Wanted', value: w.level > 0 ? `${'⭐'.repeat(w.level)} — ${w.reason}` : '✅ Aucun', inline: true },
    ).setFooter({ text: 'Astra RP • Profil joueur' }).setTimestamp()] });
  }

  else if (commandName === 'acheter_stockage') {
    const cout = 5000;
    if (db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu as deja un entrepot !', ephemeral: true });
    if (db.bank[userId].cash < cout) return interaction.reply({ content: `❌ Il te faut **${cout.toLocaleString()} €** en cash !`, ephemeral: true });
    db.bank[userId].cash -= cout;
    db.storage[userId].unlocked = true;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Entrepot achete !').setColor(0x00ff88).setDescription('Tu es maintenant proprietaire d\'un entrepot.').addFields({ name: '💸 Cout', value: `${cout.toLocaleString()} €`, inline: true }).setTimestamp()] });
  }

  else if (commandName === 'stockage') {
    if (!db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu n\'as pas d\'entrepot. Achete-en un avec `/acheter_stockage` !', ephemeral: true });
    const items = Object.entries(db.storage[userId].items).map(([k, v]) => `• **${k}** x${v}`).join('\n') || '*Entrepot vide*';
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Entrepot — Stockage').setColor(0x8b4513).setDescription(items).setTimestamp()], ephemeral: true });
  }

  else if (commandName === 'deposer_item') {
    const item = interaction.options.getString('item');
    const qty = interaction.options.getInteger('quantite');
    if (!db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu n\'as pas d\'entrepot !', ephemeral: true });
    if (!db.inventory[userId][item] || db.inventory[userId][item] < qty) return interaction.reply({ content: `❌ Tu n\'as pas assez de **${item}** !`, ephemeral: true });
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
    if (!db.storage[userId].items[item] || db.storage[userId].items[item] < qty) return interaction.reply({ content: `❌ Tu n\'as pas assez de **${item}** dans ton entrepot !`, ephemeral: true });
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
      { name: '💸 Prix paye', value: `${bien.prix.toLocaleString()} €`, inline: true },
      { name: '🏠 Type', value: bien.label, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'maison') {
    const h = db.housing[userId];
    if (!h.has) return interaction.reply({ content: '❌ Tu n\'as pas de propriete. Utilise `/acheter_maison` !', ephemeral: true });
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${h.label || '🏠 Propriete'} — Ma Maison`).setColor(0xf5c518).addFields(
      { name: '📍 Adresse', value: h.address },
      { name: '🏠 Type', value: h.label || h.type, inline: true },
      { name: '⭐ Niveau', value: `${h.level}`, inline: true },
      { name: '💰 Valeur estimee', value: `${(h.prix * 0.7).toLocaleString()} €`, inline: true },
    ).setTimestamp()] });
  }

  else if (commandName === 'vendre_maison') {
    const h = db.housing[userId];
    if (!h.has) return interaction.reply({ content: '❌ Tu n\'as pas de propriete a vendre !', ephemeral: true });
    const gain = Math.floor(h.prix * 0.7);
    db.bank[userId].cash += gain;
    db.housing[userId] = { has: false, address: null, level: 1 };
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏚️ Propriete vendue').setColor(0xff6600).setDescription(`Ta propriete a ete vendue pour **${gain.toLocaleString()} €** (70% de la valeur).`).setTimestamp()] });
  }

  else if (commandName === 'addmoney') {
    const cible = interaction.options.getUser('joueur');
    const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    db.bank[cible.id].cash += montant;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Argent ajoute').setColor(0x00ff88).setDescription(`**${montant.toLocaleString()} €** ajoutes a <@${cible.id}>`).setTimestamp()] });
  }

  else if (commandName === 'removemoney') {
    const cible = interaction.options.getUser('joueur');
    const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    if (db.bank[cible.id].cash >= montant) { db.bank[cible.id].cash -= montant; }
    else { const reste = montant - db.bank[cible.id].cash; db.bank[cible.id].cash = 0; db.bank[cible.id].bank = Math.max(0, db.bank[cible.id].bank - reste); }
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('💸 Argent retire').setColor(0xff4444).setDescription(`**-${montant.toLocaleString()} €** retire a <@${cible.id}>`).setTimestamp()] });
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
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔄 Joueur reinitialise').setColor(0xff4444).setDescription(`Le profil de <@${cible.id}> a ete entierement reinitialise.`).setTimestamp()] });
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
    ).setFooter({ text: 'Astra RP • Admin Panel' }).setTimestamp()], ephemeral: true });
  }
});

client.login(TOKEN);

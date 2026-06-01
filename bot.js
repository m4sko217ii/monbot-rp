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

// ─── VÉRIFICATION ABONNEMENT ─────────────────────────────────────────────────
// Commandes qui NE nécessitent PAS d'abonnement
const FREE_COMMANDS = ['setup'];

async function checkSubscription(guildId) {
  try {
    const res = await axios.get(`${SITE_URL}/api/check-guild/${guildId}`, { timeout: 5000 });
    return res.data;
  } catch {
    // Si le site est injoignable, on laisse passer pour pas bloquer le bot
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
  // Compat: ajouter les champs manquants aux anciens profils
  if (!db.storage[userId]) db.storage[userId] = { unlocked: false, items: {} };
  if (!db.housing[userId]) db.housing[userId] = { has: false, address: null, level: 1 };
  if (db.players[userId].created === undefined) db.players[userId].created = false;
  return db;
}

// ─── COMMANDES SLASH ──────────────────────────────────────────────────────────
const commands = [
  // SETUP
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('🏙️ Crée tous les salons du serveur Astra RP')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  // COMPTE BANCAIRE
  new SlashCommandBuilder()
    .setName('compte')
    .setDescription('💳 Voir ton compte bancaire'),

  new SlashCommandBuilder()
    .setName('virement')
    .setDescription('💸 Effectuer un virement')
    .addUserOption(o => o.setName('cible').setDescription('Joueur à payer').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant en €').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('depot')
    .setDescription('🏦 Déposer de l\'argent à la banque')
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('retrait')
    .setDescription('💵 Retirer de l\'argent de la banque')
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),

  // CARTE D'IDENTITÉ
  new SlashCommandBuilder()
    .setName('carte_identite')
    .setDescription('🪪 Voir ou créer ta carte d\'identité')
    .addUserOption(o => o.setName('joueur').setDescription('Voir la carte d\'un autre joueur')),

  new SlashCommandBuilder()
    .setName('setnom')
    .setDescription('✏️ Définir ton nom RP')
    .addStringOption(o => o.setName('prenom').setDescription('Prénom').setRequired(true))
    .addStringOption(o => o.setName('nom').setDescription('Nom de famille').setRequired(true)),

  // PERMIS DE CONDUIRE
  new SlashCommandBuilder()
    .setName('permis')
    .setDescription('🚗 Voir ton permis de conduire')
    .addUserOption(o => o.setName('joueur').setDescription('Voir le permis d\'un joueur')),

  new SlashCommandBuilder()
    .setName('retirer_points')
    .setDescription('[POLICE] Retirer des points de permis')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('points').setDescription('Points à retirer').setRequired(true).setMinValue(1).setMaxValue(12))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),

  new SlashCommandBuilder()
    .setName('donner_permis')
    .setDescription('[ADMIN] Donner le permis à un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  // INVENTAIRE
  new SlashCommandBuilder()
    .setName('inventaire')
    .setDescription('🎒 Voir ton inventaire'),

  // BRAQUAGE
  new SlashCommandBuilder()
    .setName('braquer')
    .setDescription('🔫 Braquer une banque ou un magasin')
    .addStringOption(o => o.setName('cible').setDescription('Cible').setRequired(true)
      .addChoices(
        { name: "🏦 Banque d'Astra", value: 'banque' },
        { name: '🏪 Supérette', value: 'superette' },
        { name: '💊 Pharmacie', value: 'pharmacie' },
      )),

  // POLICE
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
    .addUserOption(o => o.setName('joueur').setDescription('Joueur à fouiller').setRequired(true)),

  new SlashCommandBuilder()
    .setName('amende')
    .setDescription('[POLICE] Donner une amende')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant de l\'amende').setRequired(true).setMinValue(100))
    .addStringOption(o => o.setName('raison').setDescription('Raison').setRequired(true)),

  // DROGUE
  new SlashCommandBuilder()
    .setName('dealer')
    .setDescription('💊 Vendre de la drogue')
    .addStringOption(o => o.setName('type').setDescription('Type de drogue').setRequired(true)
      .addChoices(
        { name: '🌿 Weed', value: 'weed' },
        { name: '❄️ Cocaïne', value: 'cocaine' },
        { name: '💊 Pilules', value: 'pilules' },
      ))
    .addIntegerOption(o => o.setName('quantite').setDescription('Quantité').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('fabriquer_drogue')
    .setDescription('🧪 Fabriquer de la drogue')
    .addStringOption(o => o.setName('type').setDescription('Type').setRequired(true)
      .addChoices(
        { name: '🌿 Weed', value: 'weed' },
        { name: '❄️ Cocaïne', value: 'cocaine' },
        { name: '💊 Pilules', value: 'pilules' },
      )),

  // FABRICATION D'ARMES
  new SlashCommandBuilder()
    .setName('fabriquer_arme')
    .setDescription('🔧 Fabriquer une arme illégalement')
    .addStringOption(o => o.setName('arme').setDescription('Type d\'arme').setRequired(true)
      .addChoices(
        { name: '🔫 Pistolet', value: 'pistolet' },
        { name: '🔫 Uzi', value: 'uzi' },
        { name: '🪖 Fusil d\'assaut', value: 'fusil' },
        { name: '💣 Grenade', value: 'grenade' },
      )),

  new SlashCommandBuilder()
    .setName('vendre_arme')
    .setDescription('🔫 Vendre une arme au marché noir')
    .addStringOption(o => o.setName('arme').setDescription('Arme à vendre').setRequired(true)
      .addChoices(
        { name: '🔫 Pistolet', value: 'pistolet' },
        { name: '🔫 Uzi', value: 'uzi' },
        { name: '🪖 Fusil d\'assaut', value: 'fusil' },
        { name: '💣 Grenade', value: 'grenade' },
      )),

  // RACKET
  new SlashCommandBuilder()
    .setName('racketter')
    .setDescription('💰 Racketter un joueur')
    .addUserOption(o => o.setName('cible').setDescription('Victime').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant demandé').setRequired(true).setMinValue(100)),

  // ADMIN
  new SlashCommandBuilder()
    .setName('addmoney')
    .setDescription('[ADMIN] Ajouter de l\'argent')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('setjob')
    .setDescription('[ADMIN] Définir le métier d\'un joueur')
    .addUserOption(o => o.setName('joueur').setDescription('Joueur').setRequired(true))
    .addStringOption(o => o.setName('job').setDescription('Métier').setRequired(true))
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

// ─── GESTION DES INTERACTIONS ─────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const db = loadDB();
  const userId = interaction.user.id;
  getPlayer(db, userId);

  const { commandName } = interaction;

  // ── VÉRIFICATION ABONNEMENT ──
  if (!FREE_COMMANDS.includes(commandName)) {
    const sub = await checkSubscription(userId);
    if (!sub.access) {
      return interaction.reply({ embeds: [noSubEmbed()], ephemeral: true });
    }
    if (sub.daysLeft !== undefined && sub.daysLeft <= 3) {
      interaction.channel?.send({ content: `<@${userId}> ⚠️ Ton abonnement expire dans **${sub.daysLeft} jour(s)** ! Renouvelle sur ${SITE_URL}` }).catch(() => {});
    }
  }

  // ══════════════════════════════════════════
  //  SETUP
  // ══════════════════════════════════════════
  if (commandName === 'setup') {
    await interaction.deferReply();
    const guild = interaction.guild;

    const categories = [
      {
        name: '🏙️ ─ LOS SANTOS RP',
        channels: [
          { name: '📋・règlement', type: ChannelType.GuildText },
          { name: '📢・annonces', type: ChannelType.GuildText },
          { name: '✅・vérification', type: ChannelType.GuildText },
          { name: '🗺️・présentation', type: ChannelType.GuildText },
        ]
      },
      {
        name: '💬 ─ GÉNÉRAL',
        channels: [
          { name: '💬・général', type: ChannelType.GuildText },
          { name: '🖼️・médias', type: ChannelType.GuildText },
          { name: '🎮・hors-rp', type: ChannelType.GuildText },
          { name: '🤝・recrutement', type: ChannelType.GuildText },
          { name: '🎤・vocal-général', type: ChannelType.GuildVoice },
          { name: '🎮・gaming', type: ChannelType.GuildVoice },
        ]
      },
      {
        name: '🏦 ─ ÉCONOMIE & BANQUE',
        channels: [
          { name: '💳・compte-bancaire', type: ChannelType.GuildText },
          { name: '🏪・marché', type: ChannelType.GuildText },
          { name: '💼・offres-emploi', type: ChannelType.GuildText },
        ]
      },
      {
        name: '🚔 ─ LSPD - POLICE',
        channels: [
          { name: '🚔・quartier-général', type: ChannelType.GuildText },
          { name: '📋・rapports-police', type: ChannelType.GuildText },
          { name: '🔍・avis-recherche', type: ChannelType.GuildText },
          { name: '🎤・briefing-police', type: ChannelType.GuildVoice },
        ]
      },
      {
        name: '⚕️ ─ EMS - MÉDECINS',
        channels: [
          { name: '🏥・urgences', type: ChannelType.GuildText },
          { name: '📋・rapports-médicaux', type: ChannelType.GuildText },
          { name: '🎤・ems-vocal', type: ChannelType.GuildVoice },
        ]
      },
      {
        name: '🌿 ─ CRIMINEL',
        channels: [
          { name: '💊・marché-noir', type: ChannelType.GuildText },
          { name: '🔫・armurerie-illégale', type: ChannelType.GuildText },
          { name: '🤝・deals', type: ChannelType.GuildText },
          { name: '🎤・criminel-vocal', type: ChannelType.GuildVoice },
        ]
      },
      {
        name: '📋 ─ ADMINISTRATION',
        channels: [
          { name: '🛠️・staff-général', type: ChannelType.GuildText },
          { name: '📩・demandes', type: ChannelType.GuildText },
          { name: '🔨・sanctions', type: ChannelType.GuildText },
          { name: '🎤・staff-vocal', type: ChannelType.GuildVoice },
        ]
      },
    ];

    for (const cat of categories) {
      const category = await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory });
      for (const ch of cat.channels) {
        await guild.channels.create({ name: ch.name, type: ch.type, parent: category.id });
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Serveur Astra RP configuré !')
      .setDescription('Tous les salons ont été créés avec succès.\nBienvenue sur **Astra RP** 🌌')
      .setColor(0x00ff88)
      .setThumbnail('https://cdn.discordapp.com/emojis/gtav.png')
      .setFooter({ text: 'Astra RP • Setup complet' });

    await interaction.editReply({ embeds: [embed] });
  }

  // ══════════════════════════════════════════
  //  COMPTE BANCAIRE
  // ══════════════════════════════════════════
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
      .setFooter({ text: "Banque d'Astra" })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  else if (commandName === 'virement') {
    const cible = interaction.options.getUser('cible');
    const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    if (db.bank[userId].cash < montant) {
      return interaction.reply({ content: '❌ Tu n\'as pas assez d\'argent sur toi !', ephemeral: true });
    }
    db.bank[userId].cash -= montant;
    db.bank[cible.id].cash += montant;
    saveDB(db);
    const embed = new EmbedBuilder()
      .setTitle('💸 Virement effectué')
      .setColor(0x00ff88)
      .addFields(
        { name: 'De', value: `<@${userId}>`, inline: true },
        { name: 'Vers', value: `<@${cible.id}>`, inline: true },
        { name: 'Montant', value: `${montant.toLocaleString()} €`, inline: true },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'depot') {
    const montant = interaction.options.getInteger('montant');
    if (db.bank[userId].cash < montant) return interaction.reply({ content: '❌ Pas assez d\'argent sur toi !', ephemeral: true });
    db.bank[userId].cash -= montant;
    db.bank[userId].bank += montant;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏦 Dépôt effectué').setColor(0x00ff88).setDescription(`**+${montant} €** déposés en banque.`).setTimestamp()] });
  }

  else if (commandName === 'retrait') {
    const montant = interaction.options.getInteger('montant');
    if (db.bank[userId].bank < montant) return interaction.reply({ content: '❌ Pas assez d\'argent en banque !', ephemeral: true });
    db.bank[userId].bank -= montant;
    db.bank[userId].cash += montant;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('💵 Retrait effectué').setColor(0x00ff88).setDescription(`**${montant} €** retirés de la banque.`).setTimestamp()] });
  }

  // ══════════════════════════════════════════
  //  CARTE D'IDENTITÉ
  // ══════════════════════════════════════════
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
      .setTitle('🪪 Carte d\'Identité — Los Santos')
      .setColor(0xffd700)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '👤 Nom complet', value: p.name || '*Non défini* (use /setnom)', inline: true },
        { name: '💼 Métier', value: p.job, inline: true },
        { name: '⭐ Niveau', value: `${p.level}`, inline: true },
        { name: '🚗 Permis', value: l.has ? `✅ Valide — **${l.points}/12 pts**` : '❌ Pas de permis', inline: true },
        { name: '🔴 Wanted', value: w.level > 0 ? `⭐`.repeat(w.level) + ` (${w.reason})` : '✅ Aucun', inline: true },
      )
      .setFooter({ text: 'Astra RP Police • ID vérifiée' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  // ══════════════════════════════════════════
  //  PERMIS DE CONDUIRE
  // ══════════════════════════════════════════
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
      .setFooter({ text: 'Astra RP • Contrôle de permis' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'donner_permis') {
    const cible = interaction.options.getUser('joueur');
    getPlayer(db, cible.id);
    db.driving_license[cible.id].has = true;
    db.driving_license[cible.id].points = 12;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚗 Permis délivré').setColor(0x00ff88).setDescription(`<@${cible.id}> a obtenu son permis de conduire !`)] });
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
    const embed = new EmbedBuilder()
      .setTitle('🚔 Retrait de points de permis')
      .setColor(0xff6600)
      .addFields(
        { name: '👮 Officier', value: `<@${userId}>`, inline: true },
        { name: '🎯 Conducteur', value: `<@${cible.id}>`, inline: true },
        { name: '➖ Points retirés', value: `${points} pts`, inline: true },
        { name: '📋 Raison', value: raison },
        { name: '📊 Points restants', value: `${db.driving_license[cible.id].points}/12`, inline: true },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  // ══════════════════════════════════════════
  //  INVENTAIRE
  // ══════════════════════════════════════════
  else if (commandName === 'inventaire') {
    const inv = db.inventory[userId];
    const items = Object.entries(inv).map(([item, qty]) => `• **${item}** x${qty}`).join('\n') || '*Inventaire vide*';
    const embed = new EmbedBuilder()
      .setTitle('🎒 Inventaire')
      .setColor(0x8b4513)
      .setDescription(items)
      .setFooter({ text: 'Astra RP • Inventaire' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ══════════════════════════════════════════
  //  BRAQUAGE
  // ══════════════════════════════════════════
  else if (commandName === 'braquer') {
    const cible = interaction.options.getString('cible');
    const cooldown = 15 * 60 * 1000; // 15 min
    const now = Date.now();
    if (!db.players[userId].lastBraquage) db.players[userId].lastBraquage = 0;
    const diff = now - db.players[userId].lastBraquage;
    if (diff < cooldown) {
      const reste = Math.ceil((cooldown - diff) / 60000);
      return interaction.reply({ content: `⏳ Tu dois attendre encore **${reste} minutes** avant de braquer à nouveau !`, ephemeral: true });
    }

    const butin = {
      banque: Math.floor(Math.random() * 50000) + 20000,
      superette: Math.floor(Math.random() * 3000) + 500,
      pharmacie: Math.floor(Math.random() * 5000) + 1000,
    };
    const risk = Math.random();
    db.players[userId].lastBraquage = now;

    if (risk < 0.35) {
      // ÉCHEC
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2);
      db.wanted[userId].reason = `Tentative de braquage (${cible})`;
      saveDB(db);
      const embed = new EmbedBuilder()
        .setTitle('🚨 Braquage échoué !')
        .setColor(0xff0000)
        .setDescription(`Tu t'es fait repérer ! La police est en route...\n🔴 Wanted niveau **${db.wanted[userId].level}** ajouté !`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }

    const gain = butin[cible];
    db.bank[userId].cash += gain;
    db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1);
    db.wanted[userId].reason = `Braquage (${cible})`;
    saveDB(db);
    const emoji = { banque: '🏦', superette: '🏪', pharmacie: '💊' };
    const embed = new EmbedBuilder()
      .setTitle(`${emoji[cible]} Braquage réussi !`)
      .setColor(0x00ff88)
      .addFields(
        { name: '💰 Butin', value: `${gain.toLocaleString()} €`, inline: true },
        { name: '🔴 Wanted', value: `Niveau ${db.wanted[userId].level}`, inline: true },
      )
      .setFooter({ text: 'Attention aux flics...' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  // ══════════════════════════════════════════
  //  POLICE
  // ══════════════════════════════════════════
  else if (commandName === 'wanted') {
    const cible = interaction.options.getUser('joueur');
    const niveau = interaction.options.getInteger('niveau');
    const raison = interaction.options.getString('raison');
    getPlayer(db, cible.id);
    db.wanted[cible.id] = { level: niveau, reason: raison };
    saveDB(db);
    const stars = '⭐'.repeat(niveau);
    const embed = new EmbedBuilder()
      .setTitle('🚨 AVIS DE RECHERCHE')
      .setColor(0xff0000)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '🎯 Suspect', value: `<@${cible.id}>`, inline: true },
        { name: '⭐ Niveau', value: stars, inline: true },
        { name: '📋 Raison', value: raison },
        { name: '👮 Officier', value: `<@${userId}>`, inline: true },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'unwanted') {
    const cible = interaction.options.getUser('joueur');
    getPlayer(db, cible.id);
    db.wanted[cible.id] = { level: 0, reason: null };
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Wanted retiré').setColor(0x00ff88).setDescription(`Le wanted de <@${cible.id}> a été retiré.`)] });
  }

  else if (commandName === 'fouille') {
    const cible = interaction.options.getUser('joueur');
    getPlayer(db, cible.id);
    const inv = db.inventory[cible.id];
    const items = Object.entries(inv).map(([item, qty]) => `• **${item}** x${qty}`).join('\n') || '*Rien de suspect*';
    const embed = new EmbedBuilder()
      .setTitle('🔍 Résultat de fouille')
      .setColor(0x1e90ff)
      .setDescription(`Fouille de <@${cible.id}> par <@${userId}>`)
      .addFields({ name: '🎒 Objets trouvés', value: items })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'amende') {
    const cible = interaction.options.getUser('joueur');
    const montant = interaction.options.getInteger('montant');
    const raison = interaction.options.getString('raison');
    getPlayer(db, cible.id);
    if (db.bank[cible.id].cash >= montant) {
      db.bank[cible.id].cash -= montant;
    } else if (db.bank[cible.id].bank >= montant) {
      db.bank[cible.id].bank -= montant;
    } else {
      db.bank[cible.id].cash = 0;
      db.bank[cible.id].bank = 0;
    }
    saveDB(db);
    const embed = new EmbedBuilder()
      .setTitle('💸 Amende émise')
      .setColor(0xff6600)
      .addFields(
        { name: '🎯 Contrevenant', value: `<@${cible.id}>`, inline: true },
        { name: '💵 Montant', value: `${montant.toLocaleString()} €`, inline: true },
        { name: '📋 Raison', value: raison },
        { name: '👮 Officier', value: `<@${userId}>`, inline: true },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  // ══════════════════════════════════════════
  //  DROGUE
  // ══════════════════════════════════════════
  else if (commandName === 'fabriquer_drogue') {
    const type = interaction.options.getString('type');
    const cout = { weed: 200, cocaine: 800, pilules: 400 };
    const emoji = { weed: '🌿', cocaine: '❄️', pilules: '💊' };
    const chance = Math.random();
    if (db.bank[userId].cash < cout[type]) return interaction.reply({ content: `❌ Il te faut **${cout[type]} €** pour fabriquer cette drogue !`, ephemeral: true });
    db.bank[userId].cash -= cout[type];
    if (chance < 0.2) {
      saveDB(db);
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1);
      db.wanted[userId].reason = 'Fabrication de drogue';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💥 Fabrication ratée !').setColor(0xff0000).setDescription('L\'explosion a alerté la police ! +1 Wanted').setTimestamp()] });
    }
    if (!db.inventory[userId][`${emoji[type]} ${type}`]) db.inventory[userId][`${emoji[type]} ${type}`] = 0;
    db.inventory[userId][`${emoji[type]} ${type}`] += 5;
    saveDB(db);
    const embed = new EmbedBuilder()
      .setTitle(`${emoji[type]} Drogue fabriquée !`)
      .setColor(0x8b008b)
      .addFields(
        { name: 'Produit', value: `${emoji[type]} ${type}`, inline: true },
        { name: 'Quantité', value: '5 unités', inline: true },
        { name: '💸 Coût', value: `${cout[type]} €`, inline: true },
      )
      .setFooter({ text: 'Astra RP • Marché noir' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'dealer') {
    const type = interaction.options.getString('type');
    const quantite = interaction.options.getInteger('quantite');
    const emoji = { weed: '🌿', cocaine: '❄️', pilules: '💊' };
    const prix = { weed: 150, cocaine: 600, pilules: 300 };
    const key = `${emoji[type]} ${type}`;
    if (!db.inventory[userId][key] || db.inventory[userId][key] < quantite) {
      return interaction.reply({ content: `❌ Tu n'as pas assez de **${type}** dans ton inventaire !`, ephemeral: true });
    }
    const chance = Math.random();
    db.inventory[userId][key] -= quantite;
    if (chance < 0.25) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2);
      db.wanted[userId].reason = 'Deal de drogue';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Deal raté !').setColor(0xff0000).setDescription('La police t\'a repéré ! +2 Wanted. Tu as perdu ta marchandise.').setTimestamp()] });
    }
    const gain = prix[type] * quantite;
    db.bank[userId].cash += gain;
    saveDB(db);
    const embed = new EmbedBuilder()
      .setTitle(`${emoji[type]} Deal effectué !`)
      .setColor(0x8b008b)
      .addFields(
        { name: 'Produit', value: `${emoji[type]} ${type} x${quantite}`, inline: true },
        { name: '💰 Gain', value: `${gain.toLocaleString()} €`, inline: true },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  // ══════════════════════════════════════════
  //  FABRICATION D'ARMES
  // ══════════════════════════════════════════
  else if (commandName === 'fabriquer_arme') {
    const arme = interaction.options.getString('arme');
    const cout = { pistolet: 1500, uzi: 3000, fusil: 8000, grenade: 2000 };
    const emoji = { pistolet: '🔫', uzi: '🔫', fusil: '🪖', grenade: '💣' };
    if (db.bank[userId].cash < cout[arme]) {
      return interaction.reply({ content: `❌ Il te faut **${cout[arme]} €** pour fabriquer cette arme !`, ephemeral: true });
    }
    const chance = Math.random();
    db.bank[userId].cash -= cout[arme];
    if (chance < 0.3) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 2);
      db.wanted[userId].reason = 'Fabrication d\'armes illégales';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('💥 Fabrication échouée !').setColor(0xff0000).setDescription('La police a été alertée ! +2 Wanted. Matériaux perdus.').setTimestamp()] });
    }
    const key = `${emoji[arme]} ${arme}`;
    if (!db.inventory[userId][key]) db.inventory[userId][key] = 0;
    db.inventory[userId][key] += 1;
    saveDB(db);
    const embed = new EmbedBuilder()
      .setTitle(`${emoji[arme]} Arme fabriquée !`)
      .setColor(0x800000)
      .addFields(
        { name: 'Arme', value: `${emoji[arme]} ${arme}`, inline: true },
        { name: '💸 Coût', value: `${cout[arme].toLocaleString()} €`, inline: true },
      )
      .setFooter({ text: '⚠️ Port d\'arme illégal — Risque d\'arrestation' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'vendre_arme') {
    const arme = interaction.options.getString('arme');
    const emoji = { pistolet: '🔫', uzi: '🔫', fusil: '🪖', grenade: '💣' };
    const prix = { pistolet: 2500, uzi: 5000, fusil: 12000, grenade: 3500 };
    const key = `${emoji[arme]} ${arme}`;
    if (!db.inventory[userId][key] || db.inventory[userId][key] < 1) {
      return interaction.reply({ content: `❌ Tu n'as pas de **${arme}** dans ton inventaire !`, ephemeral: true });
    }
    const chance = Math.random();
    db.inventory[userId][key] -= 1;
    if (chance < 0.2) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 3);
      db.wanted[userId].reason = 'Trafic d\'armes';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚨 Transaction interceptée !').setColor(0xff0000).setDescription('Les flics ont intercepté la vente ! +3 Wanted.').setTimestamp()] });
    }
    db.bank[userId].cash += prix[arme];
    saveDB(db);
    const embed = new EmbedBuilder()
      .setTitle(`${emoji[arme]} Arme vendue au marché noir !`)
      .setColor(0x800000)
      .addFields(
        { name: 'Arme', value: `${emoji[arme]} ${arme}`, inline: true },
        { name: '💰 Gain', value: `${prix[arme].toLocaleString()} €`, inline: true },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  // ══════════════════════════════════════════
  //  RACKET
  // ══════════════════════════════════════════
  else if (commandName === 'racketter') {
    const cible = interaction.options.getUser('cible');
    const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    if (cible.id === userId) return interaction.reply({ content: '❌ Tu ne peux pas te racketter toi-même !', ephemeral: true });

    const chance = Math.random();
    if (chance < 0.3) {
      db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1);
      db.wanted[userId].reason = 'Tentative de racket';
      saveDB(db);
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('❌ Racket échoué !').setColor(0xff0000).setDescription(`<@${cible.id}> t'a résisté et a appelé la police ! +1 Wanted`).setTimestamp()] });
    }

    const pris = Math.min(montant, db.bank[cible.id].cash);
    db.bank[cible.id].cash -= pris;
    db.bank[userId].cash += pris;
    db.wanted[userId].level = Math.min(5, db.wanted[userId].level + 1);
    db.wanted[userId].reason = 'Racket';
    saveDB(db);

    const embed = new EmbedBuilder()
      .setTitle('💰 Racket réussi !')
      .setColor(0xff8c00)
      .addFields(
        { name: '🎯 Victime', value: `<@${cible.id}>`, inline: true },
        { name: '💵 Extorqué', value: `${pris.toLocaleString()} €`, inline: true },
        { name: '🔴 Wanted', value: `Niveau ${db.wanted[userId].level}`, inline: true },
      )
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  // ══════════════════════════════════════════
  //  ADMIN
  // ══════════════════════════════════════════
  else if (commandName === 'addmoney') {
    const cible = interaction.options.getUser('joueur');
    const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    db.bank[cible.id].cash += montant;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Argent ajouté').setColor(0x00ff88).setDescription(`**${montant.toLocaleString()} €** ajoutés à <@${cible.id}>`).setTimestamp()] });
  }

  else if (commandName === 'setjob') {
    const cible = interaction.options.getUser('joueur');
    const job = interaction.options.getString('job');
    getPlayer(db, cible.id);
    db.players[cible.id].job = job;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✅ Métier mis à jour').setColor(0x00ff88).setDescription(`<@${cible.id}> est maintenant **${job}**`).setTimestamp()] });
  }

  // ══════════════════════════════════════════
  //  CRÉATION DE PERSONNAGE
  // ══════════════════════════════════════════
  else if (commandName === 'creer_personnage') {
    if (db.players[userId].created) {
      return interaction.reply({ content: '❌ Tu as déjà créé ton personnage ! Utilise `/profil` pour le voir.', ephemeral: true });
    }
    const prenom = interaction.options.getString('prenom');
    const nom    = interaction.options.getString('nom');
    const age    = interaction.options.getInteger('age');
    const job    = interaction.options.getString('job');

    db.players[userId].prenom  = prenom;
    db.players[userId].nom     = nom;
    db.players[userId].name    = `${prenom} ${nom}`;
    db.players[userId].age     = age;
    db.players[userId].job     = job;
    db.players[userId].created = true;
    db.players[userId].level   = 1;
    db.players[userId].xp      = 0;
    db.bank[userId].cash       = 2000;
    db.bank[userId].bank       = 5000;
    saveDB(db);

    const jobEmoji = { 'Policier':'👮', 'Médecin':'🚑', 'Chauffeur de taxi':'🚕', 'Restaurateur':'🍔', 'Mécanicien':'🚗', 'Sans emploi':'💼' };
    const embed = new EmbedBuilder()
      .setTitle('🎭 Personnage créé — Astra RP')
      .setColor(0xf5c518)
      .setThumbnail(interaction.user.displayAvatarURL())
      .setDescription(`Bienvenue à **Astra RP**, **${prenom} ${nom}** !`)
      .addFields(
        { name: '👤 Identité', value: `${prenom} ${nom}`, inline: true },
        { name: '🎂 Âge', value: `${age} ans`, inline: true },
        { name: `${jobEmoji[job] || '💼'} Métier`, value: job, inline: true },
        { name: '💵 Cash de départ', value: '2 000 €', inline: true },
        { name: '🏦 Banque de départ', value: '5 000 €', inline: true },
        { name: '⭐ Niveau', value: '1', inline: true },
      )
      .setFooter({ text: 'Astra RP • Bonne chance dans ta nouvelle vie !' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
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

    if (!p.created) {
      return interaction.reply({ content: `❌ <@${cible.id}> n'a pas encore créé son personnage ! Utilise \`/creer_personnage\``, ephemeral: true });
    }

    const jobEmoji = { 'Policier':'👮', 'Médecin':'🚑', 'Chauffeur de taxi':'🚕', 'Restaurateur':'🍔', 'Mécanicien':'🚗', 'Sans emploi':'💼' };
    const embed = new EmbedBuilder()
      .setTitle(`👤 Profil — ${p.name}`)
      .setColor(0x1e90ff)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '🪪 Identité', value: `${p.prenom} ${p.nom}`, inline: true },
        { name: '🎂 Âge', value: `${p.age} ans`, inline: true },
        { name: `${jobEmoji[p.job] || '💼'} Métier`, value: p.job, inline: true },
        { name: '⭐ Niveau', value: `${p.level}`, inline: true },
        { name: '💰 Fortune', value: `Cash: **${b.cash.toLocaleString()} €**\nBanque: **${b.bank.toLocaleString()} €**`, inline: true },
        { name: '🚗 Permis', value: l.has ? `✅ ${l.points}/12 pts` : '❌ Aucun', inline: true },
        { name: '🏠 Logement', value: h.has ? `✅ ${h.address}` : '❌ Sans domicile', inline: true },
        { name: '📦 Stockage', value: s.unlocked ? '✅ Débloqué' : '❌ Verrouillé', inline: true },
        { name: '🔴 Wanted', value: w.level > 0 ? `${'⭐'.repeat(w.level)} — ${w.reason}` : '✅ Aucun', inline: true },
      )
      .setFooter({ text: 'Astra RP • Profil joueur' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  // ══════════════════════════════════════════
  //  STOCKAGE
  // ══════════════════════════════════════════
  else if (commandName === 'acheter_stockage') {
    const cout = 5000;
    if (db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu as déjà un entrepôt !', ephemeral: true });
    if (db.bank[userId].cash < cout) return interaction.reply({ content: `❌ Il te faut **${cout.toLocaleString()} €** en cash !`, ephemeral: true });
    db.bank[userId].cash -= cout;
    db.storage[userId].unlocked = true;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle('📦 Entrepôt acheté !')
      .setColor(0x00ff88)
      .setDescription(`Tu es maintenant propriétaire d'un entrepôt.\nUtilise \`/deposer_item\` et \`/retirer_item\` pour gérer ton stock.`)
      .addFields({ name: '💸 Coût', value: `${cout.toLocaleString()} €`, inline: true })
      .setTimestamp()] });
  }

  else if (commandName === 'stockage') {
    if (!db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu n\'as pas d\'entrepôt. Achète-en un avec `/acheter_stockage` !', ephemeral: true });
    const items = Object.entries(db.storage[userId].items).map(([k, v]) => `• **${k}** x${v}`).join('\n') || '*Entrepôt vide*';
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle('📦 Entrepôt — Stockage')
      .setColor(0x8b4513)
      .setDescription(items)
      .setFooter({ text: 'Astra RP • Stockage' })
      .setTimestamp()], ephemeral: true });
  }

  else if (commandName === 'deposer_item') {
    const item = interaction.options.getString('item');
    const qty  = interaction.options.getInteger('quantite');
    if (!db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu n\'as pas d\'entrepôt !', ephemeral: true });
    if (!db.inventory[userId][item] || db.inventory[userId][item] < qty) return interaction.reply({ content: `❌ Tu n'as pas assez de **${item}** dans ton inventaire !`, ephemeral: true });
    db.inventory[userId][item] -= qty;
    if (db.inventory[userId][item] <= 0) delete db.inventory[userId][item];
    if (!db.storage[userId].items[item]) db.storage[userId].items[item] = 0;
    db.storage[userId].items[item] += qty;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Item déposé').setColor(0x00ff88).setDescription(`**${item}** x${qty} → Entrepôt`).setTimestamp()] });
  }

  else if (commandName === 'retirer_item') {
    const item = interaction.options.getString('item');
    const qty  = interaction.options.getInteger('quantite');
    if (!db.storage[userId].unlocked) return interaction.reply({ content: '❌ Tu n\'as pas d\'entrepôt !', ephemeral: true });
    if (!db.storage[userId].items[item] || db.storage[userId].items[item] < qty) return interaction.reply({ content: `❌ Tu n'as pas assez de **${item}** dans ton entrepôt !`, ephemeral: true });
    db.storage[userId].items[item] -= qty;
    if (db.storage[userId].items[item] <= 0) delete db.storage[userId].items[item];
    if (!db.inventory[userId][item]) db.inventory[userId][item] = 0;
    db.inventory[userId][item] += qty;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📦 Item retiré').setColor(0x00ff88).setDescription(`**${item}** x${qty} → Inventaire`).setTimestamp()] });
  }

  // ══════════════════════════════════════════
  //  HABITATION
  // ══════════════════════════════════════════
  else if (commandName === 'acheter_maison') {
    const type = interaction.options.getString('type');
    const biens = {
      studio:      { prix: 10000,  label: '🏠 Studio',      adresse: '12 Rue des Pauvres, Astra' },
      appartement: { prix: 35000,  label: '🏡 Appartement', adresse: '47 Avenue du Soleil, Astra' },
      villa:       { prix: 120000, label: '🏰 Villa',        adresse: '8 Allée des Riches, Astra Heights' },
      manoir:      { prix: 500000, label: '🏯 Manoir',       adresse: '1 Boulevard du Pouvoir, Astra Hills' },
    };
    const bien = biens[type];
    if (db.housing[userId].has) return interaction.reply({ content: '❌ Tu possèdes déjà une propriété ! Vends-la d\'abord avec `/vendre_maison`.', ephemeral: true });
    const total = db.bank[userId].cash + db.bank[userId].bank;
    if (total < bien.prix) return interaction.reply({ content: `❌ Il te faut **${bien.prix.toLocaleString()} €** (cash + banque) !`, ephemeral: true });
    // Débiter cash puis banque
    if (db.bank[userId].cash >= bien.prix) {
      db.bank[userId].cash -= bien.prix;
    } else {
      const reste = bien.prix - db.bank[userId].cash;
      db.bank[userId].cash = 0;
      db.bank[userId].bank -= reste;
    }
    db.housing[userId] = { has: true, address: bien.adresse, type, label: bien.label, prix: bien.prix, level: 1 };
    saveDB(db);
    const embed = new EmbedBuilder()
      .setTitle(`${bien.label} acheté !`)
      .setColor(0xf5c518)
      .addFields(
        { name: '📍 Adresse', value: bien.adresse, inline: false },
        { name: '💸 Prix payé', value: `${bien.prix.toLocaleString()} €`, inline: true },
        { name: '🏠 Type', value: bien.label, inline: true },
      )
      .setFooter({ text: 'Astra RP • Immobilier' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'maison') {
    const h = db.housing[userId];
    if (!h.has) return interaction.reply({ content: '❌ Tu n\'as pas de propriété. Utilise `/acheter_maison` !', ephemeral: true });
    const embed = new EmbedBuilder()
      .setTitle(`${h.label || '🏠 Propriété'} — Ma Maison`)
      .setColor(0xf5c518)
      .addFields(
        { name: '📍 Adresse', value: h.address, inline: false },
        { name: '🏠 Type', value: h.label || h.type, inline: true },
        { name: '⭐ Niveau', value: `${h.level}`, inline: true },
        { name: '💰 Valeur estimée', value: `${(h.prix * 0.7).toLocaleString()} €`, inline: true },
      )
      .setFooter({ text: 'Astra RP • Propriété' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }

  else if (commandName === 'vendre_maison') {
    const h = db.housing[userId];
    if (!h.has) return interaction.reply({ content: '❌ Tu n\'as pas de propriété à vendre !', ephemeral: true });
    const gain = Math.floor(h.prix * 0.7);
    db.bank[userId].cash += gain;
    db.housing[userId] = { has: false, address: null, level: 1 };
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle('🏚️ Propriété vendue')
      .setColor(0xff6600)
      .setDescription(`Ta propriété a été vendue pour **${gain.toLocaleString()} €** (70% de la valeur).`)
      .setTimestamp()] });
  }

  // ══════════════════════════════════════════
  //  ADMIN ÉTENDU
  // ══════════════════════════════════════════
  else if (commandName === 'removemoney') {
    const cible  = interaction.options.getUser('joueur');
    const montant = interaction.options.getInteger('montant');
    getPlayer(db, cible.id);
    const retiré = Math.min(montant, db.bank[cible.id].cash + db.bank[cible.id].bank);
    if (db.bank[cible.id].cash >= montant) {
      db.bank[cible.id].cash -= montant;
    } else {
      const reste = montant - db.bank[cible.id].cash;
      db.bank[cible.id].cash = 0;
      db.bank[cible.id].bank = Math.max(0, db.bank[cible.id].bank - reste);
    }
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('💸 Argent retiré').setColor(0xff4444).setDescription(`**-${retiré.toLocaleString()} €** retiré à <@${cible.id}>`).setTimestamp()] });
  }

  else if (commandName === 'giveitem') {
    const cible = interaction.options.getUser('joueur');
    const item  = interaction.options.getString('item');
    const qty   = interaction.options.getInteger('quantite');
    getPlayer(db, cible.id);
    if (!db.inventory[cible.id][item]) db.inventory[cible.id][item] = 0;
    db.inventory[cible.id][item] += qty;
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎁 Item donné').setColor(0x00ff88).setDescription(`**${item}** x${qty} → <@${cible.id}>`).setTimestamp()] });
  }

  else if (commandName === 'removeitem') {
    const cible = interaction.options.getUser('joueur');
    const item  = interaction.options.getString('item');
    const qty   = interaction.options.getInteger('quantite');
    getPlayer(db, cible.id);
    if (!db.inventory[cible.id][item]) return interaction.reply({ content: `❌ <@${cible.id}> n'a pas de **${item}** !`, ephemeral: true });
    db.inventory[cible.id][item] = Math.max(0, db.inventory[cible.id][item] - qty);
    if (db.inventory[cible.id][item] === 0) delete db.inventory[cible.id][item];
    saveDB(db);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🗑️ Item retiré').setColor(0xff4444).setDescription(`**${item}** x${qty} retiré à <@${cible.id}>`).setTimestamp()] });
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
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔄 Joueur réinitialisé').setColor(0xff4444).setDescription(`Le profil de <@${cible.id}> a été entièrement réinitialisé.`).setTimestamp()] });
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
    const embed = new EmbedBuilder()
      .setTitle(`🔧 Admin Info — ${p.name || cible.username}`)
      .setColor(0xf5c518)
      .setThumbnail(cible.displayAvatarURL())
      .addFields(
        { name: '🪪 Nom RP', value: p.name || 'Non créé', inline: true },
        { name: '🎂 Âge', value: p.age ? `${p.age} ans` : 'N/A', inline: true },
        { name: '💼 Job', value: p.job, inline: true },
        { name: '⭐ Niveau', value: `${p.level}`, inline: true },
        { name: '💵 Cash', value: `${b.cash.toLocaleString()} €`, inline: true },
        { name: '🏦 Banque', value: `${b.bank.toLocaleString()} €`, inline: true },
        { name: '🚗 Permis', value: l.has ? `✅ ${l.points}/12pts` : '❌', inline: true },
        { name: '🏠 Maison', value: h.has ? h.label : '❌', inline: true },
        { name: '📦 Stockage', value: s.unlocked ? '✅' : '❌', inline: true },
        { name: '🔴 Wanted', value: w.level > 0 ? `⭐x${w.level} — ${w.reason}` : 'Aucun', inline: true },
        { name: '🎒 Inventaire', value: inv.length > 200 ? inv.slice(0,200)+'...' : inv },
        { name: '📦 Entrepôt', value: stk.length > 200 ? stk.slice(0,200)+'...' : stk },
      )
      .setFooter({ text: 'Astra RP • Admin Panel' })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ══════════════════════════════════════════
  //  HELP
  // ══════════════════════════════════════════
  else if (commandName === 'help') {
    const cat = interaction.options.getString('categorie');

    const pages = {
      banque: {
        title: '💳 Banque & Economie',
        color: 0x1e90ff,
        fields: [
          { name: '`/compte`', value: 'Voir ton solde (cash + banque)', inline: false },
          { name: '`/virement @joueur montant`', value: "Envoyer de l'argent a un joueur", inline: false },
          { name: '`/depot montant`', value: "Deposer de l'argent a la banque", inline: false },
          { name: '`/retrait montant`', value: "Retirer de l'argent de la banque", inline: false },
        ]
      },
      identite: {
        title: '🪪 Identite & Permis',
        color: 0xffd700,
        fields: [
          { name: '`/carte_identite [@joueur]`', value: "Voir la carte d'identite (la sienne ou d'un autre)", inline: false },
          { name: '`/setnom prenom nom`', value: 'Definir ton nom RP (si pas de personnage cree)', inline: false },
          { name: '`/permis [@joueur]`', value: 'Voir le permis de conduire', inline: false },
          { name: '`/donner_permis @joueur`', value: '**[ADMIN]** Donner le permis a un joueur', inline: false },
          { name: '`/retirer_points @joueur points raison`', value: '**[POLICE]** Retirer des points de permis (1-12)', inline: false },
        ]
      },
      personnage: {
        title: '🎭 Personnage',
        color: 0xf5c518,
        fields: [
          { name: '`/creer_personnage prenom nom age job`', value: 'Creer ton personnage RP (une seule fois !)\nChoix de 15 metiers disponibles', inline: false },
          { name: '`/profil [@joueur]`', value: "Voir le profil complet d'un personnage\n(age, metier, fortune, maison, wanted...)", inline: false },
          { name: '`/metiers`', value: 'Voir la liste de tous les metiers avec leurs salaires', inline: false },
          { name: '`/inventaire`', value: 'Voir les objets dans ton inventaire', inline: false },
        ]
      },
      criminel: {
        title: '🔫 Activites Criminelles',
        color: 0x8b0000,
        fields: [
          { name: '`/braquer banque/superette/pharmacie`', value: "Braquer un lieu | Cooldown 15min | 35% d'echec → +2 Wanted", inline: false },
          { name: '`/fabriquer_drogue weed/cocaine/pilules`', value: "Fabriquer de la drogue (cout en cash) | 20% explosion → +1 Wanted", inline: false },
          { name: '`/dealer type quantite`', value: "Vendre ta drogue au marche noir | 25% echec → +2 Wanted", inline: false },
          { name: '`/fabriquer_arme pistolet/uzi/fusil/grenade`', value: "Fabriquer une arme illegalement | 30% echec → +2 Wanted", inline: false },
          { name: '`/vendre_arme type`', value: "Vendre une arme au marche noir | 20% interception → +3 Wanted", inline: false },
          { name: '`/racketter @joueur montant`', value: "Extorquer un joueur | 30% echec → +1 Wanted", inline: false },
        ]
      },
      police: {
        title: '🚔 Commandes Police',
        color: 0x1e90ff,
        fields: [
          { name: '`/wanted @joueur niveau raison`', value: 'Mettre un joueur en wanted (1 a 5 etoiles)', inline: false },
          { name: '`/unwanted @joueur`', value: "Retirer le wanted d'un joueur", inline: false },
          { name: '`/fouille @joueur`', value: "Voir l'inventaire complet d'un joueur", inline: false },
          { name: '`/amende @joueur montant raison`', value: 'Infliger une amende a un joueur', inline: false },
          { name: '`/retirer_points @joueur points raison`', value: 'Retirer des points sur le permis (1-12)', inline: false },
        ]
      },
      habitat: {
        title: '🏠 Habitation & Stockage',
        color: 0xf5c518,
        fields: [
          { name: '`/acheter_maison type`', value: "Studio 10k€ | Appartement 35k€ | Villa 120k€ | Manoir 500k€", inline: false },
          { name: '`/maison`', value: 'Voir ta propriete (adresse, type, valeur)', inline: false },
          { name: '`/vendre_maison`', value: "Vendre ta propriete (70% du prix d'achat)", inline: false },
          { name: '`/acheter_stockage`', value: 'Acheter un entrepot de stockage (5 000€)', inline: false },
          { name: '`/stockage`', value: 'Voir les items dans ton entrepot', inline: false },
          { name: '`/deposer_item item quantite`', value: 'Transferer un item de ton inventaire → entrepot', inline: false },
          { name: '`/retirer_item item quantite`', value: 'Transferer un item de ton entrepot → inventaire', inline: false },
        ]
      },
      admin: {
        title: '🔧 Administration',
        color: 0xff4444,
        fields: [
          { name: '`/setup`', value: 'Creer tous les salons du serveur Astra RP', inline: false },
          { name: '`/addmoney @joueur montant`', value: "Ajouter de l'argent (cash) a un joueur", inline: false },
          { name: '`/removemoney @joueur montant`', value: "Retirer de l'argent a un joueur", inline: false },
          { name: '`/giveitem @joueur item quantite`', value: 'Donner un item a un joueur', inline: false },
          { name: '`/removeitem @joueur item quantite`', value: "Retirer un item d'un joueur", inline: false },
          { name: '`/setjob @joueur metier`', value: "Changer le metier d'un joueur", inline: false },
          { name: '`/donner_permis @joueur`', value: 'Donner le permis de conduire a un joueur', inline: false },
          { name: '`/resetplayer @joueur`', value: '⚠️ Reinitialiser completement un joueur', inline: false },
          { name: '`/admininfo @joueur`', value: "Voir toutes les infos detaillees d'un joueur", inline: false },
        ]
      },
    };

    // Si une categorie est choisie
    if (cat && pages[cat]) {
      const p = pages[cat];
      const embed = new EmbedBuilder()
        .setTitle(`📖 Aide — ${p.title}`)
        .setColor(p.color)
        .addFields(p.fields)
        .setFooter({ text: 'Astra RP • /help pour voir toutes les categories' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Menu principal
    const mainEmbed = new EmbedBuilder()
      .setTitle('📖 Aide — Astra RP')
      .setColor(0xe8212a)
      .setDescription("Bienvenue sur **Astra RP** ! Voici toutes les categories de commandes disponibles. Utilise `/help categorie:X` pour voir les details.")
      .addFields(
        { name: '💳 Banque & Economie', value: '`/help categorie:Banque` — Compte, virements, depot, retrait', inline: false },
        { name: '🪪 Identite & Permis', value: "`/help categorie:Identite` — Carte d'identite, permis de conduire", inline: false },
        { name: '🎭 Personnage', value: '`/help categorie:Personnage` — Creer ton perso, profil, inventaire, metiers', inline: false },
        { name: '🔫 Criminel', value: '`/help categorie:Criminel` — Braquage, drogue, armes, racket', inline: false },
        { name: '🚔 Police', value: '`/help categorie:Police` — Wanted, fouille, amende, points de permis', inline: false },
        { name: '🏠 Habitation & Stockage', value: '`/help categorie:Habitat` — Maison, entrepot, items', inline: false },
        { name: '🔧 Administration', value: '`/help categorie:Admin` — Commandes reservees au staff', inline: false },
      )
      .setFooter({ text: 'Astra RP • ' + Object.values(pages).reduce((acc, p) => acc + p.fields.length, 0) + ' commandes disponibles' })
      .setTimestamp();

    await interaction.reply({ embeds: [mainEmbed], ephemeral: true });
  }
});

client.login(TOKEN);

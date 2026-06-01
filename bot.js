const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, SlashCommandBuilder, REST, Routes, ChannelType } = require('discord.js');
const fs = require('fs');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ]
});

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ TOKEN ou CLIENT_ID manquant !');
  process.exit(1);
}

// ─── COMMANDES LIBRES (Sans abonnement) ──────────────────────────────────────
const FREE_COMMANDS = [
  'help', 'metiers', 'setup'
];

// ─── VÉRIFICATION ABONNEMENT ────────────────────────────────────────────────
async function checkSubscription(guildId) {
  try {
    const res = await axios.get(`${SITE_URL}/api/check-guild/${guildId}`, { timeout: 5000 });
    return res.data;
  } catch (err) {
    console.error('⚠️ Impossible de vérifier l\'abonnement:', err.message);
    return { access: false, daysLeft: 0, reason: 'Site injoignable' };
  }
}

function noSubEmbed(daysLeft = null) {
  const desc = daysLeft === null
    ? `Tu n'as pas d'abonnement actif.\nAbonne-toi sur **[notre site](${SITE_URL})** pour accéder au bot !\n\n**Comment ça marche :**\n1. Va sur le site\n2. Rentre ton **Guild ID** et **Username**\n3. Finis ton paiement\n4. Le bot sera accessible pendant 30 jours !`
    : `Ton abonnement a expiré ! Il te restait ${daysLeft} jours.\nRenouvelle-le sur **[notre site](${SITE_URL})**.`;
  
  return new EmbedBuilder()
    .setTitle('🔒 Accès refusé — Abonnement requis')
    .setColor(0xe8212a)
    .setDescription(desc)
    .addFields(
      { name: '💳 Prix', value: '10€/mois', inline: true },
      { name: '🌐 Site', value: `[Cliquer ici](${SITE_URL})`, inline: true }
    )
    .setFooter({ text: 'Astra RP • Abonnement' });
}

// ─── BASE DE DONNÉES SIMPLE (JSON) ───────────────────────────────────────────
const DB_FILE = './database.json';

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const emptyDB = { players: {}, bank: {}, inventory: {}, storage: {}, housing: {}, driving_license: {}, wanted: {}, sanctions: {} };
      fs.writeFileSync(DB_FILE, JSON.stringify(emptyDB, null, 2));
      return emptyDB;
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('❌ Erreur chargement DB:', err.message);
    return { players: {}, bank: {}, inventory: {}, storage: {}, housing: {}, driving_license: {}, wanted: {}, sanctions: {} };
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('❌ Erreur sauvegarde DB:', err.message);
  }
}

// ─── LOG MODÉRATION ────────────────────────────────────────────────────────
async function logModeration(guild, embed) {
  try {
    const logChan = guild.channels.cache.find(c => c.name === 'logs-bot' || c.name === '📋-logs-moderation' || c.name === 'logs-moderation');
    if (logChan && logChan.isTextBased()) {
      await logChan.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('❌ Erreur log modération:', err.message);
  }
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
    description: 'Protéger les citoyens et maintenir l\'ordre public.',
  },
  {
    id: 'medecin',
    nom: '🏥 Médecin / SAMU',
    emoji: '🏥',
    salaire: 3500,
    ageMin: 18,
    illegal: false,
    description: 'Soigner les blessés et gérer les urgences médicales.',
  },
  {
    id: 'pompier',
    nom: '🚒 Pompier / Secours',
    emoji: '🚒',
    salaire: 2800,
    ageMin: 16,
    illegal: false,
    description: 'Intervenir sur les incendies et accidents.',
  },
  {
    id: 'mecanicien',
    nom: '🔧 Mécanicien',
    emoji: '🔧',
    salaire: 2200,
    ageMin: 15,
    illegal: false,
    description: 'Réparer les véhicules et effectuer des révisions.',
  },
  {
    id: 'pharmacien',
    nom: '💊 Pharmacien',
    emoji: '💊',
    salaire: 3000,
    ageMin: 18,
    illegal: false,
    description: 'Délivrer les médicaments et gérer les stocks.',
  },
];

function getPlayer(db, userId) {
  if (!db.players[userId]) {
    db.players[userId] = { 
      prenom: null, 
      nom: null, 
      age: null, 
      job: 'Sans emploi', 
      level: 1, 
      xp: 0, 
      created: false 
    };
    db.bank[userId] = { cash: 500, bank: 1000 };
    db.inventory[userId] = {};
    db.storage[userId] = { unlocked: false, items: {} };
    db.housing[userId] = { has: false, address: null };
    db.driving_license[userId] = { has: false, points: 12 };
    db.wanted[userId] = { level: 0, reason: null };
    db.sanctions[userId] = [];
    saveDB(db);
  }
  return db;
}

// ─── ÉVÉNEMENT: BOT PRÊT ────────────────────────────────────────────────────
client.on('ready', async () => {
  console.log(`✅ Bot connecté : ${client.user.username} (${client.user.id})`);
  client.user.setActivity('+help | Astra RP', { type: 'WATCHING' });

  try {
    const commands = [
      new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configurer les salons et rôles du serveur RP')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    console.log('⏳ Enregistrement des slash commands...');

    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Slash commands enregistrées');
  } catch (err) {
    console.error('❌ Erreur enregistrement commands:', err.message);
  }
});

// ─── ÉVÉNEMENT: INTERACTIONS (SLASH COMMANDS) ──────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    if (!interaction.isCommand()) return;

    const { commandName, guild, user } = interaction;
    const isAdmin = interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator);

    // /setup ne nécessite pas d'abonnement
    if (commandName === 'setup') {
      if (!isAdmin) {
        return interaction.reply({ content: '❌ Seuls les administrateurs peuvent faire le setup.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: false });

      try {
        const category = await guild.channels.create({
          name: '📋 ASTRA RP',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.id,
              allow: [PermissionsBitField.Flags.ViewChannel],
            },
          ],
        });

        const textChannels = [
          { name: '📰-annonces', type: ChannelType.GuildText },
          { name: '💬-general', type: ChannelType.GuildText },
          { name: '👥-profils', type: ChannelType.GuildText },
          { name: '💼-metiers', type: ChannelType.GuildText },
          { name: '🏦-banque', type: ChannelType.GuildText },
          { name: '⚖️-justice', type: ChannelType.GuildText },
          { name: '🏥-sante', type: ChannelType.GuildText },
          { name: '🚗-transport', type: ChannelType.GuildText },
          { name: '🎭-rp', type: ChannelType.GuildText },
          { name: '📋-logs-bot', type: ChannelType.GuildText },
          { name: '📋-logs-moderation', type: ChannelType.GuildText },
        ];

        for (const channelData of textChannels) {
          await guild.channels.create({
            name: channelData.name,
            type: channelData.type,
            parent: category.id,
            permissionOverwrites: [
              {
                id: guild.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
              },
            ],
          });
        }

        // Créer les salons VOCAUX
        const voiceChannels = [
          { name: '🎤 Général', type: ChannelType.GuildVoice },
          { name: '🎤 RP', type: ChannelType.GuildVoice },
          { name: '🎤 Police', type: ChannelType.GuildVoice },
          { name: '🎤 Médecin', type: ChannelType.GuildVoice },
          { name: '🎤 Pompier', type: ChannelType.GuildVoice },
        ];

        for (const channelData of voiceChannels) {
          await guild.channels.create({
            name: channelData.name,
            type: channelData.type,
            parent: category.id,
            permissionOverwrites: [
              {
                id: guild.id,
                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak],
              },
            ],
          });
        }

        const roles = [
          { name: '👮 Police', color: 0x0099FF },
          { name: '🏥 Médecin', color: 0x00FF00 },
          { name: '🚒 Pompier', color: 0xFF6600 },
          { name: '🔧 Mécanicien', color: 0xFFCC00 },
          { name: '💊 Pharmacien', color: 0xFF00FF },
          { name: '⚖️ Gouvernement', color: 0x9900FF },
          { name: '🎭 Citoyen', color: 0xCCCCCC },
        ];

        for (const roleData of roles) {
          await guild.roles.create({
            name: roleData.name,
            color: roleData.color,
            reason: 'Setup Astra RP',
          });
        }

        const embed = new EmbedBuilder()
          .setTitle('✅ Setup terminé!')
          .setColor(0x57F287)
          .setDescription('Tous les salons, salons vocaux et rôles ont été créés avec succès.')
          .addFields(
            { name: '📋 Catégorie', value: `${category.name}`, inline: false },
            { name: '💬 Salons texte créés', value: `${textChannels.length} salons`, inline: true },
            { name: '🎤 Salons vocaux créés', value: `${voiceChannels.length} salons`, inline: true },
            { name: '👥 Rôles créés', value: `${roles.length} rôles`, inline: true },
            { name: '📝 Prochaine étape', value: 'Tape `+setregle` pour générer les descriptions des salons et règles !', inline: false }
          )
          .setFooter({ text: 'Astra RP' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error('❌ Erreur setup:', err.message);
        await interaction.editReply({ content: `❌ Erreur : ${err.message}` });
      }
    }

  } catch (err) {
    console.error('❌ Erreur interaction:', err);
    interaction.reply({ content: '❌ Une erreur s\'est produite.', ephemeral: true }).catch(() => {});
  }
});

// ─── ÉVÉNEMENT: MESSAGES ────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const PREFIX = '+';
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift().toLowerCase();
    const author = message.author;
    const guild = message.guild;

    let db = loadDB();
    db = getPlayer(db, author.id);

    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    // ─── VÉRIFIER ABONNEMENT (sauf pour les commandes libres) ──────────────
    if (!FREE_COMMANDS.includes(cmd)) {
      const sub = await checkSubscription(guild.id);
      if (!sub.access) {
        return message.reply({ embeds: [noSubEmbed(sub.daysLeft)] });
      }
    }

    // ─── +help ───────────────────────────────────────────────────────────────
    if (cmd === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('📖 Aide — Astra RP')
        .setColor(0x5865F2)
        .addFields(
          { name: '💬 Commandes de base', value: '`+profil` — Voir ton profil\n`+solde` — Voir ton argent\n`+metiers` — Voir les métiers\n`+inventaire` — Voir ton inventaire' },
          { name: '👮 Commandes RP', value: '`+arrest @joueur [raison]` — Arrêter\n`+release @joueur` — Libérer' },
          { name: '🛡️ Modération', value: '`+ban @joueur [raison]` — Bannir\n`+kick @joueur [raison]` — Expulser\n`+mute @joueur [raison]` — Mute\n`+unmute @joueur` — Unmute\n`+clear [nombre]` — Supprimer des messages' },
          { name: '⚙️ Admin', value: '`+setjob @joueur [métier]` — Changer métier\n`+warn @joueur [raison]` — Avertir\n`+stats` — Statistiques' }
        )
        .setFooter({ text: 'Astra RP' })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ─── +profil ──────────────────────────────────────────────────────────
    if (cmd === 'profil') {
      const target = message.mentions.users.first() || author;
      db = getPlayer(db, target.id);
      const player = db.players[target.id];
      const bank = db.bank[target.id];

      const embed = new EmbedBuilder()
        .setTitle(`👤 Profil de ${player.prenom || target.username}`)
        .setColor(0x57F287)
        .addFields(
          { name: 'Prénom', value: player.prenom || '❌ Non défini', inline: true },
          { name: 'Nom', value: player.nom || '❌ Non défini', inline: true },
          { name: 'Âge', value: player.age ? `${player.age} ans` : '❌ Non défini', inline: true },
          { name: 'Métier', value: `${METIERS.find(m => m.id === player.job)?.emoji || '❌'} ${player.job}`, inline: true },
          { name: 'Niveau', value: `${player.level}`, inline: true },
          { name: 'XP', value: `${player.xp}`, inline: true },
          { name: '💰 Argent', value: `Liquide: ${bank.cash}€\nBanque: ${bank.bank}€`, inline: false }
        )
        .setFooter({ text: 'Astra RP' })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // ─── +solde ───────────────────────────────────────────────────────────
    if (cmd === 'solde') {
      const target = message.mentions.users.first() || author;
      db = getPlayer(db, target.id);
      const bank = db.bank[target.id];
      const total = bank.cash + bank.bank;

      const embed = new EmbedBuilder()
        .setTitle(`💰 Solde de ${target.username}`)
        .setColor(0xFEE75C)
        .addFields(
          { name: 'Liquide', value: `${bank.cash}€`, inline: true },
          { name: 'Banque', value: `${bank.bank}€`, inline: true },
          { name: 'Total', value: `${total}€`, inline: true }
        )
        .setFooter({ text: 'Astra RP' });
      return message.reply({ embeds: [embed] });
    }

    // ─── +metiers ────────────────────────────────────────────────────────
    if (cmd === 'metiers') {
      const liste = METIERS.map(m => `${m.emoji} **${m.nom}** — ${m.description} (*${m.salaire}€/h*)`).join('\n\n');
      const embed = new EmbedBuilder()
        .setTitle('💼 Métiers disponibles')
        .setColor(0xEB459E)
        .setDescription(liste)
        .setFooter({ text: 'Astra RP' });
      return message.reply({ embeds: [embed] });
    }

    // ─── +inventaire ──────────────────────────────────────────────────────
    if (cmd === 'inventaire') {
      const target = message.mentions.users.first() || author;
      db = getPlayer(db, target.id);
      const inv = db.inventory[target.id];
      const items = Object.entries(inv);

      const embed = new EmbedBuilder()
        .setTitle(`🎒 Inventaire de ${db.players[target.id].prenom || target.username}`)
        .setColor(0xFEE75C)
        .setDescription(items.length === 0 ? '*Inventaire vide*' : items.map(([k, v]) => `• **${k}** x${v}`).join('\n'))
        .setFooter({ text: 'Astra RP' });
      return message.reply({ embeds: [embed] });
    }

    // ─── +arrest ──────────────────────────────────────────────────────────
    if (cmd === 'arrest') {
      const target = message.mentions.users.first();
      const raison = args.slice(1).join(' ') || 'Non spécifiée';

      if (!target) return message.reply('❌ Usage : `+arrest @joueur [raison]`');

      db = getPlayer(db, target.id);
      if (!db.players[target.id].imprisoned) {
        db.players[target.id].imprisoned = { active: true, until: Date.now() + 300000, reason: raison };
      } else {
        db.players[target.id].imprisoned.active = true;
        db.players[target.id].imprisoned.until = Date.now() + 300000;
        db.players[target.id].imprisoned.reason = raison;
      }
      saveDB(db);

      const embed = new EmbedBuilder()
        .setTitle('👮 Arrestation')
        .setColor(0xED4245)
        .addFields(
          { name: 'Joueur arrêté', value: target.tag, inline: true },
          { name: 'Raison', value: raison, inline: true },
          { name: 'Par', value: author.tag, inline: true }
        )
        .setTimestamp();

      await logModeration(guild, embed);
      return message.reply(`✅ **${target.username}** a été arrêté pour : ${raison}`);
    }

    // ─── +release ─────────────────────────────────────────────────────────
    if (cmd === 'release') {
      const target = message.mentions.users.first();

      if (!target) return message.reply('❌ Usage : `+release @joueur`');

      db = getPlayer(db, target.id);
      if (db.players[target.id].imprisoned) {
        db.players[target.id].imprisoned.active = false;
      }
      saveDB(db);

      const embed = new EmbedBuilder()
        .setTitle('🔓 Libération')
        .setColor(0x57F287)
        .addFields(
          { name: 'Joueur libéré', value: target.tag, inline: true },
          { name: 'Par', value: author.tag, inline: true }
        )
        .setTimestamp();

      await logModeration(guild, embed);
      return message.reply(`✅ **${target.username}** a été libéré.`);
    }

    // ─── +ban (Modération) ────────────────────────────────────────────────
    if (cmd === 'ban') {
      if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');
      
      const target = message.mentions.users.first();
      const raison = args.slice(1).join(' ') || 'Aucune raison';

      if (!target) return message.reply('❌ Usage : `+ban @joueur [raison]`');

      try {
        await guild.members.ban(target, { reason: raison });

        const embed = new EmbedBuilder()
          .setTitle('🔨 Ban')
          .setColor(0xED4245)
          .addFields(
            { name: 'Joueur banni', value: target.tag, inline: true },
            { name: 'Raison', value: raison, inline: true },
            { name: 'Par', value: author.tag, inline: true }
          )
          .setTimestamp();

        await logModeration(guild, embed);
        return message.reply(`✅ **${target.username}** a été banni.`);
      } catch (err) {
        return message.reply(`❌ Erreur : ${err.message}`);
      }
    }

    // ─── +kick (Modération) ───────────────────────────────────────────────
    if (cmd === 'kick') {
      if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');
      
      const target = message.mentions.users.first();
      const raison = args.slice(1).join(' ') || 'Aucune raison';

      if (!target) return message.reply('❌ Usage : `+kick @joueur [raison]`');

      try {
        const member = await guild.members.fetch(target.id);
        await member.kick(raison);

        const embed = new EmbedBuilder()
          .setTitle('👢 Kick')
          .setColor(0xFF6600)
          .addFields(
            { name: 'Joueur expulsé', value: target.tag, inline: true },
            { name: 'Raison', value: raison, inline: true },
            { name: 'Par', value: author.tag, inline: true }
          )
          .setTimestamp();

        await logModeration(guild, embed);
        return message.reply(`✅ **${target.username}** a été expulsé.`);
      } catch (err) {
        return message.reply(`❌ Erreur : ${err.message}`);
      }
    }

    // ─── +mute (Modération) ───────────────────────────────────────────────
    if (cmd === 'mute') {
      if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');
      
      const target = message.mentions.users.first();
      const raison = args.slice(1).join(' ') || 'Aucune raison';

      if (!target) return message.reply('❌ Usage : `+mute @joueur [raison]`');

      try {
        const member = await guild.members.fetch(target.id);
        await member.timeout(3600000, raison); // 1 heure

        const embed = new EmbedBuilder()
          .setTitle('🔇 Mute')
          .setColor(0xFEE75C)
          .addFields(
            { name: 'Joueur muté', value: target.tag, inline: true },
            { name: 'Durée', value: '1 heure', inline: true },
            { name: 'Raison', value: raison, inline: true },
            { name: 'Par', value: author.tag, inline: true }
          )
          .setTimestamp();

        await logModeration(guild, embed);
        return message.reply(`✅ **${target.username}** a été muté pour 1 heure.`);
      } catch (err) {
        return message.reply(`❌ Erreur : ${err.message}`);
      }
    }

    // ─── +unmute (Modération) ─────────────────────────────────────────────
    if (cmd === 'unmute') {
      if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');
      
      const target = message.mentions.users.first();

      if (!target) return message.reply('❌ Usage : `+unmute @joueur`');

      try {
        const member = await guild.members.fetch(target.id);
        await member.timeout(null);

        const embed = new EmbedBuilder()
          .setTitle('🔊 Unmute')
          .setColor(0x57F287)
          .addFields(
            { name: 'Joueur démuté', value: target.tag, inline: true },
            { name: 'Par', value: author.tag, inline: true }
          )
          .setTimestamp();

        await logModeration(guild, embed);
        return message.reply(`✅ **${target.username}** a été démuté.`);
      } catch (err) {
        return message.reply(`❌ Erreur : ${err.message}`);
      }
    }

    // ─── +clear (Modération) ──────────────────────────────────────────────
    if (cmd === 'clear') {
      if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');
      
      const nombre = parseInt(args[0]) || 10;

      if (nombre < 1 || nombre > 100) {
        return message.reply('❌ Usage : `+clear [nombre]` (1-100)');
      }

      try {
        await message.channel.bulkDelete(nombre, true);

        const embed = new EmbedBuilder()
          .setTitle('🗑️ Clear')
          .setColor(0x5865F2)
          .addFields(
            { name: 'Messages supprimés', value: `${nombre}`, inline: true },
            { name: 'Salon', value: message.channel.name, inline: true },
            { name: 'Par', value: author.tag, inline: true }
          )
          .setTimestamp();

        await logModeration(guild, embed);
        return message.reply(`✅ **${nombre}** messages supprimés.`).then(msg => setTimeout(() => msg.delete(), 5000));
      } catch (err) {
        return message.reply(`❌ Erreur : ${err.message}`);
      }
    }

    // ─── +setjob (Admin) ──────────────────────────────────────────────────
    if (cmd === 'setjob') {
      if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');
      
      const target = message.mentions.users.first();
      const jobId = args[1]?.toLowerCase();

      if (!target || !jobId) return message.reply('❌ Usage : `+setjob @joueur [métier]`');

      const metier = METIERS.find(m => m.id === jobId);
      if (!metier) {
        const liste = METIERS.map(m => `\`${m.id}\``).join(', ');
        return message.reply(`❌ Métier inconnu.\nMétiers: ${liste}`);
      }

      db = getPlayer(db, target.id);
      db.players[target.id].job = jobId;
      saveDB(db);

      const embed = new EmbedBuilder()
        .setTitle('💼 Changement de métier')
        .setColor(0x57F287)
        .addFields(
          { name: 'Joueur', value: target.tag, inline: true },
          { name: 'Métier', value: `${metier.emoji} ${metier.nom}`, inline: true },
          { name: 'Par', value: author.tag, inline: true }
        )
        .setTimestamp();

      await logModeration(guild, embed);
      return message.reply(`✅ **${target.username}** est maintenant ${metier.emoji} **${metier.nom}** !`);
    }

    // ─── +warn (Admin) ────────────────────────────────────────────────────
    if (cmd === 'warn') {
      if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');
      
      const target = message.mentions.users.first();
      const raison = args.slice(1).join(' ') || 'Aucune raison';

      if (!target) return message.reply('❌ Usage : `+warn @joueur [raison]`');

      db = getPlayer(db, target.id);
      if (!db.sanctions[target.id]) db.sanctions[target.id] = [];
      db.sanctions[target.id].push({ type: 'warn', raison, by: author.id, date: Date.now() });
      saveDB(db);

      const embed = new EmbedBuilder()
        .setTitle('⚠️ Avertissement')
        .setColor(0xFEE75C)
        .addFields(
          { name: 'Joueur', value: target.tag, inline: true },
          { name: 'Raison', value: raison, inline: true },
          { name: 'Par', value: author.tag, inline: true }
        )
        .setTimestamp();

      await logModeration(guild, embed);
      try { await target.send({ embeds: [embed] }); } catch {}
      return message.reply({ embeds: [embed] });
    }

    // ─── +setregle (Admin) ───────────────────────────────────────────────
    if (cmd === 'setregle') {
      if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');

      // Règles générales
      const reglesGenerales = [
        {
          titre: '📋 Règles Générales',
          description: '1️⃣ **Respect mutuel** — Soyez respectueux envers tous les joueurs\n2️⃣ **Pas de spam** — Évitez le flood et le spam de messages\n3️⃣ **Pas d\'insultes** — Les insultes sont interdites\n4️⃣ **Français obligatoire** — Parlez uniquement en français\n5️⃣ **Pas de cheating** — Les exploits/bugs sont interdits'
        },
        {
          titre: '🎭 Règles RP',
          description: '1️⃣ **Respect du RP** — Restez dans vos rôles\n2️⃣ **Pas de MG (Metagaming)** — Ne pas utiliser les infos OOC en IC\n3️⃣ **Pas de PG (PowerGaming)** — Ne pas forcer les actions\n4️⃣ **Immersion** — Utilisez /me /do /ooc pour vos actions\n5️⃣ **Personnage cohérent** — Gardez votre perso constant'
        },
        {
          titre: '👮 Règles de Modération',
          description: '1️⃣ **Écoute les modérateurs** — Respectez les décisions des modérateurs\n2️⃣ **Pas d\'appel privé** — Réclamez en modmail\n3️⃣ **Pas de discrim** — Aucune discrimination tolérée\n4️⃣ **Pas de doxxing** — Respectez la vie privée\n5️⃣ **Pas de pub** — Les pubs sont interdites'
        },
        {
          titre: '⚙️ Sanctions',
          description: '⚠️ **Warn** — Avertissement\n🔇 **Mute** — Silence temporaire\n👢 **Kick** — Expulsion du serveur\n🔨 **Ban** — Bannissement permanent\n\n*Les sanctions dépendent de la gravité de l\'infraction.*'
        }
      ];

      // Descriptions des salons
      const salonDescriptions = [
        {
          titre: '📰 Salon #annonces',
          description: 'Pour les annonces officielles du serveur et les mises à jour.\n\n**Commandes utiles :**\n• Aucune commande\n\n**À faire :** Consulter régulièrement les annonces'
        },
        {
          titre: '💬 Salon #general',
          description: 'Discussions générales et hors-RP (OOC).\n\n**Commandes utiles :**\n• `+help` — Voir l\'aide\n• `+metiers` — Voir les métiers\n\n**À faire :** Soyez respectueux et courtois'
        },
        {
          titre: '👥 Salon #profils',
          description: 'Affichage des profils RP des joueurs.\n\n**Commandes utiles :**\n• `+profil` — Voir ton profil\n• `+profil @joueur` — Voir le profil de quelqu\'un\n\n**À faire :** Consulter les profils avant interactions RP'
        },
        {
          titre: '💼 Salon #metiers',
          description: 'Informations sur les métiers et emplois disponibles.\n\n**Commandes utiles :**\n• `+metiers` — Voir tous les métiers\n• `+setjob @joueur [métier]` — Changer de métier (Admin)\n\n**À faire :** Choisir votre métier'
        },
        {
          titre: '🏦 Salon #banque',
          description: 'Gestion de l\'argent et transactions bancaires.\n\n**Commandes utiles :**\n• `+solde` — Voir ton argent\n• `+solde @joueur` — Voir le solde d\'un joueur\n\n**À faire :** Gérer votre finance IC'
        },
        {
          titre: '⚖️ Salon #justice',
          description: 'Procédures judiciaires et arrestations RP.\n\n**Commandes utiles :**\n• `+arrest @joueur [raison]` — Arrêter quelqu\'un\n• `+release @joueur` — Libérer quelqu\'un\n\n**À faire :** Respecter la justice IC'
        },
        {
          titre: '🏥 Salon #sante',
          description: 'Soins médicaux et urgences RP.\n\n**Commandes utiles :**\n• Zona réservée aux Médecins\n\n**À faire :** Appeler un médecin en cas de besoin'
        },
        {
          titre: '🚗 Salon #transport',
          description: 'Discussions sur les véhicules et transports RP.\n\n**Commandes utiles :**\n• Zona réservée aux Mécaniciens\n\n**À faire :** Entretenir vos véhicules'
        },
        {
          titre: '🎭 Salon #rp',
          description: 'Actions et échanges RP (scènes principales).\n\n**Commandes utiles :**\n• `/me [action]` — Effectuer une action\n• `/do [description]` — Décrire quelque chose\n• `/ooc [message]` — Parler hors-RP\n\n**À faire :** Rester dans vos rôles'
        },
        {
          titre: '📋 Salon #logs-bot',
          description: 'Logs automatiques des actions du bot (bans, kicks, mutes, etc).\n\n**Lecture seule** — Les modérateurs suivent ici les actions du serveur.'
        },
        {
          titre: '📋 Salon #logs-moderation',
          description: 'Logs des avertissements et sanctions (warns).\n\n**Lecture seule** — Historique de modération.'
        }
      ];

      try {
        // Envoyer les règles générales
        for (const regle of reglesGenerales) {
          const embed = new EmbedBuilder()
            .setTitle(regle.titre)
            .setDescription(regle.description)
            .setColor(0x5865F2)
            .setFooter({ text: 'Astra RP • Règles' });
          
          await message.channel.send({ embeds: [embed] });
        }

        // Envoyer les descriptions des salons
        await message.channel.send('');
        const embedSeparator = new EmbedBuilder()
          .setTitle('📍 Guide des Salons')
          .setDescription('Voici le guide complet de chaque salon et des commandes utiles :')
          .setColor(0xEB459E)
          .setFooter({ text: 'Astra RP • Salons' });
        await message.channel.send({ embeds: [embedSeparator] });

        for (const salon of salonDescriptions) {
          const embed = new EmbedBuilder()
            .setTitle(salon.titre)
            .setDescription(salon.description)
            .setColor(0xFEE75C)
            .setFooter({ text: 'Astra RP • Salons' });
          
          await message.channel.send({ embeds: [embed] });
        }

        return message.reply(`✅ **${reglesGenerales.length + salonDescriptions.length + 1}** messages de configuration générés !`);
      } catch (err) {
        return message.reply(`❌ Erreur : ${err.message}`);
      }
    }

    // ─── +setrenseignement (Admin) ────────────────────────────────────────
    if (cmd === 'setrenseignement') {
      if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');

      const metierDetails = [
        {
          emoji: '👮',
          nom: 'Police Nationale',
          salaire: '2500€/h',
          description: 'Protéger les citoyens et maintenir l\'ordre public.',
          conditions: '• Âge minimum : 15 ans (IC)\n• Casier judiciaire vierge\n• Formation obligatoire',
          devoirs: '• Patrouiller régulièrement\n• Arrêter les criminels\n• Respecter le code de déontologie\n• Communication radio obligatoire'
        },
        {
          emoji: '🏥',
          nom: 'Médecin / SAMU',
          salaire: '3500€/h',
          description: 'Soigner les blessés et gérer les urgences médicales.',
          conditions: '• Âge minimum : 18 ans (IC)\n• Diplôme de médecine requis\n• Formation SAMU',
          devoirs: '• Répondre aux urgences médicales\n• Respecter le secret médical\n• Tenir les dossiers patients\n• Être disponible en permanence'
        },
        {
          emoji: '🚒',
          nom: 'Pompier / Secours',
          salaire: '2800€/h',
          description: 'Intervenir sur les incendies, accidents et catastrophes.',
          conditions: '• Âge minimum : 16 ans (IC)\n• Bonne condition physique\n• Formation PSC1',
          devoirs: '• Intervenir sur les urgences\n• Sauver les vies\n• Évaluer les risques\n• Coordonner avec la police et SAMU'
        },
        {
          emoji: '🔧',
          nom: 'Mécanicien',
          salaire: '2200€/h',
          description: 'Réparer les véhicules et effectuer des révisions.',
          conditions: '• Âge minimum : 15 ans (IC)\n• Permis de conduire obligatoire\n• Connaissances mécaniques',
          devoirs: '• Réparer les véhicules\n• Afficher les tarifs\n• Faire des devis\n• Respecter les délais'
        },
        {
          emoji: '💊',
          nom: 'Pharmacien',
          salaire: '3000€/h',
          description: 'Délivrer les médicaments et gérer les stocks.',
          conditions: '• Âge minimum : 18 ans (IC)\n• Diplôme de pharmacie requis\n• Licence commerciale',
          devoirs: '• Vendre les médicaments\n• Vérifier les ordonnances\n• Gérer l\'inventaire\n• Respecter les lois sanitaires'
        }
      ];

      try {
        let message_count = 0;
        for (const metier of metierDetails) {
          const embed = new EmbedBuilder()
            .setTitle(`${metier.emoji} ${metier.nom}`)
            .setColor(0xEB459E)
            .addFields(
              { name: '💰 Salaire', value: metier.salaire, inline: true },
              { name: '📖 Description', value: metier.description, inline: false },
              { name: '✅ Conditions d\'accès', value: metier.conditions, inline: false },
              { name: '📋 Devoirs', value: metier.devoirs, inline: false }
            )
            .setFooter({ text: 'Astra RP • Métiers' });
          
          await message.channel.send({ embeds: [embed] });
          message_count++;
        }

        return message.reply(`✅ **${message_count}** renseignements métiers générés !`);
      } catch (err) {
        return message.reply(`❌ Erreur : ${err.message}`);
      }
    }

    // ─── +stats (Admin) ───────────────────────────────────────────────────
    if (cmd === 'stats') {
      if (!isAdmin) return message.reply('❌ Réservé aux administrateurs.');

      const totalPlayers = Object.keys(db.players).length;
      const createdChars = Object.values(db.players).filter(p => p.created).length;
      const totalCash = Object.values(db.bank).reduce((acc, b) => acc + (b.cash + b.bank), 0);
      
      const jobsCount = {};
      Object.values(db.players).forEach(p => {
        if (p.job && p.job !== 'Sans emploi') {
          jobsCount[p.job] = (jobsCount[p.job] || 0) + 1;
        }
      });
      const topJob = Object.entries(jobsCount).sort((a, b) => b[1] - a[1])[0];

      const embed = new EmbedBuilder()
        .setTitle('📊 Statistiques du Serveur')
        .setColor(0x5865F2)
        .addFields(
          { name: '👥 Joueurs', value: `${totalPlayers}`, inline: true },
          { name: '🎭 Persos créés', value: `${createdChars}`, inline: true },
          { name: '💰 Argent total', value: `${totalCash}€`, inline: true },
          { name: '💼 Métier populaire', value: topJob ? `${topJob[0]} (${topJob[1]})` : 'N/A', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Astra RP' });

      return message.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.error('❌ Erreur commande:', err);
    message.reply('❌ Une erreur s\'est produite.').catch(() => {});
  }
});

// ─── GESTION DES ERREURS GLOBALES ──────────────────────────────────────────
client.on('error', err => console.error('❌ Client Error:', err));
process.on('unhandledRejection', err => console.error('❌ Unhandled Rejection:', err));

// ─── CONNEXION ─────────────────────────────────────────────────────────────
client.login(TOKEN).catch(err => {
  console.error('❌ Erreur login:', err.message);
  process.exit(1);
});

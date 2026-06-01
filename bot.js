const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, SlashCommandBuilder, REST, Routes, ChannelType } = require('discord.js');
const fs = require('fs');

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

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ TOKEN ou CLIENT_ID manquant !');
  process.exit(1);
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
    const logChan = guild.channels.cache.find(c => c.name === 'logs-bot' || c.name === '📋・logs-bot');
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

  // Enregistrer les slash commands
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

    // Vérifier si admin
    const isAdmin = interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator);

    // ─── /setup ───────────────────────────────────────────────────────────
    if (commandName === 'setup') {
      if (!isAdmin) {
        return interaction.reply({ content: '❌ Seuls les administrateurs peuvent faire le setup.', ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: false });

      try {
        // Créer la catégorie principale
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

        // Créer les salons
        const channels = [
          { name: '📰-annonces', type: ChannelType.GuildText },
          { name: '💬-general', type: ChannelType.GuildText },
          { name: '👥-profils', type: ChannelType.GuildText },
          { name: '💼-metiers', type: ChannelType.GuildText },
          { name: '🏦-banque', type: ChannelType.GuildText },
          { name: '⚖️-justice', type: ChannelType.GuildText },
          { name: '🏥-sante', type: ChannelType.GuildText },
          { name: '🚗-transport', type: ChannelType.GuildText },
          { name: '🎭-rp', type: ChannelType.GuildText },
          { name: '⚙️-logs-bot', type: ChannelType.GuildText },
          { name: '📋-logs-moderation', type: ChannelType.GuildText },
        ];

        for (const channelData of channels) {
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

        // Créer les rôles
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
          .setDescription('Tous les salons et rôles ont été créés avec succès.')
          .addFields(
            { name: '📋 Catégorie', value: `${category.name}`, inline: false },
            { name: '💬 Salons créés', value: `${channels.length} salons`, inline: true },
            { name: '👥 Rôles créés', value: `${roles.length} rôles`, inline: true }
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

    // Charger DB
    let db = loadDB();
    db = getPlayer(db, author.id);

    // Vérifier si admin
    const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

    // ─── +help ───────────────────────────────────────────────────────────────
    if (cmd === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('📖 Aide — Astra RP')
        .setColor(0x5865F2)
        .addFields(
          { name: '💬 Commandes de base', value: '`+profil` — Voir ton profil\n`+solde` — Voir ton argent\n`+metiers` — Voir les métiers\n`+inventaire` — Voir ton inventaire' },
          { name: '👮 Commandes RP', value: '`+arrest @joueur [raison]` — Arrêter quelqu\'un\n`+release @joueur` — Libérer quelqu\'un' },
          { name: '⚙️ Admin', value: '`+setjob @joueur [métier]` — Changer le métier\n`+warn @joueur [raison]` — Avertir\n`+stats` — Statistiques' }
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

    // ─── +arrest (Police) ─────────────────────────────────────────────────
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

    // ─── +release (Police) ────────────────────────────────────────────────
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

import DiscordBasePlugin from './discord-base-plugin.js';

export default class Balance extends DiscordBasePlugin {
  static get description() {
    return 'The <code>Balance</code> plugin is used to move players between teams for improved balance.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      ...DiscordBasePlugin.optionsSpecification,
      command: {
        required: false,
        description: 'The command word used for balancing the teams.',
        default: 'balance'
      },
      delay: {
        required: false,
        description: 'Delay (in seconds) before moving players after round ends.',
        default: 20
      },
      channelID: {
        required: true,
        description: 'Discord channel to send notifications to.',
        default: ''
      },
      sendDiscordMessage: {
        required: false,
        description: 'Send a Discord message when players are moved.',
        default: true
      },
      ticketDifferenceLimit: {
        required: false,
        description: 'Alert admins when the ticket difference exceeds this limit. 0 disables.',
        default: 150
      },
      ticketAlertCooldown: {
        required: false,
        description: 'Seconds before admins are re-alerted while the imbalance persists.',
        default: 300
      },
      clanMinSize: {
        required: false,
        description:
          'Minimum number of players sharing a prefix to be listed as a clan in the imbalance alert.',
        default: 4
      },
      autoBalanceEnabled: {
        required: false,
        description:
          'Automatically move the largest clan on the winning team to the losing team after a ' +
          'severely unbalanced round where no players were marked for balancing.',
        default: true
      },
      autoBalanceTicketDifference: {
        required: false,
        description: 'Round-end ticket difference that must be reached to trigger automatic balancing.',
        default: 200
      },
      autoBalanceClanMinSize: {
        required: false,
        description: 'Minimum number of players sharing a prefix to be considered a clan for automatic balancing.',
        default: 2
      },
      autoBalanceMaxPlayers: {
        required: false,
        description: 'Maximum number of players moved by automatic balancing. Larger clans are split.',
        default: 9
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.markedPlayers = [];
    this.announced = false;
    this.lastTicketAlert = 0;
    this.ticketAlertActive = false;
    this.autoBalanced = false;
    this.autoBalanceClan = null;
    this.roundInProgress = true;

    this.onChatCommand = this.onChatCommand.bind(this);
    this.onRoundEnded = this.onRoundEnded.bind(this);
    this.onSquadsUpdated = this.onSquadsUpdated.bind(this);
    this.onNewGame = this.onNewGame.bind(this);
  }

  async mount() {
    this.server.on(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
    this.server.on('ROUND_ENDED', this.onRoundEnded);
    this.server.on('UPDATED_SQUAD_INFORMATION', this.onSquadsUpdated);
    this.server.on('NEW_GAME', this.onNewGame);
  }

  async unmount() {
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
    this.server.removeEventListener('ROUND_ENDED', this.onRoundEnded);
    this.server.removeEventListener('UPDATED_SQUAD_INFORMATION', this.onSquadsUpdated);
    this.server.removeEventListener('NEW_GAME', this.onNewGame);
  }

  onNewGame() {
    this.ticketAlertActive = false;
    this.announced = false;
    this.roundInProgress = true;
  }

  normalizePrefix(prefix) {
    if (!prefix) return '';
    return prefix.replace(/\W/g, '').toUpperCase();
  }

  getClansOnTeam(teamID, minSize) {
    const counts = new Map();
    for (const player of this.server.players) {
      if (+player.teamID !== +teamID) continue;
      const prefix = this.normalizePrefix(player.prefix);
      if (!prefix) continue;
      counts.set(prefix, (counts.get(prefix) || 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, count]) => count >= minSize)
      .sort((a, b) => b[1] - a[1]);
  }

  isAdmin(steamID) {
    return steamID in this.server.admins && this.server.admins[steamID].chat;
  }

  async onSquadsUpdated() {
    if (this.server.currentLayer?.gamemode === 'Invasion') return;
    if (this.markedPlayers.length > 0) return;
    if (!this.options.ticketDifferenceLimit) return;
    if (!this.roundInProgress) return;

    const [t1, t2] = this.server.tickets;
    if (t1 === undefined || t2 === undefined) return;
    const diff = Math.abs(t1 - t2);
    const teams = this.server.currentTeams;

    if (diff < this.options.ticketDifferenceLimit) {
      if (this.ticketAlertActive)
        this.verbose(1, `Ticket imbalance resolved (difference ${diff}).`);
      this.ticketAlertActive = false;
      return;
    }

    const now = Date.now();
    if (this.ticketAlertActive &&
        now - this.lastTicketAlert < this.options.ticketAlertCooldown * 1000)
      return;
    this.ticketAlertActive = true;
    this.lastTicketAlert = now;

    const team1 = teams?.[0]?.faction || 'Team 1';
    const team2 = teams?.[1]?.faction || 'Team 2';
    const leadingTeamID = t1 > t2 ? 1 : 2;
    const leadingTeam = t1 > t2 ? team1 : team2;
    const clans = this.getClansOnTeam(leadingTeamID, this.options.clanMinSize);
    let message =
      'Balance alert!\n\n' +
      `${leadingTeam} is leading by a large margin.\n`;
    if (clans.length) {
      message +=
        '\nClans on leading team:\n' +
        clans.map(([prefix, count]) => `- ${prefix} (${count} players)`).join('\n');
    }
    else {
      message += 'Consider balancing.';
    }
    this.verbose(1, `Ticket imbalance: ${team1} ${t1} vs ${team2} ${t2} (difference ${diff}).`);

    for (const p of this.server.players) {
      if (this.isAdmin(p.steamID)) {
        await this.server.rcon.warn(p.steamID, message);
      }
    }
  }

  showStatus(admin) {
    let adminWarn = `${this.markedPlayers.length} players selected for balancing:`;
    for (const player of this.markedPlayers)
      adminWarn += '\n' + player.name;
    this.server.rcon.warn(admin.eosID, adminWarn);
  }

  markPlayers(playerList, admin) {
    for (const player of playerList) {
      if (!this.markedPlayers.includes(player))
        this.markedPlayers.push(player);
      this.server.rcon.warn( player.eosID,
                             'Balancing:\n' +
                             'You will be team-switched after this round.');
    }
    this.showStatus(admin);
  }

  markClan(name, admin) {
    // Regex pattern is:
    // - Up to 3 chars allowed before clan name
    // - Clan name must be separate from other words
    const regex = new RegExp(`^.{0,3}\\b${name}\\b`, 'i');
    const teams = [[], []];
    for (const player of this.server.players) {
      if (player.name.toLowerCase().match(regex)) {
        teams[player.teamID - 1].push(player);
      }
    }
    if (teams[0].length === teams[1].length) {
      this.server.rcon.warn(
        admin.eosID,
        'Balancing error:\n' +
          `There are ${teams[0].length} "${name}" players on both sides.`);
      return;
    }

    if (teams[0].length >= teams[1].length)
      this.markPlayers(teams[0], admin);
    else
      this.markPlayers(teams[1], admin);
  }

  markSquad(squadID, admin) {
    const players = [];

    this.server.updatePlayerList(this);

    for (const player of this.server.players) {
      if (player.teamID === admin.teamID && player.squadID === squadID) {
        players.push(player);
      }
    }
    this.markPlayers(players, admin);
  }

  markPlayer(name, admin) {
    const matchedPlayers = [];
    for (const player of this.server.players) {
      if (player.name.toLowerCase().includes(name)) {
        matchedPlayers.push(player);
      }
    }
    if (matchedPlayers.length === 1) {
      if (!this.announced) {
        this.server.rcon.broadcast('Teams will be balanced next round.');
        this.announced = true;
      }
      this.markPlayers(matchedPlayers, admin);
    }
    else {
      this.server.rcon.warn(
        admin.eosID,
        'Balancing error:\n' +
          `Name "${name}" matched ${matchedPlayers.length} players.`);
    }
  }

  clearPlayer(name, admin) {
    const matchedPlayers = [];
    for (const player of this.server.players) {
      if (player.name.toLowerCase().includes(name)) {
        matchedPlayers.push(player);
      }
    }

    if (matchedPlayers.length === 1) {
      const player = matchedPlayers[0];
      const index = this.markedPlayers.indexOf(player);
      this.server.rcon.warn(player.eosID,
                            'Balancing:\n' +
                            'You are no longer selected for team-switch.');
      this.markedPlayers.splice(index, 1);
    }
    else
      this.server.rcon.warn( admin.eosID,
                             'Balancing error:\n' +
                             `Name "${name}" matched ${matchedPlayers.length} selected players.`);
  }

  clearAll(admin) {
    for (const player of this.markedPlayers) {
      this.server.rcon.warn(player.eosID,
                            'Balancing:\n' +
                            'You are no longer selected for team-switch.');
    }
    this.server.rcon.warn(admin.eosID,
                          'Balancing:\n' +
                          `Cleared all ${this.markedPlayers.length} players off list`);
    this.markedPlayers = [];
  }

  showHelp(admin) {
    const help =
      '!balance commands:\n' +
      ' clan XXX\n' +
      ' player XXX\n' +
      ' squad N\n' +
      ' clear\n' +
      ' clear XXX\n' +
      ' list\n';
    this.server.rcon.warn(admin.eosID, help);
  }

  async onChatCommand(info) {
    if (info.chat !== 'ChatAdmin')
      return;

    const admin = info.player;
    const words = info.message.toLowerCase().split(' ');

    if (words[0] === 'clan' && words.length > 1)
      this.markClan(words[1].toLowerCase(), admin);
    else if (words[0] === 'squad' && words.length > 1)
      this.markSquad(parseInt(words[1].toLowerCase()), admin);
    else if (words[0] === 'player' && words.length > 1)
      this.markPlayer(words[1].toLowerCase(), admin);
    else if (words[0] === 'clear') {
      if (words.length > 1)
        this.clearPlayer(words[1], admin);
      else
        this.clearAll(admin);
    }
    else if (words[0] === 'list')
      this.showStatus(admin);
    else
      this.showHelp(admin);
  }

  autoBalance(info) {
    if (!this.options.autoBalanceEnabled) return false;
    if (this.server.currentLayer?.gamemode === 'Invasion') return false;
    if (!info?.winner || !info?.loser) return false;
    if (this.markedPlayers.length > 0) return false;

    const ticketDiff = +info.winner.tickets - +info.loser.tickets;
    if (ticketDiff < this.options.autoBalanceTicketDifference) return false;

    const winnerTeam = +info.winner.team;
    if (winnerTeam !== 1 && winnerTeam !== 2) return false;

    // Clans are sorted largest first; always pick the largest one.
    const [clan] = this.getClansOnTeam(winnerTeam, this.options.autoBalanceClanMinSize);
    if (!clan) {
      this.verbose(1, `Auto-balance: ticket difference ${ticketDiff} but no clan on winning team.`);
      return false;
    }

    // Cap the number of moved players; an oversized clan is split.
    const [prefix, clanSize] = clan;
    const players = this.server.players
      .filter((p) => +p.teamID === winnerTeam && this.normalizePrefix(p.prefix) === prefix)
      .slice(0, this.options.autoBalanceMaxPlayers);
    if (players.length === 0) return false;
    const split = players.length < clanSize;

    const splitMessage = split
      ? `${players.length} of ${clanSize} members will be moved, including you.\n`
      : '';
    const message =
      'Team balance:\n' +
      'Your clan has been auto-selected for balancing.\n' +
      splitMessage +
      'You will be team-switched shortly.';

    for (const player of players) {
      this.markedPlayers.push(player);
      this.server.rcon.warn(player.eosID, message);
    }

    this.autoBalanced = true;
    this.autoBalanceClan = split ? `${prefix} (${players.length} of ${clanSize})` : prefix;
    this.verbose(
      1,
      `Auto-balance: Ticket difference ${ticketDiff}, ` +
      `moving clan ${prefix} (${players.length}${split ? ` of ${clanSize}` : ''} players).`
    );
    return true;
  }

  async onRoundEnded(info) {
    this.announced = false;
    this.roundInProgress = false;
    this.autoBalance(info);
    if (!this.markedPlayers.length) return;
    this.timeout = setTimeout(this.announceBalance, 2000, this);
    this.timeout = setTimeout(this.movePlayers, this.options.delay * 1000, this, info);
  }

  announceBalance(obj) {
    obj.server.rcon.broadcast(`Teams are being ${obj.autoBalanced ? 'auto ' : ''}balanced.`);
  }

  async movePlayers(obj, info) {
    const playerNames = [];
    for (const player of obj.markedPlayers) {
      obj.server.rcon.switchTeam(player.eosID);
      playerNames.push(player.name);
    }

    obj.verbose(1, `Balancing ${playerNames}`);
    let ticketDiff = 0;
    if (info.winner)
      ticketDiff = info.winner.tickets - info.loser.tickets;

    const fields = [
      {
        name: 'Layer',
        value: obj.server.currentLayer.name
      },
      {
        name: 'Ticket difference',
        value: `${ticketDiff}`
      }
    ];
    if (obj.autoBalanced && obj.autoBalanceClan)
      fields.push({ name: 'Clan', value: obj.autoBalanceClan });
    fields.push({
      name: 'Moved players',
      value: playerNames.join('\n')
    });

    try {
      if (!obj.options.sendDiscordMessage) return;
      await obj.sendDiscordMessage({
        embed: {
          title: obj.autoBalanced ? 'Automatic team balancing performed' : 'Team balancing performed',
          color: obj.options.color,
          fields,
          footer: '',
          timestamp: info.time.toISOString()
        }
      });
    } finally {
      obj.markedPlayers = [];
      obj.autoBalanced = false;
      obj.autoBalanceClan = null;
    }
  }
}

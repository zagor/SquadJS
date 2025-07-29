import BasePlugin from './base-plugin.js';

export default class Balance extends BasePlugin {
  static get description() {
    return (
      "The <code>Balance</code> plugin is used to move players between teams for improved balance."
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      command: {
        required: false,
        description: 'The command word used for balancing the teams.',
        default: 'balance'
      },
      delay: {
        required: false,
        description: 'Delay (in seconds) before moving players after round ends.',
        default: 20
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.markedPlayers = [];

    this.onChatCommand = this.onChatCommand.bind(this);
    this.onRoundEnded = this.onRoundEnded.bind(this);
  }

  async mount() {
    this.server.on(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
    this.server.on('ROUND_ENDED', this.onRoundEnded);
  }

  async unmount() {
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.command}`,
                                    this.onChatCommand);
    this.server.removeEventListener('ROUND_ENDED', this.onRoundEnded);
  }

  showStatus(admin) {
    let adminWarn = `${this.markedPlayers.length} players marked for balance:`;
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
    let teams = [[],[]];
    for (const player of this.server.players) {
      if (player.name.toLowerCase().match(regex)) {
        teams[player.teamID-1].push(player);
      }
    }
    if (teams[0].length == teams[1].length) {
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
      if (player.teamID == admin.teamID && player.squadID == squadID) {
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
    if (matchedPlayers.length === 1)
      this.markPlayers(matchedPlayers, admin);
    else
      this.server.rcon.warn(
        admin.eosID,
        'Balancing error:\n' +
        `Name "${name}" matched ${matchedPlayers.length} players.`);
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
                            'You are no longer marked for team-switch.');
      this.markedPlayers.splice(index, 1);
    }
    else
      this.server.rcon.warn( admin.eosID,
                             'Balancing error:\n' +
                             `Name "${name}" matched ${matchedPlayers.length} marked players.`);
  }

  clearAll(admin) {
    for (const player of this.markedPlayers) {
      this.server.rcon.warn(player.eosID,
                            'Balancing:\n' +
                            'You are no longer marked for team-switch.');
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

  async onRoundEnded(info) {
    if (!this.markedPlayers.length) return;
    this.timeout = setTimeout(this.movePlayers, this.options.delay * 1000, this);
    for (const player of this.markedPlayers) {
      this.server.rcon.warn(player.eosID,
                            'Balancing:\n' +
                            `You will be team-switched in ${this.options.delay} seconds.`);
    }
  }

  async movePlayers(obj) {
    obj.server.rcon.broadcast('Teams are being balanced.');
    for (const player of obj.markedPlayers) {
      obj.server.rcon.switchTeam(player.eosID);
    }
    obj.markedPlayers = [];
  }
}

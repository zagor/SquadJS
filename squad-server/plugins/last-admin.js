import BasePlugin from './base-plugin.js';

export default class LastAdmin extends BasePlugin {
  static get description() {
    return (
      "The <code>LastAdmin</code> plugin informs admin when they are the last online."
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      chat_command: {
        required: false,
        description: '"Show admins" chat command.',
        default: "admins"
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onPlayerConnected = this.onPlayerConnected.bind(this);
    this.onPlayerDisconnected = this.onPlayerDisconnected.bind(this);
    this.onAdminsCommand = this.onAdminsCommand.bind(this);
    this.adminList = {};
    this.adminsOnline = [[], [], []]; // total, team1, team2
  }

  isAdmin(steamID) {
    return steamID in this.adminList;
  }

  async mount() {
    this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
    this.server.on('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
    this.server.on(`CHAT_COMMAND:${this.options.chat_command}`, this.onAdminsCommand);

    for (const [id, perms] of Object.entries(this.server.admins)) {
      if ('canseeadminchat' in perms) {
        this.adminList[id] = true;
      }
    }

    const admins = this.server.players.filter(p => this.isAdmin(p.steamID));
    this.adminsOnline = [admins.map(p => p.steamID),
                         admins.filter(p => p.teamID == 1).map(p => p.steamID),
                         admins.filter(p => p.teamID == 2).map(p => p.steamID)];
    this.verbose(1, "Admins online:", this.adminsOnline);
  }

  async unmount() {
    this.server.unmount('PLAYER_CONNECTED', this.onPlayerConnected);
    this.server.unmount('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
  }

  async onAdminsCommand(info) {
    if (info.chat !== 'ChatAdmin') {
      this.verbose(1, 'Wrong chat');
      return;
    }

    this.verbose(1, 'Got chat %o', info);
    const thisTeam = info.player.teamID;
    const otherTeam = 3 - info.player.teamID;
    this.server.rcon.warn(info.player.eosID,
                          `There are ${this.adminsOnline[thisTeam].length} admins on your team (including you) and ${this.adminsOnline[otherTeam].length} on the opposite team.`);
  }

  onPlayerConnected(info) {
    if (!this.isAdmin(info.player.steamID))
      return;

    this.adminsOnline[0].push(info.player.steamID);
    this.adminsOnline[info.player.teamID].push(info.player.steamID);
    this.verbose(1, "Admins online:", this.adminsOnline);
  }

  onPlayerDisconnected(info) {
    if (!this.isAdmin(info.player.steamID))
      return;
    this.adminsOnline[0].splice(this.adminsOnline[0].indexOf(info.player.steamID), 1)
    this.adminsOnline[info.player.teamID].splice(this.adminsOnline[info.player.teamID].indexOf(info.player.steamID), 1)

    if (this.adminsOnline[0].length === 1) {
      this.server.rcon.warn(this.adminsOnline[0][0],
                            'You are the last admin on the server.');
    }
    else if (this.adminsOnline[info.player.teamID].length === 1) {
      const otherTeam = 3 - info.player.teamID;
      this.server.rcon.warn(
        this.adminsOnline[teamID][0],
        'You are the last admin on your team. ' +
          `There are ${this.adminsOnline[otherTeam].length} admins on the opposite team.`);
    }
    this.verbose(1, "Admins online:", this.adminsOnline);
  }
}

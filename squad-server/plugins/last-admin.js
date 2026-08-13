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
    this.onPlayerTeamChange = this.onPlayerTeamChange.bind(this);
    this.onAdminsCommand = this.onAdminsCommand.bind(this);
    this.adminsOnline = []; // total, team1, team2
  }

  isAdmin(steamID) {
    return steamID in this.server.admins && this.server.admins[steamID].chat;
  }

  async mount() {
    this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
    this.server.on('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
    this.server.on('PLAYER_TEAM_CHANGE', this.onPlayerTeamChange);
    this.server.on(`CHAT_COMMAND:${this.options.chat_command}`, this.onAdminsCommand);

    const admins = this.server.players.filter(p => this.isAdmin(p.steamID));
    this.adminsOnline = [new Set(admins.map(p => p.steamID)),
                         new Set(admins.filter(p => p.teamID === 1).map(p => p.steamID)),
                         new Set(admins.filter(p => p.teamID === 2).map(p => p.steamID))];
    this.verbose(1, "Admins online:", this.adminsOnline);
  }

  async unmount() {
    this.server.removeListener('PLAYER_CONNECTED', this.onPlayerConnected);
    this.server.removeListener('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
    this.server.removeListener('PLAYER_TEAM_CHANGE', this.onPlayerTeamChange);
    this.server.removeListener(`CHAT_COMMAND:${this.options.chat_command}`, this.onAdminsCommand);
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
                          `There are ${this.adminsOnline[thisTeam].size} admins on your team (including you) and ${this.adminsOnline[otherTeam].size} on the opposite team.`);
  }

  onPlayerConnected(info) {
    if (!this.isAdmin(info.player.steamID))
      return;

    this.adminsOnline[0].add(info.player.steamID);
    this.adminsOnline[info.player.teamID].add(info.player.steamID);
    this.verbose(1, "Admin", info.player.name, info.player.steamID, "connected");
    this.verbose(2, "Admins online:", this.adminsOnline);
  }

  onPlayerTeamChange(info) {
    if (!info.player || !info.oldTeamID || !info.newTeamID) {
      this.verbose(1, "*** Error: Missing data in PLAYER_TEAM_CHANGE. info =", info);
      return;
    }

    if (!this.isAdmin(info.player.steamID))
      return;

    this.adminsOnline[info.oldTeamID].delete(info.player.steamID);
    this.adminsOnline[info.newTeamID].add(info.player.steamID);
    this.verbose(1, "Admin", info.player.name, info.player.steamID, "switched teams");
    this.verbose(2, "Admins online after team change:", this.adminsOnline);
  }

  onPlayerDisconnected(info) {
    if (!info.player) {
      this.verbose(1, "*** Error: No player in PLAYER_DISCONNECTED:", info);
      return;
    }
    if (!this.isAdmin(info.player.steamID))
      return;
    this.adminsOnline[0].delete(info.player.steamID)
    this.adminsOnline[1].delete(info.player.steamID)
    this.adminsOnline[2].delete(info.player.steamID)

    if (this.adminsOnline[0].size === 1) {
      this.adminsOnline[0].forEach((eosid) => {
        this.server.rcon.warn(eosid, 'You are the last admin on the server.');
      });
    }
    else if (info.player.teamID &&
             this.adminsOnline[info.player.teamID].size === 1) {
      const otherTeam = 3 - info.player.teamID;
      this.adminsOnline[info.player.teamID].forEach((eosid) => {
        this.server.rcon.warn(
          eosid,
          'You are the last admin on your team. ' +
            `There are ${this.adminsOnline[otherTeam].size} admins on the opposite team.`);
      });
    }
    this.verbose(1, "Admin", info.player.name, info.player.steamID, "disconnected");
    this.verbose(2, "Admins online:", this.adminsOnline);
  }
}

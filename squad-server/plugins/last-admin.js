import BasePlugin from './base-plugin.js';

export default class LastAdmin extends BasePlugin {
  static get description() {
    return 'The <code>LastAdmin</code> plugin informs admin when they are the last online.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      chat_command: {
        required: false,
        description: '"Show admins" chat command.',
        default: 'admins'
      },
      welcome_delay: {
        required: false,
        description: 'Delay (in seconds) before showing the admin list to a joining admin.',
        default: 5
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onPlayerConnected = this.onPlayerConnected.bind(this);
    this.onPlayerDisconnected = this.onPlayerDisconnected.bind(this);
    this.updateAdminsOnline = this.updateAdminsOnline.bind(this);
    this.onPlayerPrefix = this.onPlayerPrefix.bind(this);
    this.onAdminsCommand = this.onAdminsCommand.bind(this);
    this.adminsOnline = []; // total, team1, team2 (Maps of eosID -> player)
  }

  isAdmin(steamID) {
    return steamID in this.server.admins && this.server.admins[steamID].chat;
  }

  listAdmins(teamID) {
    return [...this.adminsOnline[teamID].values()].map((p) => p.name).join(', ');
  }

  updateAdminsOnline() {
    const admins = this.server.players.filter((p) => this.isAdmin(p.steamID));
    this.adminsOnline = [
      new Map(admins.map((p) => [p.eosID, p])),
      new Map(admins.filter((p) => p.teamID === 1).map((p) => [p.eosID, p])),
      new Map(admins.filter((p) => p.teamID === 2).map((p) => [p.eosID, p]))
    ];
  }

  async mount() {
    this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
    this.server.on('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
    this.server.on('UPDATED_PLAYER_INFORMATION', this.updateAdminsOnline);
    this.server.on('PLAYER_PREFIX', this.onPlayerPrefix);
    this.server.on(`CHAT_COMMAND:${this.options.chat_command}`, this.onAdminsCommand);
    this.updateAdminsOnline();
  }

  async unmount() {
    this.server.removeListener('PLAYER_CONNECTED', this.onPlayerConnected);
    this.server.removeListener('PLAYER_DISCONNECTED', this.onPlayerDisconnected);
    this.server.removeListener('UPDATED_PLAYER_INFORMATION', this.updateAdminsOnline);
    this.server.removeListener('PLAYER_PREFIX', this.onPlayerPrefix);
    this.server.removeListener(`CHAT_COMMAND:${this.options.chat_command}`, this.onAdminsCommand);
  }

  async showAdmins(player, prefix = '') {
    const thisTeam = player.teamID;
    const otherTeam = 3 - player.teamID;
    const msg =
      prefix +
      `${this.adminsOnline[thisTeam].size} admins on your team: ${this.listAdmins(thisTeam)}\n` +
      `${this.adminsOnline[otherTeam].size} admins on other team: ${this.listAdmins(otherTeam)}`;
    await this.server.rcon.warn(player.eosID, msg);
  }

  logAdmins() {
    this.verbose(2, `${this.adminsOnline[1].size} admins on team 1:`, this.listAdmins(1));
    this.verbose(2, `${this.adminsOnline[2].size} admins on team 2:`, this.listAdmins(2));
  }

  async onAdminsCommand(info) {
    if (info.chat !== 'ChatAdmin') {
      this.verbose(1, 'Wrong chat');
      return;
    }
    await this.showAdmins(info.player);
  }

  onPlayerConnected(info) {
    if (!this.isAdmin(info.player.steamID)) return;

    this.adminsOnline[0].set(info.player.eosID, info.player);
    this.adminsOnline[info.player.teamID].set(info.player.eosID, info.player);
    this.verbose(1, 'Admin', info.player.name, 'connected');
    this.logAdmins();
  }

  onPlayerPrefix(info) {
    if (!this.isAdmin(info.player.steamID)) return;
    const eosID = info.player.eosID;
    setTimeout(async () => {
      try {
        // look up the current team; AutoSwitch may have moved the player since the event
        const player = this.server.players.find((p) => p.eosID === eosID);
        if (!player?.teamID) return;
        await this.showAdmins(player, `Welcome admin!\n\n`);
      } catch (error) {
        this.verbose(1, 'Failed to welcome admin:', error);
      }
    }, this.options.welcome_delay * 1000);
  }

  async onPlayerDisconnected(info) {
    if (!info.player || !this.isAdmin(info.player.steamID)) return;

    // The cached player list still contains the player until the next refresh
    for (const admins of this.adminsOnline) admins.delete(info.player.eosID);
    this.verbose(1, 'Admin', info.player.name, 'disconnected');

    if (this.adminsOnline[0].size === 1) {
      const [admin] = this.adminsOnline[0].values();
      await this.server.rcon.warn(admin.eosID, 'You are the last admin on the server.');
    } else if (info.player.teamID && this.adminsOnline[info.player.teamID].size === 1) {
      const [admin] = this.adminsOnline[info.player.teamID].values();
      await this.showAdmins(admin, 'You are the last admin on your team.\n\n');
    }
    this.logAdmins();
  }
}

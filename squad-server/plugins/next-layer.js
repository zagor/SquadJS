import BasePlugin from './base-plugin.js';

export default class NextLayer extends BasePlugin {
  static get description() {
    return (
      "The <code>NextLayer</code> plugin shows next layer in a friendly way."
    );
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      command: {
        required: false,
        description: 'The command word used for showing next layer.',
        default: 'nextlayer'
      },
      on_seed: {
        required: false,
        description: 'Broadcast during seed.',
        default: false,
      },
      broadcast_interval: {
        required: false,
        description: 'The interval for broadcasting next layer, in minutes. 0 to disable.',
        default: 30
      },
      warn_admins_late_night: {
        required: false,
        description: 'Warn admins late at night.',
        default: false,
      },
      late_night_time: {
        required: false,
        description: 'After what time to start warning admins.',
        default: '21:30',
      },
      warn_admins_late_seed: {
        required: false,
        description: 'Warn admins late on seed.',
        default: false,
      },
      late_seed_player_count: {
        required: false,
        description: 'After what player count to start warning admins.',
        default: 50,
      },
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onChatCommand = this.onChatCommand.bind(this);
    this.onNewGame = this.onNewGame.bind(this);
    this.onRoundEnded = this.onRoundEnded.bind(this);
    this.broadcastTimer = undefined;
    this.adminList = new Set();
  }

  async mount() {
    this.server.on(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on('ROUND_ENDED', this.onRoundEnded);
    this.startMidGameTimer();

    // make a list of all registered admins
    for (const [id, perms] of Object.entries(this.server.admins)) {
      if ('canseeadminchat' in perms) {
        this.adminList.add(id);
      }
    }
  }

  isAdmin(steamID) {
    return this.adminList.has(steamID);
  }

  async unmount() {
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
  }

  startMidGameTimer() {
    if (!this.options.on_seed && this.server.currentLayer.name.includes('Seed'))
      return;
    const now = new Date();
    let timer = this.server.matchStartTime;
    while (timer < now) {
      timer = new Date(timer.valueOf() + this.options.broadcast_interval * 60000);
    }
    const delay = timer - now;
    this.verbose(1, `First broadcast in ${Math.round(delay / 60000)} minutes.`);
    this.broadcastTimer = setInterval(this.onTimerExpiry, delay, this);
  }

  startTimer() {
    const delay = this.options.broadcast_interval * 60000;
    this.broadcastTimer = setInterval(this.onTimerExpiry, delay, this);
  }

  onNewGame() {
    if (this.options.on_seed || !this.server.currentLayer.name.includes('Seed'))
      this.startTimer();
    else
      this.verbose(1, "No broadcast during seed.");
  }

  onRoundEnded() {
    clearInterval(this.broadcastTimer);
  }

  async getLayerText() {
    await this.server.updateLayerInformation();
    const unitRegex = /(\w+)_(\w+)_(\w+)/;
    let units = [];
    for (const team of this.server.nextTeams) {
      const parts = team.unit.unitObjectName.match(unitRegex);
      units.push(`${parts[1]} ${parts[3]}`);
    }
    return `Next layer is ${this.server.nextLayer.name}\n${units[0]} vs ${units[1]}`;
  }

  isTimeLater(input) {
    const [hour, minute] = input.split(':').map(Number);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const inputMinutes = hour * 60 + minute;
    return currentMinutes >= inputMinutes;
  }

  maybeWarnAdmins(text) {
    if ((this.options.warn_admins_late_night &&
         this.isTimeLater(this.options.late_night_time)) ||
        (this.options.warn_admins_late_seed &&
         this.server.currentLayer.name.includes('Seed') &&
         this.server.players.length >= this.options.late_seed_player_count)) {
      for (const player of this.server.players.filter(p => this.isAdmin(p.steamID))) {
        this.server.rcon.warn(player.steamID, text);
      }
    }
  }

  async onTimerExpiry(obj) {
    const text = await obj.getLayerText();
    obj.verbose(1, "Timed broadcast");
    obj.server.rcon.broadcast(text);
    obj.maybeWarnAdmins(text);
  }

  async onChatCommand(info) {
    try {
      const text = await this.getLayerText();
      if (info.chat === 'ChatAdmin')
        this.server.rcon.broadcast(text);
      else
        this.server.rcon.warn(info.player.eosID, text);
      this.verbose(1, `${info.player.name} ran !${this.options.command} in ${info.chat}`);
    }
    catch (err) {
      this.verbose(1, 'Exception in onChatCommand:', err);
    }
  }
}

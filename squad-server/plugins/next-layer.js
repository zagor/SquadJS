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
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);
    this.onChatCommand = this.onChatCommand.bind(this);
    this.onNewGame = this.onNewGame.bind(this);
    this.onRoundEnded = this.onRoundEnded.bind(this);
    this.broadcastTimer = undefined;
  }

  async mount() {
    this.server.on(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
    this.server.on('NEW_GAME', this.onNewGame);
    this.server.on('ROUND_ENDED', this.onRoundEnded);
    this.startMidGameTimer();
  }

  async unmount() {
    this.server.removeEventListener(`CHAT_COMMAND:${this.options.command}`, this.onChatCommand);
  }

  startMidGameTimer() {
    const now = new Date();
    let timer = this.server.matchStartTime;
    while (timer < now) {
      timer = new Date(timer.valueOf() + this.options.broadcast_interval * 60000);
    }
    const delay = timer - now;
    this.verbose(1, `First broadcast in ${Math.round(delay / 60000)} minutes.`);
    this.broadcastTimer = setTimeout(this.onTimerExpiry, delay, this);
  }

  startTimer() {
    const delay = this.options.broadcast_interval * 60000;
    this.broadcastTimer = setTimeout(this.onTimerExpiry, delay, this);
  }

  onNewGame() {
    if (this.options.on_seed || !this.server.currentLayer.name.includes('Seed'))
      this.startTimer();
    else
      this.verbose(1, "No broadcast during seed.");
  }

  onRoundEnded() {
    clearTimeout(this.broadcastTimer);
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

  async onTimerExpiry(obj) {
    const text = await obj.getLayerText();
    obj.verbose(1, "Timed broadcast");
    obj.server.rcon.broadcast(text);
    obj.startTimer();
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
